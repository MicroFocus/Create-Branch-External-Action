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

import {Got} from 'got';
import {OctaneWorkspace} from './octane-workspace';

export class OctaneSharedSpace {
	private readonly client: Got;
	private readonly baseUrl: string;

	constructor(client: Got, parentBaseUrl: string, sharedSpaceId: number) {
		this.baseUrl = parentBaseUrl + `/api/shared_spaces/${sharedSpaceId}`;

		this.client = client.extend({
			prefixUrl: this.baseUrl,
		});
	}

	workspace(workspaceId: number): OctaneWorkspace {
		return new OctaneWorkspace(this.client, this.baseUrl, workspaceId);
	}
}
