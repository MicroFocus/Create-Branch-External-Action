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
const thisServerUrl = "http://localhost:9000";


app.get("/login/bitbucket/cloud", (req, res) => {
    res.redirect(
        `https://bitbucket.org/site/oauth2/authorize?client_id=${bitbucketCloudClientId}&response_type=code`
    );
});

app.get("/login/github", (req, res) => {
    const redirectUri = thisServerUrl + "/login/github/callback";
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
    if (hasError(response)) {
        console.error(JSON.stringify(response));
        throw response;
    }
    return response.access_token;
}

function hasError(variable: any) {
    return variable.hasOwnProperty("error") || variable.hasOwnProperty("errors")
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
    if (response.hasOwnProperty("access_token")) {
        return response.access_token
    }
    throw new Error("Something went wrong while getting the Github Cloud Access Token: " + JSON.stringify(response))
    // const params = new URLSearchParams(text);
    // return params.get("access_token");
}

async function createGitHubBranch(token: string, url: string, name: string, sha: string) {

    const ref = `refs/heads/${name}`
    // const shaP = await getSha(token, url, branch);
    // const sha = shaP.object.sha
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
    return await request.json();
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

async function getAllGithubBranches(accessToken: string, repoUrl: string): Promise<GithubBranches[]> {
    console.log("Getting git branches");
    const branchesUrl = `${repoUrl}/branches`;
    const request = await fetch(branchesUrl, {
        headers: {
            Authorization: "token " + accessToken
        }
    });// todo get all branches ?
    return await request.json()
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

interface BitBucketCloudBranch {
    name: string,
    target: BitbucketCloudCommit
}

interface BitbucketServerBranch {
    displayId: string,
    id: string
}

async function getAllBitbucketCloudBranches(accessToken: string, apiUrl: string): Promise<BitBucketCloudBranch[]> {
    console.log("Getting git branches");
    const branchesUrl = `${apiUrl}/refs/branches`;
    const request = await fetch(branchesUrl, {
        headers: {
            Authorization: "Bearer " + accessToken
        }
    });// todo get all branches ?
    const response = await request.json();
    return response.values
}


async function getAllBitbucketServerBranches(accessToken: any, apiUrl: any): Promise<BitbucketServerBranch[]> {
    console.log("Getting git branches");
    const branchesUrl = `${apiUrl}/branches`;
    const request = await fetch(branchesUrl, {
        headers: {
            Authorization: "Bearer " + accessToken
        }
    });// todo get all branches ?
    const response = await request.json();
    return response.values

}

app.get("/login/bitbucket/server/callback", async (req, res) => {
    req.session.access_token = process.env.BITBUCKET_SERVER_PERSONAL_ACCESS_TOKEN;

    const allBranchesForRepo = await getAllBitbucketServerBranches(req.session.access_token, req.session.apiUrl)
    const selectMap = allBranchesForRepo.map(branch => {
        return {id: branch.id, text: branch.displayId}
    })// getBitbucketServerBranchRadios(allBranchesForRepo); todo del

    respondWithBaseBranchForm(res, selectMap, req.session.branchName, "createBitbucketServerBranch")
    // res.send(
    //     "<form action=\"/createBitbucketServerBranch\" method=\"post\">" +
    //     "<section><h2>Select the branch from which the new branch will be created</h2>" +
    //     radioBranches +
    //     "</section><section><h2>Verify the name of the new branch</h2>" +
    //     "<label for=\"branch_name\">Name of the new branch: </label>\n" +
    //     `    <input style='width: 100%' id=\"branch_name\" type=\"text\" name=\"branchName\" value=\"${branchName}\"><br>` +
    //     "    <input type=\"submit\" value=\"OK\">" +
    //     "</section>" +
    //     "</form>"
    // )

});// todo handle no branch selected


app.get("/login/bitbucket/cloud/callback", async (req, res) => {
    const code = req.query.code.toString();
    req.session.access_token = await getBitbucketCloudAccessToken(code, bitbucketCloudClientId, bitbucketCloudClientSecret);

    const allBranchesForRepo = await getAllBitbucketCloudBranches(req.session.access_token, req.session.apiUrl)
    const selectMap = allBranchesForRepo.map(branch => {
        return {id: branch.target.hash, text: branch.name}
    })// getBitbucketCloudBranchSelect(allBranchesForRepo);
    const branchName = req.session.branchName;
    respondWithBaseBranchForm(res, selectMap, branchName, "createBitbucketCloudBranch")
    // res.send(
    //     "<form action=\"/createBitbucketCloudBranch\" method=\"post\">" +
    //     "<section><h2>Select the branch from which the new branch will be created</h2>" +
    //     selectMap +
    //     "</section><section><h2>Verify the name of the new branch</h2>" +
    //     "<label for=\"branch_name\">Name of the new branch: </label>\n" +
    //     `    <input style='width: 100%' id=\"branch_name\" type=\"text\" name=\"branchName\" value=\"${branchName}\"><br>` +
    //     "    <input type=\"submit\" value=\"OK\">" +
    //     "</section>" +
    //     "</form>"
    // )

});

function respondWithBaseBranchForm<ResBody, Locals>(res: express.Response, selectBranchesList: { id: string; text: string }[], branchName: string, createBranchPath: string) {
    res.send(
        `<html lang="en">` +
        `<head>` +
        getStyle() +
        `<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js"></script>` +
        `<link href="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css" rel="stylesheet" />` +
        `<script src="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js"></script>` +
        `<script>` +
        `$(document).ready(function(){` +
        `$("#sha").select2({data:${JSON.stringify(selectBranchesList)}});` +
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
    const code = req.query.code.toString();
    req.session.access_token = await getGithubCloudAccessToken(code, githubCloudClientId, githubCloudClientSecret);
    const allBranchesForRepo = await getAllGithubBranches(req.session.access_token, req.session.apiUrl)
    const selectBranchesList = allBranchesForRepo.map(branch => {
        return {id: branch.commit.sha, text: branch.name}
    })// getGithubBranchRadios(allBranchesForRepo);
    const branchName = req.session.branchName;
    respondWithBaseBranchForm(res, selectBranchesList, branchName, "createGithubBranch");

});


// app.get("/login/github/callback2", async (req, res) => {
//     const code = req.query.code.toString();
//     const accessToken = await getGithubCloudAccessToken(code, githubCloudClientId, githubCloudClientSecret);
//     const user = await fetchGitHubUser(accessToken);
//     if (user) {
//         req.session.access_token = accessToken;
//         req.session.githubId = user.id;
//         res.send("Hi " + JSON.stringify(user.login) +
//             "<form action=\"/create/branch\" method=\"post\">\n" +
//             "    <label for=\"branch_name\">Enter name: </label>\n" +
//             "    <input id=\"branch_name\" type=\"text\" name=\"name\">\n" +
//             "    <input type=\"submit\" value=\"OK\">\n" +
//             "</form>")
//         console.log("callback:" + accessToken);
//     } else {
//         res.send("Login did not succeed!");
//     }
// });

function convertWorkItemSubtypeToPatternEntityType(subtype: string) {
    switch (subtype) {
        case "story":
            return "user_story";
        default:
            return subtype
    }
}


function createReposSelectRadios() {
    const splitAndTrim = (longString: string) => longString.split(',').map((value) => value.trim());
    const bbCloudRepos = splitAndTrim(process.env.BITBUCKET_CLOUD_REPOSITORIES);
    const bbServerUrls = splitAndTrim(process.env.BITBUCKET_SERVER_BASE_URLS);
    const ghCloudRepos = splitAndTrim(process.env.GITHUB_CLOUD_REPOSITORIES);

    let totalRepos = 0;
    let radios = '';

    bbCloudRepos.forEach((url, index) => {
        radios += `<label class="container"  for=\"radio_bitbucket_cloud_${index}\">${url}` +
            `<input id=\"radio_bitbucket_cloud_${index}\" type=\"radio\" name=\"repo\" value="BITBUCKET_CLOUD_REPOSITORIES_${url}" ${totalRepos === 0 ? "checked=true" : ""} >` +
            `<span class="checkmark"></span></label><br>`
        totalRepos += 1
    })

    bbServerUrls.forEach((url, index) => {
        radios += `<label class="container"  for=\"radio_bitbucket_server_${index}\">${url} ` +
            `<input id=\"radio_bitbucket_server_${index}\" type=\"radio\" name=\"repo\" value="BITBUCKET_SERVER_BASE_URLS_${url}" ${totalRepos === 0 ? "checked=true" : ""} >` +
            `<span class="checkmark"></label><br>`
        totalRepos += 1
    })

    ghCloudRepos.forEach((url, index) => {
        radios += `<label class="container"  for=\"radio_github_cloud_${index}\">${url} ` +
            `<input id=\"radio_github_cloud_${index}\" type=\"radio\" name=\"repo\" value="GITHUB_CLOUD_REPOSITORIES_${url}" ${totalRepos === 0 ? "checked=true" : ""} >` +
            `<span class="checkmark"></label><br>`
        totalRepos += 1
    })

    return radios

}

app.get("/repo_select", async (req, res) => {
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
        "<section><h2>Select the repo in which you want to create the branch</h2>" +
        repoRadios +
        "</section>" +
        "<section><h2>Select the pattern to use</h2>" +
        branchRadios +
        "    <input type=\"submit\" value=\"OK\">" +
        "</section>" +
        "</form></div>"
    )

    // if (patterns.total_count === 1) {
    //     res.send(getBranchNameFromPatternWithId(patterns.data[0].pattern.toString(), id, name))
    // } else if (patterns.total_count > 1) {
    //     res.send(createBranchSelectRadios(patterns.data));
    // } else {
    //     res.send("No pattern was found");
    // }


    // res.send(req.session.entityId+" "  +req.session.subtype+" "+ req.session.entity_name);

})

function createBranchSelectRadios(patterns: Entity[]): string {
    let radios = '';

    patterns.forEach((patternEntity, index) => {
        radios += `<label class="container" for=\"radio_${index}\">${patternEntity.pattern}` +
            `<input id=\"radio_${index}\" type=\"radio\" name=\"pattern_selection\" value="${patternEntity.pattern}" ${index === 0 ? "checked=true" : ""} >` +
            `<span class="checkmark"></span></label><br>`

    })

    return radios

    // return "<h2>More than one pattern was found. Select the pattern you want to use:</h2>" +
    //     "<form action=\"/pattern_selection\" method=\"post\">\n" +
    //     radios +
    //     "    <input type=\"submit\" value=\"OK\">" +
    //     "</form>";
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
    } else if (repo.startsWith("BITBUCKET_SERVER_BASE_URLS_")) {
        // creat bb server branch
        const repoUrl = repo.replace("BITBUCKET_SERVER_BASE_URLS_", "")
        req.session.repoUrl = repoUrl
        req.session.apiUrl = convertBitbucketServerRepoUrlToApiUrl(repoUrl)
        req.session.branchName = branchName;
        res.redirect("/login/bitbucket/server/callback")
        // req.session = null
        // res.redirect(`${url}/plugins/servlet/create-branch?issueSummary=${branchName}`)
    } else if (repo.startsWith("BITBUCKET_CLOUD_REPOSITORIES_")) {
        // creat bb cloud branch
        const repoUrl = repo.replace("BITBUCKET_CLOUD_REPOSITORIES_", "");
        req.session.repoUrl = repoUrl
        req.session.apiUrl = convertBitbucketCloudRepoUrlToApiUrl(repoUrl);
        req.session.branchName = branchName;
        res.redirect("/login/bitbucket/cloud")
        // const url = repo.replace("BITBUCKET_CLOUD_REPOSITORIES_", "")
        // req.session = null
        // res.redirect(`${url}/branch?issueSummary=${branchName}`)
    }
    console.log(branchName);
    console.log(JSON.stringify(req.body))
})

