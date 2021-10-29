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

import {Headers} from "got";
import {getOctaneFromEnv} from "../OctaneSDK/octane-utilities";
import {OctaneWorkspace} from "../OctaneSDK/octane-workspace";
import {FetchParameters, ReferenceEntity} from "../OctaneSDK/octane-scope";

/**
 * Creates a branch in Octane
 * @param sharedSpaceId - the id of the shared space in which the branch will be created
 * @param workspaceId - the id of the workspace in which the branch will be created
 * @param workItemId - the id of the work item to which the branch will be related
 * @param branchName - the name of the branch
 * @param repoUrl - the repository html git url of the branch
 */
export async function createOctaneBranch(sharedSpaceId: number, workspaceId: number, workItemId: string, branchName: string, repoUrl: string) {
    // Usually, this header should not be used.
    const apiHeader: Headers = {'ALM-OCTANE-PRIVATE': "true"}
    const octaneSharedSpace = await getOctaneFromEnv(sharedSpaceId, apiHeader);
    const octaneWorkspace = octaneSharedSpace.workspace(workspaceId);
    const repository = await getOctaneRootRepository(octaneWorkspace, repoUrl);
    const createdBranch = await octaneWorkspace.createEntities("scm_repositories", [
        {
            name: branchName,
            repository
        }
    ]);
    if (createdBranch.errors)
        return createdBranch;
    return octaneWorkspace.updateEntities("analytics/ci/link-stories-to-branch?reference-update-mode=append", [{
        scm_branches: {
            data: [{
                id: createdBranch.data[0].id,
                type: createdBranch.data[0].type
            }]
        },
        id: workItemId
    }])
}

async function createRootRepository(octaneWorkspace: OctaneWorkspace, repoUrl: string): Promise<ReferenceEntity> {
    const response = await octaneWorkspace.createEntities("scm_repository_roots", [{
        name: repoUrl,
        url: repoUrl,
        scm_type: 2
    }])
    if (response.total_count === 1) {
        console.log("Created root repository:" + JSON.stringify(response.data[0]))
        return response.data[0]
    }

    throw new Error("Failed to create root repository:" + JSON.stringify(response));
}

async function getOctaneRootRepository(octaneWorkspace: OctaneWorkspace, repoUrl: string): Promise<ReferenceEntity> {
    console.log("Getting root repository")
    const response = await octaneWorkspace.fetchCollection("scm_repository_roots", {
        query: `"(url EQ '${repoUrl}')"`
    })
    if (response.total_count === 1) {
        console.log("Found root repository:" + JSON.stringify(response.data[0]))
        return response.data[0];
    }

    if (response.total_count === 0) {
        console.log("Creating root repository")
        return createRootRepository(octaneWorkspace, repoUrl);
    }

    throw new Error("Failed to get root repository");
}

/**
 *
 * @param sharedSpaceId
 * @param workspaceId
 * @param entityType
 */
export async function getOctaneScmPatternsForBranches(sharedSpaceId: number, workspaceId: number, entityType: string) {
    // Usually, this header should not be used. In this case, there is currently no other way of getting the scm patterns
    const apiHeader: Headers = {'ALM-OCTANE-PRIVATE': "true"}
    const octaneSharedSpace = await getOctaneFromEnv(sharedSpaceId, apiHeader);
    const octaneWorkspace = octaneSharedSpace.workspace(workspaceId);

    const queryParameters: FetchParameters = {
        fields: ["pattern", "entity_type", "applies_to"],
        query: "\"(" +
            `entity_type EQ {(id EQ 'list_node.scm_commit_pattern_entity_type.${entityType}')}` +
            ";" +
            "applies_to EQ {(id EQ 'list_node.commit_pattern.applies_to.branch')}" +
            ")\""
    }
    return octaneWorkspace.fetchCollection("scm_commit_patterns", queryParameters);
}
