import express from "express";
import fetch from "node-fetch";
import cookieSession from "cookie-session";
import bodyParser from "body-parser"
import {getOctaneFromEnv} from "./OctaneSDK/octane-utilities";
import {Entity, FetchParameters, ReferenceEntity} from "./OctaneSDK/octane-scope";
import {getBranchNameFromPatternWithId} from "./Services/common-utilities";
import {convertBitbucketCloudRepoUrlToApiUrl} from "./Services/bitbucket-cloud-service";
import {OctaneWorkspace} from "./OctaneSDK/octane-workspace";
import {convertGithubCloudRepoUrlToApiUrl} from "./Services/github-cloud";
import {convertBitbucketServerRepoUrlToApiUrl} from "./Services/bitbucket-server-services";
import {Headers} from "got";

const urlencodedParser = bodyParser.urlencoded({extended: false});

const app = express();
app.use(
    cookieSession({
        secret: process.env.COOKIE_SECRET
    })
);


const githubCloudClientId = process.env.GITHUB_CLOUD_CLIENT_ID;
const githubCloudClientSecret = process.env.GITHUB_CLOUD_CLIENT_SECRET;

const bitbucketCloudClientId = process.env.BITBUCKET_CLOUD_CLIENT_ID;
const bitbucketCloudClientSecret = process.env.BITBUCKET_CLOUD_CLIENT_SECRET;


app.get("/login/bitbucket/cloud", (req, res) => {
    res.redirect(
        `https://bitbucket.org/site/oauth2/authorize?client_id=${bitbucketCloudClientId}&response_type=code`
    );
});

app.get("/login/github", (req, res) => {
    const redirectUri = req.protocol + "://" + req.get('host') + "/login/github/callback";
    res.redirect(
        `https://github.com/login/oauth/authorize?client_id=${githubCloudClientId}&redirect_uri=${redirectUri}&scope=repo`
    );
});

async function getBitbucketCloudAccessToken(code: string, clientId: string, clientSecret: string) {
    console.log("Fetching AccessToken");

    interface AccessTokenType {
        [key: string]: any;

        grant_type: string;
        code: string
    }

    const data: AccessTokenType = {
        grant_type: "authorization_code",
        code
    };
    const searchParams = Object.keys(data).map((key) => {
        return encodeURIComponent(key) + '=' + encodeURIComponent(data[key]);
    }).join('&');
    const credentials = Buffer.from(clientId + ":" + clientSecret);
    const base64Credentials = credentials.toString('base64');
    const request = await fetch("https://bitbucket.org/site/oauth2/access_token", {
        method: "POST",
        headers: {
            "Authorization": "basic " + base64Credentials,
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
        },
        body: searchParams
    });

    const response = await request.json();
    if (!request.ok || !response.hasOwnProperty("access_token")) {
        console.error(JSON.stringify(response));
        throw new Error("Request failed while getting the access token from Bitbucket Cloud:" + JSON.stringify(response));
    }
    return response.access_token;
}

async function getGithubCloudAccessToken(code: string, clientId: string, clientSecret: string) {
    console.log("Fetching AccessToken");
    const request = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code
        })
    });
    const response = await request.json();
    if (request.ok && response.hasOwnProperty("access_token")) {
        return response.access_token
    }
    throw new Error("Something went wrong while getting the Github Cloud Access Token: " + JSON.stringify(response))
}

async function createGitHubBranch(token: string, url: string, name: string, sha: string) {

    const ref = `refs/heads/${name}`
    console.log("sha:" + JSON.stringify(sha));
    const request = await fetch(`${url}/git/refs`, {
        method: "POST",
        headers: {
            Authorization: "token " + token
        },
        body: JSON.stringify({
            ref,
            sha
        })
    });
    const response = await request.json();
    if (request.ok) {
        return response;
    } else {
        throw new Error("Request to create a Github Cloud branch failed:" + JSON.stringify(response))
    }
}


