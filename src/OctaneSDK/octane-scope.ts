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


import {Got, HTTPError} from 'got';
import {compact} from 'lodash';

export interface FetchParameters {
	offset?: number;
	query?: string;
	limit?: number;
	order_by?: string;
	fields?: string[];
	[paramName: string]: string | number | boolean | (string | number)[];
}

export interface ReferenceEntity extends Entity {}

interface MultiReferenceEntity {
	data: ReferenceEntity[]
}

type EntityFieldValue = string | number | boolean | ReferenceEntity | MultiReferenceEntity;

export interface NewEntity {
	type?: string;
	subtype?: string;
	name?: string;
	parent?: ReferenceEntity;

	[field: string]: EntityFieldValue;
}

export interface Entity extends NewEntity {
	id: string;
}

export interface EntityCollection<T extends Entity> {
	total_count: number;
	data: T[];
}

const DEFAULT_FETCH_PARAMETERS: FetchParameters = {
	order_by: 'id',
	offset: 0,
	limit: 1000,
};

interface OctaneError {
	description: string;
}

export interface CreateEntitiesResponse<T extends Entity> extends EntityCollection<T> {
	errors: OctaneError[];
}

export interface UpdateEntitiesResponse<T extends Entity> extends EntityCollection<T> {
	errors: OctaneError[];
}

export interface FieldMetadata extends Entity {
	type: 'field_metadata';
	entity_name: string;
}

type AccessLevel = 'PUBLIC' | 'PUBLIC_INTERNAL' | 'PUBLIC_TECH_PREVIEW' | 'PRIVATE';

interface FieldMetadataQueryOptions {
	visible_in_ui?: boolean;
	editable?: boolean;
	access_level?: AccessLevel;
}

export class OctaneScope {
	constructor(private client: Got) {}

	async fetchCollection<T extends Entity>(
		entityCollectionName: string,
		parameters: FetchParameters = DEFAULT_FETCH_PARAMETERS
	): Promise<EntityCollection<T>> {
		const searchParameters = Object.entries(DEFAULT_FETCH_PARAMETERS).concat(Object.entries(parameters));
		const toActualString = (x:any) =>''+x;
		const stringSearchParameters = searchParameters.map(subarray=>subarray.map(toActualString))
		const searchParams = new URLSearchParams(stringSearchParameters);
		const {total_count, data} = await this.client.get(`${entityCollectionName}`, {
			searchParams,
		}).json();
		return {total_count, data};
	}

	async updateEntities<T extends Entity>(
		entityName: string,
		itemsToUpdate: Entity[]
	): Promise<UpdateEntitiesResponse<T>> {
		try {
			const {
				total_count, data, errors
			} = await this.client.put(`${entityName}`, {
				json: {
					data: itemsToUpdate,
				},
			}).json();
			return {total_count, data, errors};
		} catch (e) {
			if (e instanceof HTTPError && e.response.statusCode === 409) {
				return e.response.body as UpdateEntitiesResponse<T>;
			}

			throw e;
		}
	}

	async createEntities<T extends Entity>(
		entityCollection: string,
		itemsToCreate: NewEntity[]
	): Promise<CreateEntitiesResponse<T>> {
		try {
			return await this.client.post(`${entityCollection}`, {
				json: {
					data: itemsToCreate,
				},
			}).json();
		} catch (e) {
			if (e instanceof HTTPError && e.response.statusCode === 409) {
				return e.response.body as CreateEntitiesResponse<T>;
			}

			throw e;
		}
	}

	async fetchFieldMetadata(
		entityTypes: string[],
		{visible_in_ui, editable}: FieldMetadataQueryOptions
	): Promise<FieldMetadata[]> {
		const queryParts = compact([
			`(entity_name IN ${entityTypes.map((type) => `'${type}'`).join(',')})`,
			visible_in_ui !== undefined && `visible_in_ui=${visible_in_ui}`,
			editable !== undefined && `editable=${editable}`,
		]);

		const {data: fields} = await this.fetchCollection<FieldMetadata>('metadata/fields', {
			query: `"${queryParts.join(';')}"`,
		});

		console.log(`loaded ${fields.length} fields`);

		return fields;
	}
}
