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

function sanitizeBranchName(name: string) {
    // see https://git-scm.com/docs/git-check-ref-format
    return name.trim()
        .replace(/(\\.\\.|[~^:?[])/g, "")// no ".." or any of the ~^:?[ characters
        .replace(/\s/g, "_")
}

export function getBranchNameFromPatternWithId(pattern: string, id: number, name: string, defaultPrefix: string): string {

    const sanitizedName = sanitizeBranchName(name);
    let patternWIthId: string;
    if (!!pattern) {
        patternWIthId = pattern
            .replace(/\\s\*?/g, "") // replaces the \s or \s* structures from the pattern
            .replace(/\(\\d\+\)/, id.toString());// replaces the "(\d+)" group

    } else {
        patternWIthId = defaultPrefix + "_" + id.toString()
    }
    return patternWIthId + "-" + sanitizedName;
}
