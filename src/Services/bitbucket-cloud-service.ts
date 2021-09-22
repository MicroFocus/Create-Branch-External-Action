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

interface BitbucketCloudRepoUrl {
    baseUrl: string,
    workspaceId: string,
    repoName: string,
    username: string
    protocol: string
}

function disassembleBitBucketCloudRepoUrl(repoUrl: string): BitbucketCloudRepoUrl {
    // example url https://user@bitbucket.org/workspace/repo.git
    const disassembleRegex = new RegExp("(https|http)://((.*?)@)?(.*?)/(.*?)/(.*?).git")
    const matchedUrl = repoUrl.match(disassembleRegex);
    if (matchedUrl === null) {
        throw new Error("The repository url \"" + repoUrl + "\" could not be parsed correctly. " +
            "Example of a correct repository url: \"https://user@bitbucket.org/workspace/repo.git\"")
    }
    // at index 0: https://user@bitbucket.org/workspace/repo.git,
    // at index 1: https,
    // at index 2: user@,
    // at index 3: user,
    // at index 4: bitbucket.org,
    // at index 5: workspace,
    // at index 6: repo

    const protocol = matchedUrl[1]
    const username = matchedUrl[3]
    const baseUrl = matchedUrl[4]
    const workspaceId = matchedUrl[5]
    const repoName = matchedUrl[6]
    return {
        baseUrl,
        workspaceId,
        repoName,
        username,
        protocol
    }
}

function convertBitbucketCloudRepoUrlObjectToApiUrl(repoUrl: BitbucketCloudRepoUrl) {
    return repoUrl.protocol + "://api." + repoUrl.baseUrl + "/2.0/repositories/" + repoUrl.workspaceId + "/" + repoUrl.repoName
}

/**
 * Converts a git clone url to the Bitbucket Cloud api url for that repository
 * @param repoUrl - the html git clone of a Bitbucket Cloud repository
 */
export function convertBitbucketCloudRepoUrlToApiUrl(repoUrl: string) {
    return convertBitbucketCloudRepoUrlObjectToApiUrl(disassembleBitBucketCloudRepoUrl(repoUrl))
}

/**
 * Performs the oauth authentication and returns the access token
 *
 * @param code - code retrieved from Bitbucket when starting the oauth process
 * @param clientId - the oauth app id set in Bitbucket Cloud
 * @param clientSecret - the oauth secret set in Bitbucket Cloud
 */
export async function getBitbucketCloudAccessToken(code: string, clientId: string, clientSecret: string) {
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

interface BitbucketCloudCommit {
    hash: string
}

interface BitbucketCloudBranch {
    name: string,
    target: BitbucketCloudCommit
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

/**
 * Uses the access token to connect to Bitbucket Cloud and gets all the Bitbucket branches that it can get from the api url
 * @param accessToken - oauth token that will be used to retrieve the branches
 * @param apiUrl - the base api url for the repository
 */
export async function getAllBitbucketCloudBranches(accessToken: string, apiUrl: string): Promise<BitbucketCloudBranch[]> {
    console.log("Getting git branches");
    let allBranches: BitbucketCloudBranch[] = [];
    const bitbucketCloudGetLimit = Number(process.env.BITBUCKET_CLOUD_GET_LIMIT);
    const maxItemsInPage = Number.isNaN(bitbucketCloudGetLimit) ? 100 : bitbucketCloudGetLimit;
    const branchesUrl = `${apiUrl}/refs/branches?pagelen=${maxItemsInPage}&sort=-target.date`;
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

/**
 * Creates a new branch in Bitbucket Cloud
 * @param accessToken - oauth access token that will be used to create the branch
 * @param apiUrl - the base api url for the repository
 * @param branchName - the name of the new branch
 * @param hash - the hash of the base branch
 */
export async function createBitbucketCloudBranch(accessToken: string, apiUrl: string, branchName: string, hash: string) {
    const request = await fetch(`${apiUrl}/refs/branches`, {
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
    const response = await request.json();
    if (request.ok) {
        return response;
    } else {
        throw new Error("Failed to create branch in Bitbucket Cloud: " + JSON.stringify(response));
    }
}