async function createBitbucketCloudBranch(accessToken: string, repoUrl: string, branchName: string, hash: string) {
    const request = await fetch(`${repoUrl}/refs/branches`, {
        method: "POST",
        headers: {
            Authorization: "Bearer " + accessToken,
            "Content-Type": 'application/json',
        },
        body: JSON.stringify({
            name: branchName,
            target: {hash}
        })
    })
    return await request.json();
}

async function createBitbucketServerBranch(accessToken: string, repoUrl: string, branchName: string, startPoint: string) {
    const request = await fetch(`${repoUrl}/branches`, {
        method: "POST",
        headers: {
            Authorization: "Bearer " + accessToken,
            "Content-Type": 'application/json',
        },
        body: JSON.stringify({
            name: branchName,
            startPoint
        })
    })
    return await request.json();
}

async function getGithubCloudBranchPage(apiUrl: string, accessToken: string, page: number) {
    console.log("Getting Github Cloud branch page " + page);
    const branchesUrl = `${apiUrl}/branches?page=${page}`;
    const request = await fetch(branchesUrl, {
        headers: {
            Authorization: "token " + accessToken
        }
    });
    const response = await request.json()
    if (!request.ok) {
        throw new Error("Request to Github Cloud failed:" + JSON.stringify(response));
    }
    return response

}

async function getAllGithubBranches(accessToken: string, apiUrl: string): Promise<GithubBranches[]> {
    console.log("Getting git branches");
    let allBranches: GithubBranches[] = [];
    let page = 1;
    let githubCloudResponse
    do {
        githubCloudResponse = await getGithubCloudBranchPage(apiUrl, accessToken, page++);
        allBranches = allBranches.concat(githubCloudResponse);
    } while (githubCloudResponse.length > 0)

    if (allBranches.length > 0) {
        return allBranches
    } else {
        throw new Error(`No branches returned by Github Cloud using the ${apiUrl} base api. Please check that the repository has at least one branch.`)
    }
}

interface GithubCommit {
    sha: string,
    url: string
}

interface GithubBranches {
    name: string,
    commit: GithubCommit
}

interface BitbucketCloudCommit {
    hash: string
}

interface BitbucketCloudBranch {
    name: string,
    target: BitbucketCloudCommit
}

interface BitbucketServerBranch {
    displayId: string,
    id: string
}

async function getBitbucketCloudBranchPage(branchesUrl: string, accessToken: string): Promise<BitbucketCloudPagedResponse> {
    console.log("Getting bitbucket cloud branch page from:" + branchesUrl);
    const request = await fetch(branchesUrl, {
        headers: {
            Authorization: "Bearer " + accessToken
        }
    });
    const response = await request.json();

    if (!request.ok) {
        throw new Error("Request to Bitbucket Cloud failed:" + JSON.stringify(response));
    }
    if (response.hasOwnProperty("values")) {
        return response
    } else {
        throw new Error("No branches returned");
    }
}

interface BitbucketCloudPagedResponse {
    next?: string,
    values: []
}

async function getAllBitbucketCloudBranches(accessToken: string, apiUrl: string): Promise<BitbucketCloudBranch[]> {
    console.log("Getting git branches");
    let allBranches: BitbucketCloudBranch[] = [];
    const bitbucketServerGetLimit = Number(process.env.BITBUCKET_CLOUD_GET_LIMIT);
    const maxItemsInPage = Number.isNaN(bitbucketServerGetLimit) ? 100 : bitbucketServerGetLimit;
    const branchesUrl = `${apiUrl}/refs/branches?pagelen=${maxItemsInPage}`;
    let bitbucketCloudResponsePage: BitbucketCloudPagedResponse = {values: [], next: branchesUrl};
    do {
        bitbucketCloudResponsePage = await getBitbucketCloudBranchPage(bitbucketCloudResponsePage.next, accessToken);
        allBranches = allBranches.concat(bitbucketCloudResponsePage.values);
    } while (!!bitbucketCloudResponsePage.next)// while there is a next page

    if (allBranches.length > 0) {
        return allBranches
    } else {
        throw new Error(`No branches returned by Bitbucket Cloud using the ${apiUrl} base api. Please check that the repository has at least one branch.`)
    }
}


interface BitbucketServerPagedResponse {
    isLastPage: boolean,
    values: [],
    nextPageStart?: number
}

