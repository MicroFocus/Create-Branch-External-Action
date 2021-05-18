function sanitizeBranchName(name: string) {
    // see https://git-scm.com/docs/git-check-ref-format
    // todo check other possibilities
    return name.trim()
        .replace(/(\\.\\.|[~^:?[])/g, "")// no ".." or any of the ~^:?[ characters
        .replace(/\s/g, "_")
}

export function getBranchNameFromPatternWithId(pattern: string, id: number, name: string): string {

    const sanitizedName = sanitizeBranchName(name);
    const patternWIthId = pattern
        .replace(/\\s\*?/g, "") // replaces the \s or \s* structures from the pattern
        .replace(/\(\\d\+\)/, id.toString());// replaces the "(\d+)" group

    return patternWIthId + "-" + sanitizedName;
}
