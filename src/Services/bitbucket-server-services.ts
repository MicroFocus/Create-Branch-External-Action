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

export function convertBitbucketServerRepoUrlToApiUrl(repoUrl: string) {
    return convertBitbucketServerRepoUrlObjectToApiUrl(disassembleBitBucketServerRepoUrl(repoUrl))
}
