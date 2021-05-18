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