app.post("/createGithubBranch", urlencodedParser, async (req, res) => {
    const branchResult = await createGitHubBranch(req.session.access_token, req.session.apiUrl, req.body.branchName, req.body.sha);
    await createBranchInOctane(branchResult, req, res)
})


async function createBranchInOctane(branchResult: any, req: express.Request, res: express.Response) {
    console.log(JSON.stringify(branchResult))
    if (hasError(branchResult)) {
        res.send("Something went wrong:" + JSON.stringify(branchResult))
        return
    }
    console.log("Branch created in the scm repository. Creating branch in Octane...")
    const entityCreateEntitiesResponse = await createOctaneBranches(req.session.sharedSpaceId, req.session.workspaceId, req.session.entityId, req.body.branchName, req.session.repoUrl);
    if (!!entityCreateEntitiesResponse.errors) {
        res.send("An error occurred while creating the branch in Octane:" + JSON.stringify(entityCreateEntitiesResponse.errors))
    } else {
        res.send(getStyle() +
            `<div class="banner">Create Branch</div>` +
            `<div class="content successMessage"><span>Branch created successfully!</span></div>` +
            `</div><button class="close" onclick="window.close()">Close Window</button>`
        );
    }
}

app.post("/createBitbucketCloudBranch", urlencodedParser, async (req, res) => {
    const branchResult = await createBitbucketCloudBranch(req.session.access_token, req.session.apiUrl, req.body.branchName, req.body.sha);
    await createBranchInOctane(branchResult, req, res);
})