async function getBitbucketServerBranchPage(apiUrl: any, accessToken: any, limit: number, start: number): Promise<BitbucketServerPagedResponse> {
    console.log("Getting bitbucket server branch page from start:" + start);
    const branchesUrl = new URL(`${apiUrl}/branches`);
    const params = {limit: limit.toString(), start: start.toString()};
    branchesUrl.search = new URLSearchParams(params).toString()

    const request = await fetch(branchesUrl, {
        headers: {
            Authorization: "Bearer " + accessToken
        }
    });
    const response = await request.json();

    if (!request.ok) {
        throw new Error("Request to Bitbucket Server failed:" + JSON.stringify(response));
    }
    if (!response.hasOwnProperty("values")) {
        throw new Error("There was an error while getting the Bitbucket Server branches. No values returned:" + JSON.stringify(response))
    }
    if (!response.hasOwnProperty("isLastPage")) {
        throw new Error("There was an error while getting the Bitbucket Server branches. No 'isLastPage' value returned:" + JSON.stringify(response))
    } else {
        if (!response.isLastPage && !response.hasOwnProperty("nextPageStart")) {
            throw new Error("There was an error while getting the Bitbucket Server branches. No 'nextPage' value returned:" + JSON.stringify(response))
        }
    }

    return response
}

async function getAllBitbucketServerBranches(accessToken: any, apiUrl: any): Promise<BitbucketServerBranch[]> {
    console.log("Getting git branches");
    let allBranches: BitbucketServerBranch[] = [];
    const bitbucketServerGetLimit = Number(process.env.BITBUCKET_SERVER_GET_LIMIT);
    const maxItemsInPage = Number.isNaN(bitbucketServerGetLimit) ? 1000 : bitbucketServerGetLimit;
    let bitbucketServerResponsePage: BitbucketServerPagedResponse = {values: [], isLastPage: false, nextPageStart: 0};
    do {
        bitbucketServerResponsePage = await getBitbucketServerBranchPage(apiUrl, accessToken, maxItemsInPage, bitbucketServerResponsePage.nextPageStart);
        allBranches = allBranches.concat(bitbucketServerResponsePage.values);
    } while (!bitbucketServerResponsePage.isLastPage)


    if (allBranches.length > 0) {
        return allBranches
    } else {
        throw new Error(`No branches returned by Bitbucket Server using the ${apiUrl} base api. Please check that the repository has at least one branch.`)
    }
}

app.get("/login/bitbucket/server/callback", async (req, res) => {
    req.session.access_token = process.env.BITBUCKET_SERVER_PERSONAL_ACCESS_TOKEN;
    try {
        const allBranchesForRepo = await getAllBitbucketServerBranches(req.session.access_token, req.session.apiUrl)
        const selectMap = allBranchesForRepo.map(branch => {
            return {id: branch.id, text: branch.displayId}
        })
        respondWithBaseBranchForm(res, selectMap, req.session.branchName, "createBitbucketServerBranch")
    } catch (e) {
        sendErrorMessage(res, "Failed to get branches from Bitbucket Server", e)
    }

});

app.get("/login/bitbucket/cloud/callback", async (req, res) => {
    try {
        const code = req.query.code.toString();
        req.session.access_token = await getBitbucketCloudAccessToken(code, bitbucketCloudClientId, bitbucketCloudClientSecret);

        const allBranchesForRepo = await getAllBitbucketCloudBranches(req.session.access_token, req.session.apiUrl)
        const selectMap = allBranchesForRepo.map(branch => {
            return {id: branch.target.hash, text: branch.name}
        })
        const branchName = req.session.branchName;
        respondWithBaseBranchForm(res, selectMap, branchName, "createBitbucketCloudBranch")
    } catch (e) {
        sendErrorMessage(res, "Failed to get branches from Bitbucket Cloud", e)
    }
});

