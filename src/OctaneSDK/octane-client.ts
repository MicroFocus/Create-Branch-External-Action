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

import {CookieJar} from 'tough-cookie';
import {OctaneSharedSpace} from './octane-shared-space';
import got, {Got, Headers} from 'got';

const cache = new Map();

export interface OctaneError {
	error_code: string;
	correlation_id: string;
	description: string;
	properties: {[name: string]: string};
	stack_trace: string;
	business_error: string;
}

export function isOctaneError(err:any): err is OctaneError {
	return (
		typeof err === 'object' &&
		err.error_code !== undefined &&
		err.correlation_id !== undefined
	);
}

export class OctaneClient {
	private readonly client: Got;
	private readonly baseUrl: string;

	constructor(fullUrl: string, headers?: Headers) {
		const octaneFullUrl = new URL(fullUrl);

		this.baseUrl = `${octaneFullUrl.protocol || 'http:'}//${octaneFullUrl.host}`;


		this.client = got.extend({
			prefixUrl: this.baseUrl,
			headers,
			cookieJar: new CookieJar(),
			responseType: "json",
			cache,
		});
	}

	async signIn(user: string, password: string) {
		await this.client.post(`authentication/sign_in`, {json: {user, password}});
	}

	sharedSpace(sharedSpaceId: number): OctaneSharedSpace {
		return new OctaneSharedSpace(this.client, this.baseUrl, sharedSpaceId);
	}
}
