import * as axios from 'axios';
import { log, selectors, types, util } from 'vortex-api';
import { GAME_ID, getManifestValue } from './common';
import { IAPIModIdentity, IAPIPostRequest, IAPIPostResponse, ISMAPIManifest } from './types/smapi-types';

const SMAPI_API_VERSION = 'v3.0';

// API documentation https://github.com/Pathoschild/SMAPI/blob/develop/docs/technical/web.md#web-api
class SMAPI_API {
    public api_url: string = `https://smapi.io/api/${SMAPI_API_VERSION}/mods`;
    public post = axios.default.post;
    private vortexApi: types.IExtensionApi;

    constructor(api: types.IExtensionApi) {
        this.vortexApi = api;
    }

    async getGameVersion(): Promise<string> {
        const state = this.vortexApi.getState();
        const game = util.getGame(GAME_ID);
        if (game == undefined) throw new Error('Could not get game details for Stardew Valley.');
        const discovery: types.IDiscoveryResult = selectors.discoveryByGame(state, GAME_ID);
        const gameVersion: string = await game.getInstalledVersion?.(discovery);
        if (!gameVersion) throw new Error('Could not get the game version for Stardew Valley.');
        // return gameVersion;
        // The SMAPI API only accepts the version as x.x.x - we may have it stored as x.x.x.x
        const shortenedVersion = gameVersion.split('.').slice(0, 3).join('.');
        return shortenedVersion;
    }

    getAllMods(): { [id: string]: types.IMod } {
        const state = this.vortexApi.getState();
        return state.persistent.mods?.[GAME_ID] || {};
    }

    async sendQuery(mods: IAPIModIdentity[], includeMeta?: boolean): Promise<IAPIPostResponse> {
        try {
            const gameVersion = await this.getGameVersion();
            const platform = process.platform === 'win32' 
            ? 'Windows'
            : process.platform === 'linux'
                ? 'Linux'
                : 'Mac';
            // Attempt to make the network request.
            const data: IAPIPostRequest = {
                mods,
                apiVersion: '3.0',
                gameVersion,
                platform,
                includeExtendedMetadata: includeMeta
            }

            console.log('SMAPI API request', data);
            const res = await this.post(this.api_url, data);
            console.log('SMAPI API response', res.data);
            return res.data;
        }
        catch(err) {
            log('error', 'Error fetching data from the SMAPI API', err);
            return [];
        }
    }

    async fetchModInfo(includeMeta: boolean, modsToCheck?: { [id: string]: types.IMod }): Promise<IAPIPostResponse> {
        if (!modsToCheck) modsToCheck = this.getAllMods();
        let mods: IAPIModIdentity[] = Object.values(modsToCheck).reduce((prev, cur) => {
            const ids = cur.attributes?.modData;
            if (!ids || !ids.length) return prev;
            return [...prev, ...ids.map(m => ({ id: m.id, installedVersion: m.version, updateKeys: cur.attributes?.modId && cur.attributes?.source === 'nexus' ? [`nexus:${cur.attributes?.modId}`] : [] }))];
        }, new Array(0));

        if (!mods.length) return [];

        return this.sendQuery(mods, includeMeta);
    }
}

export async function getModDependencies(context: types.IExtensionContext, manifest: ISMAPIManifest): Promise<types.IModRule[]> {
    // Make the data easier to work with by normalising it. This will remove any case ambiguity. 
    const contentPackFor: { UniqueID: string, isRequired?: boolean } | undefined = normaliseDependencies(getManifestValue(manifest, 'ContentPackFor'));
    const dependencies: { UniqueID: string, MinimumVersion?: string, isRequired: boolean }[] = (getManifestValue(manifest, 'Dependencies') || []).map(normaliseDependencies);
    if (!contentPackFor && !dependencies.length) return [];
    if (!!contentPackFor) dependencies.push({ UniqueID: contentPackFor.UniqueID, isRequired: true});

    // Get installed mods with SMAPI IDs assigned.
    const state: types.IState = context.api.getState();
    const mods: { [id: string]: types.IMod } = state.persistent.mods?.[GAME_ID];
    const smapiMods = Object.values(mods).filter(m => !!m.attributes.smapiIDs);

    let unfulfilled: { UniqueID: string, MinimumVersion?: string, isRequired: boolean }[] = [];
    let rules: types.IModRule[] = [];

    // Check for existing mods as dependencies
    for (const dependency of dependencies) {
        const matchingMod = smapiMods.find(mod => mod.attributes.smapiIDs.find(data => data.id.toLowerCase() === dependency.UniqueID.toLowerCase()));
        // If we don't have this mod, mark it for the SMAPI request and continue to the next one.
        if (!matchingMod) {
            unfulfilled.push(dependency);
            continue;
        }
        const rule: types.IModRule = {
            reference: {
                id: matchingMod.id,
                repo: {
                    repository: 'nexus',
                    gameId: GAME_ID,
                    modId: matchingMod.attributes?.modId,
                    fileId: matchingMod.attributes?.fileId,
                },
                archiveId: matchingMod.archiveId,
                description: util.renderModName(matchingMod),
            },
            downloadHint: {
                mode: 'browse',
                url: `https://nexusmods.com/${GAME_ID}/mods/${matchingMod.attributes?.modId || ''}`
            },
            extra: {
                required: dependency.isRequired || false
            }
        }
        rules.push(rule);
    }

    // Now we need the data from SMAPI for the remaining dependencies
    const smapi = new SMAPI_API(context.api);
    const modsToSend: IAPIModIdentity[] = unfulfilled.map(u => ({ id: u.UniqueID }));
    try {
        const smapiRequest = await smapi.sendQuery(modsToSend, true);
        // Now map the API responses into rules
        const unfulfilledRules: types.IModRule[] = unfulfilled.map(rule => {
            const data = smapiRequest.find(m => m.id.toLowerCase() === rule.UniqueID.toLowerCase());
            if (!data) return;
            const depRule: types.IModRule = {
                reference: {
                    idHint: data.id,
                    description: data.metadata?.name || data.id,
                    instructions: 'Download the required version.'
                },
                downloadHint: {
                    mode: 'browse',
                    url: data.metadata?.main?.url || `https://nexusmods.com/${GAME_ID}/mods/`
                },
                extra: {
                    required: rule.isRequired || false
                }
            }
            return depRule;
        });

        return  rules.concat.apply([], unfulfilledRules);
    }
    catch(err) {
        log('error', 'There was an error fetching dependency data for SMAPI mods', { unfulfilled, err });
        return rules;
    }
}

function normaliseDependencies(input: object): { UniqueID: string, MinimumVersion?: string, isRequired: boolean } {
    const UniqueID = getManifestValue(input, 'UniqueID');
    const MinimumVersion = getManifestValue(input, 'MinimumVersion');
    const isRequired: boolean = getManifestValue(input, 'isRequired') || false;

    if (!UniqueID) return undefined;
    let result: { UniqueID: string, MinimumVersion?: string, isRequired: boolean } = { UniqueID, isRequired };
    if (!MinimumVersion) result.MinimumVersion = MinimumVersion;
    return result;
}

export default SMAPI_API;