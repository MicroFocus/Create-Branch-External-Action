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

export function convertBitbucketCloudRepoUrlToApiUrl(repoUrl: string) {
    return convertBitbucketCloudRepoUrlObjectToApiUrl(disassembleBitBucketCloudRepoUrl(repoUrl))
}
