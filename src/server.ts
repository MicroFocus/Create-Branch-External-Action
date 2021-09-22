/*!
 * © Copyright 2021 Micro Focus or one of its affiliates.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import express from "express";
import cookieSession from "cookie-session";
import bodyParser from "body-parser"
import {Entity} from "./OctaneSDK/octane-scope";
import {getBranchNameFromPatternWithId} from "./Services/common-utilities";
import {
    convertBitbucketCloudRepoUrlToApiUrl,
    createBitbucketCloudBranch,
    getAllBitbucketCloudBranches,
    getBitbucketCloudAccessToken
} from "./Services/bitbucket-cloud-service";
import {
    convertGithubCloudRepoUrlToApiUrl,
    createGitHubCloudBranch,
    getAllGithubCloudBranches,
    getGithubCloudAccessToken
} from "./Services/github-cloud-services";
import {
    convertBitbucketServerRepoUrlToApiUrl,
    createBitbucketServerBranch,
    getAllBitbucketServerBranches
} from "./Services/bitbucket-server-services";
import {createOctaneBranch, getOctaneScmPatternsForBranches} from "./Services/octane-services";

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

const doesOctaneSupportBranches = process.env.DOES_OCTANE_SUPPORT_BRANCHES === "true";

/**
 * Endpoint for starting the Bitbucket Cloud Oauth Login
 */
app.get("/login/bitbucket/cloud", (req, res) => {
    res.redirect(
        `https://bitbucket.org/site/oauth2/authorize?client_id=${bitbucketCloudClientId}&response_type=code`
    );
});

/**
 * Endpoint for starting the Github Cloud Oauth Login
 */
app.get("/login/github/cloud", (req, res) => {
    const redirectUri = req.protocol + "://" + req.get('host') + "/login/github/cloud/callback";
    res.redirect(
        `https://github.com/login/oauth/authorize?client_id=${githubCloudClientId}&redirect_uri=${redirectUri}&scope=repo`
    );
});

/**
 * Endpoint for getting the Bitbucket Server base branch and validating the name of the new branch
 *
 * The following request session variables are expected to be set:
 * req.session.apiUrl - the base url for rest requests
 * req.session.branchName - the name of the new branch
 */
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

/**
 * Endpoint for the Bitbucket Cloud Oauth redirect
 * This will get the Bitbucket Cloud base branch and validating the name of the new branch
 *
 * The following request session variables are expected to be set:
 * req.session.apiUrl - the base url for rest requests
 * req.session.branchName - the name of the new branch
 */
app.get("/login/bitbucket/cloud/callback", async (req, res) => {
    try {
        if (!!req.query.error || !req.query.code) {
            sendErrorMessage(res, "Failed to get the authentication code form Bitbucket Cloud", req.query)
            return
        }

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

/**
 * Endpoint for the Github Cloud Oauth redirect
 * This will get the Github Cloud base branch and validating the name of the new branch
 *
 * The following request session variables are expected to be set:
 * req.session.apiUrl - the base url for rest requests
 * req.session.branchName - the name of the new branch
 */
app.get("/login/github/cloud/callback", async (req, res) => {
    try {
        if (!!req.query.error || !req.query.code) {
            sendErrorMessage(res, "Failed to get the authentication code form Github Cloud", req.query)
            return
        }

        const code = req.query.code.toString();
        req.session.access_token = await getGithubCloudAccessToken(code, githubCloudClientId, githubCloudClientSecret);
        const allBranchesForRepo = await getAllGithubCloudBranches(req.session.access_token, req.session.apiUrl)
        const selectBranchesList = allBranchesForRepo.map(branch => {
            return {id: branch.commit.sha, text: branch.name}
        })
        const branchName = req.session.branchName;
        respondWithBaseBranchForm(res, selectBranchesList, branchName, "createGithubCloudBranch");
    } catch (e) {
        sendErrorMessage(res, "Failed to get branches from Github Cloud", e);
    }
});

/**
 * Responds with a form which contains a searchable list of base branches and the name of the new branch
 *
 * res - the express response object which will send the form
 * selectBranchesList - list of base branches which will be present in the form
 * branchName - the name of the new branch
 * createBranchPath - the path where the POST request will occur when submitting the form
 */
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

function convertWorkItemSubtypeToPatternEntityType(subtype: string) {
    switch (subtype) {
        case "story":
            return "user_story";
        default:
            return subtype
    }
}

/**
 * Makes an HTML string containing radio buttons out of the configured repositories
 */
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

/**
 * Endpoint that represents the starting point of the program
 * It returns a form for selecting the repository in which the branch will be created and, if available, the octane pattern to be used
 * It expects the following request query parameters:
 * req.query.shared_space_id - the octane shared space id from which the request comes from
 * req.query.workspace_id - the octane workspace id from which the request comes from
 * req.query.entity_id - the id of the work item for which the branch is created
 * req.query.subtype - the subtype of the work item for which the branch is created
 * req.query.name - the name of the work item for which the branch is created
 */
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

        let branchRadios = '';
        if (doesOctaneSupportBranches) {
            const patterns = await getOctaneScmPatternsForBranches(sharedSpaceId, workspaceId, convertWorkItemSubtypeToPatternEntityType(subtype));
            branchRadios = createBranchSelectRadiosSection(patterns.data)
        }

        const repoRadios = createReposSelectRadios()
        res.send(
            getStyle() +
            `<div class="banner">Create Branch</div><div class="content">` +
            "<form action=\"/repo_selected\" method=\"post\">" +
            "<section><h2>Select the repository in which you want to create the branch</h2>" +
            repoRadios +
            "</section>" +
            branchRadios +
            "    <input type=\"submit\" value=\"OK\">" +
            "</form></div>"
        )
    } catch (e) {
        sendErrorMessage(res, "Failed to get branch patterns from Octane", e)
    }
})

