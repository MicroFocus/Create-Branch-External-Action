import express from "express";
import fetch from "node-fetch";
import cookieSession from "cookie-session";
import bodyParser from "body-parser"
import {getOctaneFromEnv} from "./OctaneSDK/octane-utilities";
import {Entity, FetchParameters, ReferenceEntity} from "./OctaneSDK/octane-scope";
import {newVar} from "./Services/test-handlers";
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
    const credentials = Buffer.from(clientId+":"+clientSecret);
    const base64Credentials = credentials.toString('base64');
    const request = await fetch("https://bitbucket.org/site/oauth2/access_token", {
        method: "POST",
        headers: {
            "Authorization":"basic "+ base64Credentials,
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
        },
        body: searchParams
    });

    const response = await request.json();
    if(response.hasOwnProperty("error")){
        console.error(JSON.stringify(response));
        throw response;
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
    if(response.hasOwnProperty("access_token")){
        return response.access_token
    }
    throw new Error("Something went wrong while getting the Github Cloud Access Token: "+ JSON.stringify(response))
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


async function createBitbucketCloudBranch(accessToken: string, repoUrl: string, branchName:string, hash:string) {
    const request = await fetch(`${repoUrl}/refs/branches`,{
        method:"POST",
        headers:{
            Authorization: "Bearer " + accessToken,
            "Content-Type": 'application/json',
        },
        body:JSON.stringify({
            name: branchName,
            target:{hash}
        })
    })
    return await request.json();
}

async function createBitbucketServerBranch(accessToken: string, repoUrl: string, branchName:string, startPoint:string) {
    const request = await fetch(`${repoUrl}/branches`,{
        method:"POST",
        headers:{
            Authorization: "Bearer " + accessToken,
            "Content-Type": 'application/json',
        },
        body:JSON.stringify({
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

interface BitbucketCloudCommit{
    hash:string
}

interface BitBucketCloudBranch{
    name:string,
    target: BitbucketCloudCommit
}

interface BitbucketServerBranch{
    displayId:string,
    id: string
}


function getBitbucketCloudBranchRadios(allBranchesForRepo: BitBucketCloudBranch[]) {
    let radios = ''

    console.log()

    allBranchesForRepo.forEach((branch, index) => {
        radios += `<input id=\"radio_${index}\" type=\"radio\" name=\"sha\" value="${branch.target.hash}" ${branch.name === "master" ? "checked=true" : ""} >` +
            `<label for=\"radio_${index}\">${branch.name} </label><br>`

    })
    return radios
}

function getGithubBranchRadios(allBranchesForRepo: GithubBranches[]) {
    let radios = ''

    console.log()

    allBranchesForRepo.forEach((branch, index) => {
        radios += `<input id=\"radio_${index}\" type=\"radio\" name=\"sha\" value="${branch.commit.sha}" ${branch.name === "master" ? "checked=true" : ""} >` +
            `<label for=\"radio_${index}\">${branch.name} </label><br>`

    })
    return radios
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


async function getAllBitbucketServerBranches(accessToken: any, apiUrl: any) {
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

function getBitbucketServerBranchRadios(allBranchesForRepo: BitbucketServerBranch[]) {
    let radios = ''

    console.log()

    allBranchesForRepo.forEach((branch, index) => {
        radios += `<input id=\"radio_${index}\" type=\"radio\" name=\"sha\" value="${branch.id}" ${branch.displayId === "master" ? "checked=true" : ""} >` +
            `<label for=\"radio_${index}\">${branch.displayId} </label><br>`

    })
    return radios

}

app.get("/login/bitbucket/server/callback", async (req, res) => {
    req.session.access_token = process.env.BITBUCKET_SERVER_PERSONAL_ACCESS_TOKEN;

    const allBranchesForRepo = await getAllBitbucketServerBranches(req.session.access_token, req.session.apiUrl)
    const radioBranches = getBitbucketServerBranchRadios(allBranchesForRepo);

    res.send(
        "<form action=\"/createBitbucketServerBranch\" method=\"post\">" +
        "<section><h2>Select the branch from which the new branch will be created</h2>" +
        radioBranches +
        "</section><section><h2>Verify the name of the new branch</h2>" +
        "<label for=\"branch_name\">Name of the new branch: </label>\n" +
        `    <input style='width: 100%' id=\"branch_name\" type=\"text\" name=\"branchName\" value=\"${req.session.branchName}\"><br>` +
        "    <input type=\"submit\" value=\"OK\">" +
        "</section>"+
        "</form>"
    )

});


app.get("/login/bitbucket/cloud/callback", async (req, res) => {
    const code = req.query.code.toString();
    req.session.access_token = await getBitbucketCloudAccessToken(code, bitbucketCloudClientId, bitbucketCloudClientSecret);

    const allBranchesForRepo = await getAllBitbucketCloudBranches(req.session.access_token, req.session.apiUrl)
    const radioBranches = getBitbucketCloudBranchRadios(allBranchesForRepo);

    res.send(
        "<form action=\"/createBitbucketCloudBranch\" method=\"post\">" +
        "<section><h2>Select the branch from which the new branch will be created</h2>" +
        radioBranches +
        "</section><section><h2>Verify the name of the new branch</h2>" +
        "<label for=\"branch_name\">Name of the new branch: </label>\n" +
        `    <input style='width: 100%' id=\"branch_name\" type=\"text\" name=\"branchName\" value=\"${req.session.branchName}\"><br>` +
        "    <input type=\"submit\" value=\"OK\">" +
        "</section>"+
        "</form>"
    )

});

app.get("/login/github/callback", async (req, res) => {
    const code = req.query.code.toString();
    req.session.access_token = await getGithubCloudAccessToken(code, githubCloudClientId, githubCloudClientSecret);

    const allBranchesForRepo = await getAllGithubBranches(req.session.access_token, req.session.apiUrl)

    const radioBranches = getGithubBranchRadios(allBranchesForRepo);

    res.send(
        "<form action=\"/createGithubBranch\" method=\"post\">" +
        "<section><h2>Select the branch from which the new branch will be created</h2>" +
        radioBranches +
        "</section><section><h2>Verify the name of the new branch</h2>" +
        "<label for=\"branch_name\">Name of the new branch: </label>\n" +
        `    <input style='width: 100%' id=\"branch_name\" type=\"text\" name=\"branchName\" value=\"${req.session.branchName}\"><br>` +
        "    <input type=\"submit\" value=\"OK\">" +
        "</section>" +
        "</form>"
    )

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
        radios += `<input id=\"radio_bitbucket_cloud_${index}\" type=\"radio\" name=\"repo\" value="BITBUCKET_CLOUD_REPOSITORIES_${url}" ${totalRepos === 0 ? "checked=true" : ""} >` +
            `<label for=\"radio_bitbucket_cloud_${index}\">${url} </label><br>`
        totalRepos += 1
    })

    bbServerUrls.forEach((url, index) => {
        radios += `<input id=\"radio_bitbucket_server_${index}\" type=\"radio\" name=\"repo\" value="BITBUCKET_SERVER_BASE_URLS_${url}" ${totalRepos === 0 ? "checked=true" : ""} >` +
            `<label for=\"radio_bitbucket_server_${index}\">${url} </label><br>`
        totalRepos += 1
    })

    ghCloudRepos.forEach((url, index) => {
        radios += `<input id=\"radio_github_cloud_${index}\" type=\"radio\" name=\"repo\" value="GITHUB_CLOUD_REPOSITORIES_${url}" ${totalRepos === 0 ? "checked=true" : ""} >` +
            `<label for=\"radio_github_cloud_${index}\">${url} </label><br>`
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
    req.session.sharedSpaceId=sharedSpaceId
    req.session.workspaceId=workspaceId

    const patterns = await getOctaneScmPatternsForBranches(sharedSpaceId, workspaceId, convertWorkItemSubtypeToPatternEntityType(subtype));

    const branchRadios = createBranchSelectRadios(patterns.data)

    const repoRadios = createReposSelectRadios()

    res.send(
        "<form action=\"/repo_selected\" method=\"post\">\n" +
        "<section><h2>Select the repo in which you want to create the branch</h2>" +
        repoRadios +
        "</section>" +
        "<section><h2>Select the pattern to use</h2>" +
        branchRadios +
        "</section>" +
        "    <input type=\"submit\" value=\"OK\">" +
        "</form>"
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
        radios += `<input id=\"radio_${index}\" type=\"radio\" name=\"pattern_selection\" value="${patternEntity.pattern}" ${index === 0 ? "checked=true" : ""} >` +
            `<label for=\"radio_${index}\">${patternEntity.pattern} </label><br>`

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
    console.log(JSON.stringify(branchResult))

    if (branchResult.hasOwnProperty("error")) {// todo fix check
        res.send("Something went wrong... " + JSON.stringify(branchResult))
        return
    }
    console.log("Branch created in Github Cloud. Creating branch in Octane...")
    const entityCreateEntitiesResponse = await createOctaneBranches(req.session.sharedSpaceId, req.session.workspaceId,req.session.entityId, req.body.branchName, req.session.repoUrl);
    req.session = null;
    if (!!entityCreateEntitiesResponse.errors) {
        res.send("An error occurred while creating the branch in Octane:" + JSON.stringify(entityCreateEntitiesResponse.errors))
    } else {
        res.send("Branch created successfully");
    }
})


app.post("/createBitbucketCloudBranch", urlencodedParser, async (req, res) => {
    const branchResult = await createBitbucketCloudBranch(req.session.access_token, req.session.apiUrl, req.body.branchName, req.body.sha);
    console.log(JSON.stringify(branchResult))
    if (branchResult.hasOwnProperty("error")) {
        req.session = null;
        res.send("Something went wrong:" +JSON.stringify(branchResult))
        return
    }
    console.log("Branch created in Bitbucket Cloud. Creating branch in Octane...")
    const entityCreateEntitiesResponse = await createOctaneBranches(req.session.sharedSpaceId, req.session.workspaceId,req.session.entityId, req.body.branchName, req.session.repoUrl);
    if (!!entityCreateEntitiesResponse.errors) {
        res.send("An error occurred while creating the branch in Octane:" + JSON.stringify(entityCreateEntitiesResponse.errors))
    } else {
        res.send("Branch created successfully");
    }
})

app.post("/createBitbucketServerBranch", urlencodedParser, async (req, res) => {
    const branchResult = await createBitbucketServerBranch(req.session.access_token, req.session.apiUrl, req.body.branchName, req.body.sha);
    console.log(JSON.stringify(branchResult))
    if (branchResult.hasOwnProperty("error")) {
        req.session = null;
        res.send("Something went wrong:" +JSON.stringify(branchResult))
        return
    }
    console.log("Branch created in Bitbucket Server. Creating branch in Octane...")
    const entityCreateEntitiesResponse = await createOctaneBranches(req.session.sharedSpaceId, req.session.workspaceId,req.session.entityId, req.body.branchName, req.session.repoUrl);
    if (!!entityCreateEntitiesResponse.errors) {
        res.send("An error occurred while creating the branch in Octane:" + JSON.stringify(entityCreateEntitiesResponse.errors))
    } else {
        res.send("Branch created successfully");
    }
})

// app.post("/create/branch", urlencodedParser, newVar)

async function createOctaneBranches(sharedSpaceId: number, workspaceId: number, workItemId: string, branchName:string, repoUrl:string) {
    const octaneSharedSpace = await getOctaneFromEnv(sharedSpaceId);
    const octaneWorkspace = octaneSharedSpace.workspace(workspaceId);
    const repository= await getOctaneRootRepository(octaneWorkspace,repoUrl);
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


async function createRootRepository(octaneWorkspace: OctaneWorkspace, repoUrl: string):Promise<ReferenceEntity> {
    const response = await octaneWorkspace.createEntities("scm_repository_roots",[{
        name:repoUrl,
        url:repoUrl,
        scm_type:2
    }])
    if(response.total_count === 1){
        console.log("Created root repository:"+ JSON.stringify(response.data[0]))
        return response.data[0]
    }

    throw new Error("Failed to create root repository");
}

async function getOctaneRootRepository(octaneWorkspace: OctaneWorkspace, repoUrl: string):Promise<ReferenceEntity> {
    console.log("Getting root repository")
    const response = await octaneWorkspace.fetchCollection("scm_repository_roots",{
        query:`"(url EQ '${repoUrl}')"`
    })
    if(response.total_count === 1) {
        console.log("Found root repository:"+JSON.stringify(response.data[0]))
        return response.data[0];
    }

    if(response.total_count === 0){
        console.log("Creating root repository")
        return createRootRepository(octaneWorkspace,repoUrl);
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

const PORT = process.env.PORT || 9000;
app.listen(PORT, () => console.log("Listening on localhost:" + PORT));