app.post("/createBitbucketServerBranch", urlencodedParser, async (req, res) => {
    const branchResult = await createBitbucketServerBranch(req.session.access_token, req.session.apiUrl, req.body.branchName, req.body.sha);
    await createBranchInOctane(branchResult, req, res);
})

// app.post("/create/branch", urlencodedParser, newVar)

async function createOctaneBranches(sharedSpaceId: number, workspaceId: number, workItemId: string, branchName: string, repoUrl: string) {
    const octaneSharedSpace = await getOctaneFromEnv(sharedSpaceId);
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

    throw new Error("Failed to create root repository");
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
    const octaneSharedSpace = await getOctaneFromEnv(sharedSpaceId);
    const octaneWorkspace = octaneSharedSpace.workspace(workspaceId);

    const queryParameters: FetchParameters = {
        fields: ["pattern", "entity_type", "applies_to"],
        query: "\"(" +
            `entity_type EQ {(id EQ 'list_node.scm_commit_pattern_entity_type.${entityType}')}` +
            ";" +
            "applies_to EQ {(id EQ 'list_node.commit_pattern.applies_to.branch')}" +
            ")\""
    }

    try {
        return octaneWorkspace.fetchCollection("scm_commit_patterns", queryParameters);
    } catch (e) {
        console.log(JSON.stringify(e))
    }
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