/**
 * Makes an HTML string containing radio buttons out of the array of patterns given as parameter
 */
function createBranchSelectRadiosSection(patterns: Entity[]): string {
    if (!patterns || patterns.length === 0)
        return ""

    let radios = "<section><h2>Select the pattern to use</h2>";

    patterns.forEach((patternEntity, index) => {
        radios += `<label class="container" for=\"radio_${index}\">${patternEntity.pattern}` +
            `<input id=\"radio_${index}\" type=\"radio\" name=\"pattern_selection\" value="${patternEntity.pattern}" ${index === 0 ? "checked=true" : ""} >` +
            `<span class="checkmark"></span></label><br>`

    })
    radios += "</section>"

    return radios
}

/**
 * Endpoint that is called after the repository and pattern were selected
 * It decodes which type of repository was selected (GithubCloud/BitbucketServer/BitbucketCloud) and it redirects to
 * the appropriate starting endpoint
 */
app.post("/repo_selected", urlencodedParser, async (req, res) => {
    try {
        const defaultPrefix = convertWorkItemSubtypeToPatternEntityType(req.session.subtype);
        const branchName = getBranchNameFromPatternWithId(req.body.pattern_selection, req.session.entityId, req.session.name, defaultPrefix)
        const repo = req.body.repo;
        if (repo.startsWith("GITHUB_CLOUD_REPOSITORIES_")) {
            // create github branch
            const repoUrl = repo.replace("GITHUB_CLOUD_REPOSITORIES_", "");
            req.session.repoUrl = repoUrl
            req.session.apiUrl = convertGithubCloudRepoUrlToApiUrl(repoUrl)
            req.session.branchName = branchName;
            res.redirect("/login/github/cloud")
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
    } catch (e) {
        sendErrorMessage(res, "An error occurred while selecting the repository", e)
    }
})

/**
 * Responds with an error page
 */
function sendErrorMessage(res: express.Response, errorMessage: string, errorCause: any) {

    console.error(errorMessage, errorCause)
    let additionalInformation = ""
    if (errorCause.hasOwnProperty("message")) {
        additionalInformation += errorCause.message;
    }
    res.send(
        getStyle() +
        `<div class="banner">Create Branch</div>` +
        "<div class='content error'><span class='errorMessage'>" +
        errorMessage +
        "</span><br><span class='errorCause'>" +
        "Additional information:<br>" + additionalInformation + "</span></div>")
}

/**
 * Makes a "successfully created" HTML page
 */
function getSuccessfullyCreatedBranchPage() {
    return getStyle() +
        `<div class="banner">Create Branch</div>` +
        `<div class="content successMessage"><span>Branch created successfully!</span></div>` +
        `</div><button class="close" onclick="window.close()">Close Window</button>`;
}

/**
 * If supported, it creates the branch in octane and responds accordingly
 */
async function createBranchInOctaneResponse(req: express.Request, res: express.Response) {
    if (doesOctaneSupportBranches) {
        console.log("Creating branch in Octane...")
        const entityCreateEntitiesResponse = await createOctaneBranch(req.session.sharedSpaceId, req.session.workspaceId, req.session.entityId, req.body.branchName, req.session.repoUrl);
        if (!entityCreateEntitiesResponse.errors) {
            res.send(getSuccessfullyCreatedBranchPage());
        } else {
            throw new Error("The branch was created in the SCM Repository, but an error occurred while creating the branch in Octane." +
                "Please check if there was an existing branch with the same name for the same repository. If there is, you might need to update its delete status. " +
                "Additional info: :" + JSON.stringify(entityCreateEntitiesResponse.errors))
        }
    } else {
        res.send(getSuccessfullyCreatedBranchPage())
    }
}

/**
 * Endpoint for starting the branch creation process in Github Cloud
 */
app.post("/createGithubCloudBranch", urlencodedParser, async (req, res) => {
    try {
        const branchResult = await createGitHubCloudBranch(req.session.access_token, req.session.apiUrl, req.body.branchName, req.body.sha);
        console.log(JSON.stringify(branchResult))
        console.log("Branch created in Github Cloud.")
        await createBranchInOctaneResponse(req, res);
    } catch (e) {
        sendErrorMessage(res, "Failed to create the branch", e);
    }
})

/**
 * Endpoint for starting the branch creation process in Bitbucket Cloud
 */
app.post("/createBitbucketCloudBranch", urlencodedParser, async (req, res) => {
    try {
        const branchResult = await createBitbucketCloudBranch(req.session.access_token, req.session.apiUrl, req.body.branchName, req.body.sha);
        console.log(JSON.stringify(branchResult))
        console.log("Branch created in Bitbucket Cloud.")
        await createBranchInOctaneResponse(req, res);
    } catch (e) {
        sendErrorMessage(res, "Failed to create the branch", e);
    }
})

/**
 * Endpoint for starting the branch creation process in Bitbucket Server
 */
app.post("/createBitbucketServerBranch", urlencodedParser, async (req, res) => {
    try {
        const branchResult = await createBitbucketServerBranch(req.session.access_token, req.session.apiUrl, req.body.branchName, req.body.sha);
        console.log(JSON.stringify(branchResult))
        console.log("Branch created in the Bitbucket Server.")
        await createBranchInOctaneResponse(req, res);
    } catch (e) {
        sendErrorMessage(res, "Failed to create the branch", e);
    }
})


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
    padding-top: 10px;
    padding-bottom: 10px;
}

div.successMessage{
color:green;
background-color: lightgreen;
padding: 10px 200px;
width: fit-content;
text-align: center;
}

div.error{

color:darkred;
background-color: lightpink;
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
