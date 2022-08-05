import { log, selectors } from "vortex-api";
import { IExtensionContext } from 'vortex-api/lib/types/api';
import { GAME_ID } from "./common";
import { testSMAPI, installSMAPI, isSMAPIModType } from './installers/smapi';
import { testSupported, install } from './installers/smapi-mods';
import { testRootFolder, installRootFolder, isRootFolderMod } from './installers/root-folder';
import onShowSMAPILog from './actions/showSMAPILog';
import handleAddedFiles from './events/handleAddedFiles';
import modToggled from './events/modToggled';
import StardewValley from './StardewValley';

function main(context: IExtensionContext) {
    // Register the game so it can be discovered.
    context.registerGame(new StardewValley(context));

    // A utility function to get the game folder.
    const getDiscoveryPath = (): string => {
        const state = context.api.getState();
        const discovery = state.settings?.gameMode?.discovered?.[GAME_ID];
        if (!discovery || !discovery.path) {
            // SDV isn't discovered
            log('error', 'Stardew Valley game path could not be found as the game is not discovered');
            return undefined;
        }
        return discovery.path;
    }

    // Register the installers and modtypes we'll need to handle differen kinds of mod. 

    // Regular SMAPI mods containing a manifest.json - placed in the "Mods folder"
    context.registerInstaller('stardew-valley-installer', 50, testSupported, (files, destinationPath) => install(context, files, destinationPath));

    // SMAPI - special logic to install SMAPI into Vortex as a mod. 
    context.registerInstaller('smapi-installer', 30, testSMAPI, (files, dest) => installSMAPI(getDiscoveryPath, files, dest));
    context.registerModType('SMAPI', 30, gameId => gameId === GAME_ID, getDiscoveryPath, isSMAPIModType);

    // Other mods that need to be added to the root folder
    // This includes XNBs (redundant) which overwrite the "Content" folder,
    // and Mods that include both SMAPI Mods and items for the Content folder.
    // It's possible this modtype won't get used anymore but it's a good fallback.
    context.registerInstaller('sdvrootfolder', 50, testRootFolder, installRootFolder);
    context.registerModType('sdvrootfolder', 25, (gameId) => (gameId === GAME_ID), () => getDiscoveryPath(), isRootFolderMod);

    // Add a button to the mods toolbar which allows the user to view and export a SMAPI log file. 
    context.registerAction(
        'mod-icons', 999, 'changelog', {}, 
        // @ts-ignore the function here doesn't allow a promise by type but it works just fine. 
        'SMAPI Log', () => onShowSMAPILog(context.api), 
        () => selectors.activeGameId(context.api.getState()) === GAME_ID
    );

    context.once(() => {
        context.api.onAsync('added-files', (profileId, files) => handleAddedFiles(context.api, profileId, files));
        context.api.events.on('mod-enabled', (profileId: string, modId: string) => modToggled(context.api, profileId, modId));
        // context.api.events.on('mod-disabled', (profileId: string, modId: string) => modToggled(context.api, profileId, modId));
    });
    return true;
}

module.exports = {
    default: main,
};