function respondWithBaseBranchForm<ResBody, Locals>(res: express.Response, selectBranchesList: { id: string; text: string; selected?: boolean }[], branchName: string, createBranchPath: string) {
    selectBranchesList[0].selected = true;
    res.send(
        `<html lang="en">` +
        `<head>` +
        getStyle() +
        `<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js"></script>` +
        `<link href="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css" rel="stylesheet" />` +
        `<script src="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js"></script>` +
        `<script>` +
        `$(document).ready(function(){` +
        `$("#sha").select2({data:${JSON.stringify(selectBranchesList)},
                            allowClear:false});` +
        `});` +
        `</script>` +
        `<title>Branch Creation</title></head>` +
        `<body>` +
        `<div class="banner">Create Branch</div><div class="content">` +
        `<form action=\"/${createBranchPath}\" method=\"post\">` +
        `<section><h2>Select the branch from which the new branch will be created</h2>` +
        `<select  style="width:25%" name="sha" id="sha"><option></option></select>` +
        "</section><section><h2>Verify the name of the new branch</h2>" +
        `<input class="textField" style='width: 100%' id=\"branch_name\" type=\"text\" name=\"branchName\" value=\"${branchName}\"><br>` +
        "<input type=\"submit\" value=\"OK\">" +
        "</section>" +
        "</div></form>"
    )
}

app.get("/login/github/callback", async (req, res) => {
    try {
        if (!!req.query.error || !req.query.code) {
            sendErrorMessage(res, "Failed to get the authentication code form Github Cloud", req.query)
            return
        }

        const code = req.query.code.toString();
        req.session.access_token = await getGithubCloudAccessToken(code, githubCloudClientId, githubCloudClientSecret);
        const allBranchesForRepo = await getAllGithubBranches(req.session.access_token, req.session.apiUrl)
        const selectBranchesList = allBranchesForRepo.map(branch => {
            return {id: branch.commit.sha, text: branch.name}
        })
        const branchName = req.session.branchName;
        respondWithBaseBranchForm(res, selectBranchesList, branchName, "createGithubBranch");
    } catch (e) {
        sendErrorMessage(res, "Failed to get branches from Github Cloud", e);
    }
});

function convertWorkItemSubtypeToPatternEntityType(subtype: string) {
    switch (subtype) {
        case "story":
            return "user_story";
        default:
            return subtype
    }
}


function createReposSelectRadios() {
    const splitAndTrim = (longString: string) => longString?.split(',').map((value) => value.trim());
    const bbCloudRepos = splitAndTrim(process.env.BITBUCKET_CLOUD_REPOSITORIES);
    const bbServerRepos = splitAndTrim(process.env.BITBUCKET_SERVER_REPOSITORIES);
    const ghCloudRepos = splitAndTrim(process.env.GITHUB_CLOUD_REPOSITORIES);

    let totalRepos = 0;
    let radios = '';

    bbCloudRepos?.forEach((url, index) => {
        if (url.length > 0) {
            radios += `<label class="container"  for=\"radio_bitbucket_cloud_${index}\">${url}` +
                `<input id=\"radio_bitbucket_cloud_${index}\" type=\"radio\" name=\"repo\" value="BITBUCKET_CLOUD_REPOSITORIES_${url}" ${totalRepos === 0 ? "checked=true" : ""} >` +
                `<span class="checkmark"></span></label><br>`
            totalRepos += 1
        }
    })

    bbServerRepos?.forEach((url, index) => {
        if (url.length > 0) {
            radios += `<label class="container"  for=\"radio_bitbucket_server_${index}\">${url} ` +
                `<input id=\"radio_bitbucket_server_${index}\" type=\"radio\" name=\"repo\" value="BITBUCKET_SERVER_REPOSITORIES_${url}" ${totalRepos === 0 ? "checked=true" : ""} >` +
                `<span class="checkmark"></label><br>`
            totalRepos += 1
        }
    })
    ghCloudRepos?.forEach((url, index) => {
        if (url.length > 0) {
            radios += `<label class="container"  for=\"radio_github_cloud_${index}\">${url} ` +
                `<input id=\"radio_github_cloud_${index}\" type=\"radio\" name=\"repo\" value="GITHUB_CLOUD_REPOSITORIES_${url}" ${totalRepos === 0 ? "checked=true" : ""} >` +
                `<span class="checkmark"></label><br>`
            totalRepos += 1
        }
    })
    return radios

}

