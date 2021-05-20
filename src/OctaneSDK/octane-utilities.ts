import {isEmpty, pick} from 'lodash'
import {OctaneClient} from "./octane-client";
import {OctaneSharedSpace} from "./octane-shared-space";
import {Headers} from "got";

interface BasicConfiguration {
    OCTANE_URL: string;
    OCTANE_SHARED_SPACES: string;
    OCTANE_USERS: string;
    OCTANE_PASSWORDS: string;
}

export async function getOctaneFromEnv(sharedSpaceId: number, headers?: Headers): Promise<OctaneSharedSpace> {
    const envConfiguration = getConfigurationFromEnv()
    const splitAndTrim = (longString: string) => longString.split(',').map((value) => value.trim());
    const sharedSpaceIds = splitAndTrim(envConfiguration.OCTANE_SHARED_SPACES);
    const sharedUsers = splitAndTrim(envConfiguration.OCTANE_USERS);
    const sharedPasswords = splitAndTrim(envConfiguration.OCTANE_PASSWORDS);

    const sharedSpaceCredentials = sharedSpaceIds.map((element, index) => {
        return {id: parseInt(element, 10), user: sharedUsers[index], password: sharedPasswords[index]};
    });

    const octaneClient = new OctaneClient(envConfiguration.OCTANE_URL, headers);

    const indexOfSharedSpace: number = sharedSpaceIds.indexOf(sharedSpaceId.toString());
    await octaneClient.signIn(
        sharedSpaceCredentials[indexOfSharedSpace].user,
        sharedSpaceCredentials[indexOfSharedSpace].password
    );

    return octaneClient.sharedSpace(sharedSpaceId);
}

function getConfigurationFromEnv(): BasicConfiguration {
    const ENV_VARS = [
        'OCTANE_URL',
        'OCTANE_SHARED_SPACES',
        'OCTANE_USERS',
        'OCTANE_PASSWORDS',
    ];

    const config = pick(process.env, ENV_VARS) as Partial<BasicConfiguration>;

    for (const [key, value] of Object.entries(config)) {
        assert(!isEmpty(value), `missing ${key} configuration`);
    }

    return config as BasicConfiguration;
}


function assert(valid:any, message: string) {
    if (!!valid) {
        return;
    }

    throw new ValidationError(message);
}


class ValidationError extends Error {
    constructor(message: string) {
        super(message);
    }
}
