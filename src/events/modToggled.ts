import { actions, selectors, types, log, util } from "vortex-api";
import { GAME_ID } from '../common';
import { IAPIModIdentity, IModRulePlusType, ISMAPIManifest, SMAPIManifestClass } from "../types/smapi-types";
import SMAPI_API from '../SMAPI_API';
import * as semver from 'semver';

export default async function modToggled(api: types.IExtensionApi, profileId: string, modId: string) {
    const state = api.getState();
    const profile: types.IProfile | undefined = selectors.profileById(state, profileId);
    if (profile?.gameId !== GAME_ID) return;

    const mods: {[id: string]: types.IMod} = state.persistent.mods?.[GAME_ID] || {};
    const mod: types.IMod | undefined = mods?.[modId];
    // Probably not a Stardew Valley mod.
    if (!mods || !mod) return;

    // Get the SMAPI manifests
    const smapiManifests: { [id: string]: ISMAPIManifest } = mod.attributes?.smapiManifests;

    // If we have got any saved manifests, we can't do anything here.
    if (!smapiManifests || !Object.keys(smapiManifests).length) return;

    // Loop over the manfiests provided and check the dependencies
    for (const manifest of Object.values(smapiManifests)) {
        const parsed = new SMAPIManifestClass(manifest);
        const dependencies = parsed.Dependencies || [];
        // If this is a content pack, add the additional dependency. 
        if (!!parsed.ContentPackFor) dependencies.push({ UniqueID: parsed.ContentPackFor.UniqueID, isRequired: true });
        // Iterate over the dependencies and find matching mods.
        const mappedRules = await mapDependencies(api, mods, dependencies);
        if (!mappedRules.length) continue;
        const existingRules = mod.rules || [];
        const rulesToRemove = existingRules.filter(r => mappedRules.find(mr => mr.reference.id === (r.reference as any)?.fileExpression));
        // Remove the rules we're updating.
        util.batchDispatch(api.store, rulesToRemove.map(r => actions.removeModRule(GAME_ID, mod.id, r)));

        // Apply the new rules
        util.batchDispatch(api.store, mappedRules.map(r => actions.addModRule(GAME_ID, mod.id, r)));
    }

}

async function mapDependencies(api: types.IExtensionApi, mods: {[id: string]: types.IMod}, dependencies: { UniqueID: string, isRequired?: boolean, MinimumVersion?: string }[] ): Promise<IModRulePlusType[]> {
    // Get a singular list of dependencies, in case there are duplicates.
    const modArray = Object.values(mods);
    const depIds: Set<string> = new Set(dependencies.filter(d => !!d.UniqueID).map(d => d.UniqueID as string));
    const filteredDependencies = [...depIds].reduce((prev: { UniqueID: string, isRequired?:boolean, MinimumVersion?: string }[], cur: string) => {
        const match = dependencies.find(d => d.UniqueID === cur);
        if (match != undefined) prev.push(match);
        return prev;
    }, []);
    // Prepare to return the rules
    let smapiRules: IModRulePlusType[] = [];

    // Missing dependencies
    const missingDependencies: { UniqueID: string, isRequired?: boolean, MinimumVersion?: string }[] = [];
    
    // Iterate over all dependency IDs and try to map it to a mod.
    for (const depToFind of filteredDependencies) {
        const depName: string = depToFind.UniqueID || '';
        const candidates = modArray.filter(m => m.attributes?.smapiManifests?.[depName]);
        if (candidates.length) {
            // Found a possible match
            const match = candidates.find(mod => {
                const version = depToFind.MinimumVersion;
                if (!version) return true;
                const modDepVersion = mod.attributes?.smapiManifests[depName].Version;
                if (!modDepVersion) return false;
                return semver.satisfies(modDepVersion, `${semver.coerce(version)}^`);               
            });

            if (!!match) {
                smapiRules.push({
                    type: depToFind.isRequired === true ? 'requires' : 'recommends',
                    reference: {
                        versionMatch:  depToFind.MinimumVersion ? `${depToFind.MinimumVersion}^` : '*',
                        description: depToFind.UniqueID,
                        id: match.id
                    }
                });
                continue;
            }

        }
        // Failed to find a match! Push it to the SMAPI API queue.
        missingDependencies.push(depToFind);
    }

    // Lookup the missing dependencies with SMAPI
    try {
        const SMAPI = new SMAPI_API(api);
        const missingMods: IAPIModIdentity[] = missingDependencies.map(d => ({ id: d.UniqueID }));
        const smapiData = await SMAPI.sendQuery(missingMods, true);
        // Add the external dependencies to the state as rules
        const rules: IModRulePlusType[] = missingDependencies.map(mod => {
            const smapiInfo = smapiData.find(s => s.id.toLowerCase() === mod.UniqueID.toLowerCase());
            if (!!smapiInfo) {
                const depRule: IModRulePlusType = {
                    type: mod.isRequired === true ? 'requires' : 'recommends',
                    reference: {
                        idHint: smapiInfo.id,
                        description: smapiInfo.id,
                        instructions: 'Download the required version.'
                    },
                    downloadHint: {
                        mode: 'browse',
                        url: smapiInfo.metadata?.main?.url || `https://nexusmods.com/${GAME_ID}/mods/`
                    },
                    extra: {
                        required: mod.isRequired || false
                    }
                }
                return depRule;

            }
            else {
                // Somehow we didn't get the info for this rule. 
                return {
                    type: mod.isRequired === true ? 'requires' : 'recommends',
                    reference: {
                        version: mod.MinimumVersion ? `${mod.MinimumVersion}^` : '*',
                        fileExpression: mod.UniqueID
                    }
                }
                
            }
        });
        smapiRules = [...smapiRules, ...rules];

    }
    catch(err) {
        log("error", "Could not get dependency data from SMAPI", err);
        return missingDependencies.map( depToFind => ({
            type: depToFind.isRequired === true ? 'requires' : 'recommends',
            reference: {
                version: depToFind.MinimumVersion ? `${depToFind.MinimumVersion}^` : '*',
                fileExpression: depToFind.UniqueID
            }
        }));
    }

    return smapiRules;
}