app.get("/repo_select", async (req, res) => {
    try {
        const subtype = req.query.subtype.toString();
        const id = parseInt(req.query.entity_id.toString(), 10);
        const name = req.query.name.toString();
        const sharedSpaceId = parseInt(req.query.shared_space_id.toString(), 10);
        const workspaceId = parseInt(req.query.workspace_id.toString(), 10);
        req.session.entityId = id
        req.session.subtype = subtype
        req.session.name = name
        req.session.sharedSpaceId = sharedSpaceId
        req.session.workspaceId = workspaceId

        const patterns = await getOctaneScmPatternsForBranches(sharedSpaceId, workspaceId, convertWorkItemSubtypeToPatternEntityType(subtype));

        const branchRadios = createBranchSelectRadios(patterns.data)

        const repoRadios = createReposSelectRadios()

        res.send(
            getStyle() +
            `<div class="banner">Create Branch</div><div class="content">` +
            "<form action=\"/repo_selected\" method=\"post\">\n" +
            "<section><h2>Select the repository in which you want to create the branch</h2>" +
            repoRadios +
            "</section>" +
            "<section><h2>Select the pattern to use</h2>" +
            branchRadios +
            "    <input type=\"submit\" value=\"OK\">" +
            "</section>" +
            "</form></div>"
        )
    } catch (e) {
        sendErrorMessage(res, "Failed to get branch patterns from Octane", e)
    }
})

function createBranchSelectRadios(patterns: Entity[]): string {
    let radios = '';

    patterns.forEach((patternEntity, index) => {
        radios += `<label class="container" for=\"radio_${index}\">${patternEntity.pattern}` +
            `<input id=\"radio_${index}\" type=\"radio\" name=\"pattern_selection\" value="${patternEntity.pattern}" ${index === 0 ? "checked=true" : ""} >` +
            `<span class="checkmark"></span></label><br>`

    })

    return radios
}

app.post("/repo_selected", urlencodedParser, async (req, res) => {
    const branchName = getBranchNameFromPatternWithId(req.body.pattern_selection, req.session.entityId, req.session.name)
    const repo = req.body.repo;
    if (repo.startsWith("GITHUB_CLOUD_REPOSITORIES_")) {
        // create github branch
        const repoUrl = repo.replace("GITHUB_CLOUD_REPOSITORIES_", "");
        req.session.repoUrl = repoUrl
        req.session.apiUrl = convertGithubCloudRepoUrlToApiUrl(repoUrl)
        req.session.branchName = branchName;
        res.redirect("/login/github")
    } else if (repo.startsWith("BITBUCKET_SERVER_REPOSITORIES_")) {
        // creat bb server branch
        const repoUrl = repo.replace("BITBUCKET_SERVER_REPOSITORIES_", "")
        req.session.repoUrl = repoUrl
        req.session.apiUrl = convertBitbucketServerRepoUrlToApiUrl(repoUrl)
        req.session.branchName = branchName;
        res.redirect("/login/bitbucket/server/callback")
    } else if (repo.startsWith("BITBUCKET_CLOUD_REPOSITORIES_")) {
        // creat bb cloud branch
        const repoUrl = repo.replace("BITBUCKET_CLOUD_REPOSITORIES_", "");
        req.session.repoUrl = repoUrl
        req.session.apiUrl = convertBitbucketCloudRepoUrlToApiUrl(repoUrl);
        req.session.branchName = branchName;
        res.redirect("/login/bitbucket/cloud")
    }
    console.log(branchName);
    console.log(JSON.stringify(req.body))
})

function sendErrorMessage(res: express.Response, errorMessage: string, errorCause: any) {

    let additionalInformation = ""
    if (errorCause.hasOwnProperty("message")) {
        additionalInformation += errorCause.message + "<br><br>";
    }
    if (errorCause.hasOwnProperty("stack")) {
        additionalInformation += errorCause.stack + "<br><br>";
    }
    additionalInformation += JSON.stringify(errorCause);
    res.send(
        getStyle() +
        `<div class="banner">Create Branch</div>` +
        "<div class='error'><span class='errorMessage'>" +
        errorMessage +
        "</span><br><span class='errorCause'>" +
        "Additional information:<br>" + additionalInformation + "</span></div>")
}


