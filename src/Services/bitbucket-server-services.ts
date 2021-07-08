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

interface BitbucketServerRepoUrl {
    baseUrl: string,
    projectKey: string,
    repoName: string,
    username: string
    protocol: string
}

function disassembleBitBucketServerRepoUrl(repoUrl: string): BitbucketServerRepoUrl {
    // example url https://user@myBitbucketServer.com:7990/scm/workspace/repo.git
    const disassembleRegex = new RegExp("(https|http)://((.*?)@)?(.*?)/scm/(.*?)/(.*?).git")
    const matchedUrl = repoUrl.match(disassembleRegex);
    // at index 0: https://user@myBitbucketServer.com:7990/scm/workspace/repo.git,
    // at index 1: https,
    // at index 2: user@,
    // at index 3: user,
    // at index 4: myBitbucketServer.com:7990,
    // at index 5: projectKey,
    // at index 6: repo

    const protocol = matchedUrl[1]
    const username = matchedUrl[3]
    const baseUrl = matchedUrl[4]
    const projectKey = matchedUrl[5]
    const repoName = matchedUrl[6]
    return {
        baseUrl,
        projectKey,
        repoName,
        username,
        protocol
    }
}

function convertBitbucketServerRepoUrlObjectToApiUrl(repoUrl: BitbucketServerRepoUrl) {
    return repoUrl.protocol + "://" + repoUrl.baseUrl + "/rest/api/1.0/projects/" + repoUrl.projectKey + "/repos/" + repoUrl.repoName
}

/**
 * Converts a git clone url to the Bitbucket Server api url for that repository
 * @param repoUrl - the html git clone of a Bitbucket Server repository
 */
export function convertBitbucketServerRepoUrlToApiUrl(repoUrl: string) {
    return convertBitbucketServerRepoUrlObjectToApiUrl(disassembleBitBucketServerRepoUrl(repoUrl))
}

export interface BitbucketServerPagedResponse {
    isLastPage: boolean,
    values: [],
    nextPageStart?: number
}

async function getBitbucketServerBranchPage(apiUrl: any, accessToken: any, limit: number, start: number): Promise<BitbucketServerPagedResponse> {
    console.log("Getting bitbucket server branch page from start:" + start);
    const branchesUrl = new URL(`${apiUrl}/branches`);
    const params = {limit: limit.toString(), start: start.toString(), orderBy: "MODIFICATION"};
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

interface BitbucketServerBranch {
    displayId: string,
    id: string
}

/**
 * Uses the access token to connect to Bitbucket Server and gets all the Bitbucket branches that it can get from the api url
 * @param accessToken - personal access token that will be used to retrieve the branches
 * @param apiUrl - the base api url for the repository
 */
export async function getAllBitbucketServerBranches(accessToken: any, apiUrl: any): Promise<BitbucketServerBranch[]> {
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


/**
 * Creates a new branch in Bitbucket Server
 * @param accessToken - personal access token that will be used to create the branch
 * @param apiUrl - the base api url for the repository
 * @param branchName - the name of the new branch
 * @param startPoint - the starting point for the new branch (the base branch)
 */
export async function createBitbucketServerBranch(accessToken: string, apiUrl: string, branchName: string, startPoint: string) {
    const request = await fetch(`${apiUrl}/branches`, {
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
    const response = await request.json();
    if (request.ok) {
        return response;
    } else {
        throw new Error("Failed to create branch in Bitbucket Server: " + JSON.stringify(response));
    }
}
