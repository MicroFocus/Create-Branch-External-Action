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
    // at index 0: https://github.com/MeMyselfAndI/MyRepo.git
    // at index 1: https,
    // at index 2: github.com,
    // at index 3: MeMyselfAndI,
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

export function convertGithubCloudRepoUrlToApiUrl(repoUrl: string) {
    return convertGithubRepoUrlObjectToApiUrl(disassembleGithubCloudRepoUrl(repoUrl))
}