async function getCreateBranchInOctaneResponse(req: express.Request, res: express.Response) {
    const entityCreateEntitiesResponse = await createOctaneBranch(req.session.sharedSpaceId, req.session.workspaceId, req.session.entityId, req.body.branchName, req.session.repoUrl);
    if (!entityCreateEntitiesResponse.errors) {
        res.send(getStyle() +
            `<div class="banner">Create Branch</div>` +
            `<div class="content successMessage"><span>Branch created successfully!</span></div>` +
            `</div><button class="close" onclick="window.close()">Close Window</button>`
        );
    } else {
        throw new Error("An error occurred while creating the branch in Octane:" + JSON.stringify(entityCreateEntitiesResponse.errors))
    }
}

app.post("/createGithubBranch", urlencodedParser, async (req, res) => {
    try {
        const branchResult = await createGitHubBranch(req.session.access_token, req.session.apiUrl, req.body.branchName, req.body.sha);
        console.log(JSON.stringify(branchResult))
        console.log("Branch created in the scm repository. Creating branch in Octane...")
        await getCreateBranchInOctaneResponse(req, res);
    } catch (e) {
        sendErrorMessage(res, "Failed to create the branch", e);
    }
})


app.post("/createBitbucketCloudBranch", urlencodedParser, async (req, res) => {
    try {
        const branchResult = await createBitbucketCloudBranch(req.session.access_token, req.session.apiUrl, req.body.branchName, req.body.sha);
        console.log(JSON.stringify(branchResult))
        console.log("Branch created in the scm repository. Creating branch in Octane...")
        await getCreateBranchInOctaneResponse(req, res);
    } catch (e) {
        sendErrorMessage(res, "Failed to create the branch", e);
    }
})

app.post("/createBitbucketServerBranch", urlencodedParser, async (req, res) => {
    try {
        const branchResult = await createBitbucketServerBranch(req.session.access_token, req.session.apiUrl, req.body.branchName, req.body.sha);
        console.log(JSON.stringify(branchResult))
        console.log("Branch created in the scm repository. Creating branch in Octane...")
        await getCreateBranchInOctaneResponse(req, res);
    } catch (e) {
        sendErrorMessage(res, "Failed to create the branch", e);
    }
})


async function createOctaneBranch(sharedSpaceId: number, workspaceId: number, workItemId: string, branchName: string, repoUrl: string) {
    // Usually, this header should not be used.
    const apiHeader: Headers = {'ALM-OCTANE-PRIVATE': "true"}
    const octaneSharedSpace = await getOctaneFromEnv(sharedSpaceId, apiHeader);
    const octaneWorkspace = octaneSharedSpace.workspace(workspaceId);
    const repository = await getOctaneRootRepository(octaneWorkspace, repoUrl);
    return await octaneWorkspace.createEntities("scm_repositories", [
        {
            name: branchName,
            repository,
            work_items: {
                data: [{
                    id: workItemId,
                    type: "work_item"
                }]
            }
        }
    ]);
}


async function createRootRepository(octaneWorkspace: OctaneWorkspace, repoUrl: string): Promise<ReferenceEntity> {
    const response = await octaneWorkspace.createEntities("scm_repository_roots", [{
        name: repoUrl,
        url: repoUrl,
        scm_type: 2
    }])
    if (response.total_count === 1) {
        console.log("Created root repository:" + JSON.stringify(response.data[0]))
        return response.data[0]
    }

    throw new Error("Failed to create root repository:" + JSON.stringify(response));
}

async function getOctaneRootRepository(octaneWorkspace: OctaneWorkspace, repoUrl: string): Promise<ReferenceEntity> {
    console.log("Getting root repository")
    const response = await octaneWorkspace.fetchCollection("scm_repository_roots", {
        query: `"(url EQ '${repoUrl}')"`
    })
    if (response.total_count === 1) {
        console.log("Found root repository:" + JSON.stringify(response.data[0]))
        return response.data[0];
    }

    if (response.total_count === 0) {
        console.log("Creating root repository")
        return createRootRepository(octaneWorkspace, repoUrl);
    }

    throw new Error("Failed to get root repository");
}

