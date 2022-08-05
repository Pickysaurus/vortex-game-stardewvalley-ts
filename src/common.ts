import { log } from 'vortex-api';
import { ISMAPIManifest } from './types/smapi-types';

const GAME_ID = 'stardewvalley';
const SMAPI_EXE = 'StardewModdingAPI.exe';

// Game Store IDs
const STEAMAPP_ID = '413150';
const GOGAPP_ID = '1453375253';
const XBOXAPP_ID = 'ConcernedApe.StardewValleyPC';

function getManifestValue(manifest: any, key: string): any {
    if (!manifest) return undefined;
    if (manifest[key]) return manifest[key];
    else {
        const keyMatch = Object.keys(manifest).find(k => k.toLowerCase() === key.toLowerCase());
        if (keyMatch) return manifest[keyMatch];
        log('warn', 'Could not find key on SMAPI mod manifest', { key });
        return undefined;
    }
}

export { GAME_ID, SMAPI_EXE, STEAMAPP_ID, GOGAPP_ID, XBOXAPP_ID, getManifestValue };