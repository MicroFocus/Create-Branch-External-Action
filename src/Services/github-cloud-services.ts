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

import fetch from "node-fetch";

interface GithubCloudRepoUrl {
    baseUrl: string,
    owner: string,
    repoName: string,
    protocol: string
}

function disassembleGithubCloudRepoUrl(repoUrl: string): GithubCloudRepoUrl {
    // example url https://github.com/MeMyselfAndI/MyRepo.git
    const disassembleRegex = new RegExp("(https|http)://(.*?)/(.*?)/(.*?).git")
    const matchedUrl = repoUrl.match(disassembleRegex);
    if (matchedUrl === null) {
        throw new Error("The repository url \"" + repoUrl + "\" could not be parsed correctly. " +
            "Example of a correct repository url: \"https://github.com/MyUser/MyRepo.git\"")
    }
    // at index 0: https://github.com/MyUser/MyRepo.git
    // at index 1: https,
    // at index 2: github.com,
    // at index 3: MyUser,
    // at index 4: MyRepo

    const protocol = matchedUrl[1]
    const baseUrl = matchedUrl[2]
    const owner = matchedUrl[3]
    const repoName = matchedUrl[4]
    return {
        baseUrl,
        owner,
        repoName,
        protocol
    }
}

function convertGithubRepoUrlObjectToApiUrl(repoUrl: GithubCloudRepoUrl) {
    return repoUrl.protocol + "://api." + repoUrl.baseUrl + "/repos/" + repoUrl.owner + "/" + repoUrl.repoName
}

/**
 * Converts a git clone url to the Github Cloud api url for that repository
 * @param repoUrl - the html git clone of a Github Cloud repository
 */
export function convertGithubCloudRepoUrlToApiUrl(repoUrl: string) {
    return convertGithubRepoUrlObjectToApiUrl(disassembleGithubCloudRepoUrl(repoUrl))
}

async function getGithubCloudBranchPage(apiUrl: string, accessToken: string, page: number, maxItemsInPage: number) {
    console.log("Getting Github Cloud branch page " + page);
    const branchesUrl = `${apiUrl}/branches?page=${page}&per_page=${maxItemsInPage}`;
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

/**
 * Uses the access token to connect to Github Cloud and gets all the Github branches that it can get from the api url
 * @param accessToken - oauth token that will be used to retrieve the branches
 * @param apiUrl - the base api url for the repository
 */
export async function getAllGithubCloudBranches(accessToken: string, apiUrl: string): Promise<GithubBranches[]> {
    console.log("Getting git branches");
    let allBranches: GithubBranches[] = [];
    let page = 1;
    let githubCloudResponse
    const githubCloudGetLimit = Number(process.env.GITHUB_CLOUD_GET_LIMIT);
    const maxItemsInPage = Number.isNaN(githubCloudGetLimit) ? 100 : githubCloudGetLimit;
    do {
        githubCloudResponse = await getGithubCloudBranchPage(apiUrl, accessToken, page++, maxItemsInPage);
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

/**
 * Performs the oauth authentication and returns the access token
 *
 * @param code - code retrieved from Github when starting the oauth process
 * @param clientId - the oauth app id set in Github Cloud
 * @param clientSecret - the oauth secret set in Github Cloud
 */
export async function getGithubCloudAccessToken(code: string, clientId: string, clientSecret: string) {
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

/**
 * Creates a new branch in Github Cloud
 * @param accessToken - oauth access token that will be used to create the branch
 * @param apiUrl - the base api url for the repository
 * @param branchName - the name of the new branch
 * @param sha - the sha of the base branch
 */
export async function createGitHubCloudBranch(accessToken: string, apiUrl: string, branchName: string, sha: string) {

    const ref = `refs/heads/${branchName}`
    console.log("sha:" + JSON.stringify(sha));
    const request = await fetch(`${apiUrl}/git/refs`, {
        method: "POST",
        headers: {
            Authorization: "token " + accessToken
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