async function getOctaneScmPatternsForBranches(sharedSpaceId: number, workspaceId: number, entityType: string) {
    // Usually, this header should not be used. In this case, there is currently no other way of getting the scm patterns
    const apiHeader: Headers = {'ALM-OCTANE-PRIVATE': "true"}
    const octaneSharedSpace = await getOctaneFromEnv(sharedSpaceId, apiHeader);
    const octaneWorkspace = octaneSharedSpace.workspace(workspaceId);

    const queryParameters: FetchParameters = {
        fields: ["pattern", "entity_type", "applies_to"],
        query: "\"(" +
            `entity_type EQ {(id EQ 'list_node.scm_commit_pattern_entity_type.${entityType}')}` +
            ";" +
            "applies_to EQ {(id EQ 'list_node.commit_pattern.applies_to.branch')}" +
            ")\""
    }
    return octaneWorkspace.fetchCollection("scm_commit_patterns", queryParameters);
}

function getStyle() {
    return `<style>
/* The container */
.container {
  display: block;
  position: relative;
  padding-left: 35px;
  cursor: pointer;
  font-size: 16px;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
}

/* Hide the browser's default checkbox */
.container input {
  position: absolute;
  opacity: 0;
  cursor: pointer;
  height: 0;
  width: 0;
}

/* Create a custom checkbox */
.checkmark {
  position: absolute;
  top: 0;
  left: 0;
  height: 20px;
  width: 20px;
  background-color: #eee;
}

/* On mouse-over, add a grey background color */
.container:hover input ~ .checkmark {
  background-color: #ccc;
}

/* When the checkbox is checked, add a blue background */
.container input:checked ~ .checkmark {
  background-color: #2196F3;
}

/* Create the checkmark/indicator (hidden when not checked) */
.checkmark:after {
  content: "";
  position: absolute;
  display: none;
}

/* Show the checkmark when checked */
.container input:checked ~ .checkmark:after {
  display: block;
}

/* Style the checkmark/indicator */
.container .checkmark:after {
  left: 6px;
  top: 3px;
  width: 4px;
  height: 9px;
  border: solid white;
  border-width: 0 3px 3px 0;
  -webkit-transform: rotate(45deg);
  -ms-transform: rotate(45deg);
  transform: rotate(45deg);
}

body{
color: #555;
font-family: Roboto,Arial,sans-serif;
background: #f6f6f6;
    padding: 0;
    margin: 0;
}

h2{
color: #222;
margin-top: 0;
}
section{
margin-bottom: 25px;
padding: 15px;
}

div.content{
padding: 15px;
background: #fff;
width: 60%;
margin: 20px auto auto;
border: 1px solid #ddd;
}

div.banner{
    background-color: #0079ef;
    color: #fff;
    width: 100%;
    text-align: center;
    font-size: 30px;
    font-weight: 600;
    margin: 0;
    padding: 10px;
}

div.successMessage{
color:green;
background-color: lightgreen;
padding: 10px 200px;
width: fit-content;
text-align: center;
}

button.close{
       background: #0073e7;
    color: white;
    border: 2px solid #0073e7;
    font-size: 16px;
    padding: 0 10px;
    cursor: pointer;
    font-weight: 700;
    border-radius: 3px;
    width: 10%;
    position: absolute;
    left: 50%;
    -ms-transform: translateX(-50%);
    transform: translateX(-50%);
    margin-top: 30px;

}

input[type=submit]{
    background: #0073e7;
    color: white;
    border: 2px solid #0073e7;
    font-size: 16px;
    padding: 0 10px;
    cursor: pointer;
    font-weight: 700;
    border-radius: 3px;
}

input.textField{
    border: 1px solid #ddd;
    margin: 20px 0 20px;
    padding: 3px;
    color: #555;
    font-size: 17px;
}


</style>`
}


const PORT = process.env.PORT || 9000;
app.listen(PORT, () => console.log("Listening on localhost:" + PORT));
