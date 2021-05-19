function sanitizeBranchName(name: string) {
    // see https://git-scm.com/docs/git-check-ref-format
    // todo check other possibilities
    return name.trim()
        .replace(/(\\.\\.|[~^:?[])/g, "")// no ".." or any of the ~^:?[ characters
        .replace(/\s/g, "_")
}

export function getBranchNameFromPatternWithId(pattern: string, id: number, name: string): string {

    const sanitizedName = sanitizeBranchName(name);
    let patternWIthId: string;
    if (!!pattern) {
        patternWIthId = pattern
            .replace(/\\s\*?/g, "") // replaces the \s or \s* structures from the pattern
            .replace(/\(\\d\+\)/, id.toString());// replaces the "(\d+)" group

    } else {
        patternWIthId = "entity_id_" + id.toString();
    }
    return patternWIthId + "-" + sanitizedName;
}
