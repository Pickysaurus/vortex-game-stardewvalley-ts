import * as path from 'path';
import { fs, log, types, util } from 'vortex-api';
import { GAME_ID, SMAPI_EXE, STEAMAPP_ID, GOGAPP_ID, XBOXAPP_ID } from './common';
import SDVSaves from './saved-games';
import { ISaveGameData } from './types/save-types';

export default class StardewValley implements types.IGame {
    private context: types.IExtensionContext;
    public id: string;
    public name: string;
    public logo: string;
    public requiredFiles: string[];
    public environment: {[ key: string]: string };
    public details: Object;
    public supportedTools: any[];
    public mergeMods: boolean; 
    public requiresCleanup: boolean;
    public shell: boolean;
    public saves: ISaveGameData;

    constructor(context: types.IExtensionContext) {
        this.context = context;
        this.id = GAME_ID;
        this.name = 'Stardew Valley';
        this.logo = 'gameart.jpg';
        this.requiredFiles = process.platform == 'win32'
            ? ['Stardew Valley.exe']
            : ['StardewValley', 'StardewValley.exe']
        this.environment = {
            SteamAppId: STEAMAPP_ID
        };
        this.details = {
            steamAppId: parseInt(STEAMAPP_ID),
            gogAppId: GOGAPP_ID,
            xboxAppId: XBOXAPP_ID
        };
        this.supportedTools = [
            {
              id: 'smapi',
              name: 'SMAPI',
              logo: 'smapi.png',
              executable: () => SMAPI_EXE,
              requiredFiles: [SMAPI_EXE],
              shell: true,
              exclusive: true,
              relative: true,
              defaultPrimary: true,
            }
        ];
        this.mergeMods = true;
        this.requiresCleanup = true;
        this.shell = process.platform == 'win32';
        this.saves = SDVSaves;
    }

    async queryPath() {
        const game: types.IGameStoreEntry = await util.GameStoreHelper.findByAppId([STEAMAPP_ID, GOGAPP_ID, XBOXAPP_ID]);
        if (!!game) return game.gamePath;
    }

    // The EXE to launch the game, file ext omitted for Linux/MacOS
    executable(): string {
        return process.platform == 'win32'
        ? 'Stardew Valley.exe'
        : 'StardewValley';
    }

    // Mods are stored in the "Mods" folder in the game root, by default.
    // This path can be changed with a CLI parameter in SMAPI, but we don't want to use that here.
    queryModPath = (): string => 'Mods' ;

    // Setup function that runs when the game is managed and when switching to it.
    async setup(discovery: types.IDiscoveryResult) {
        try {
            await fs.ensureDirWritableAsync(path.join(discovery.path, 'Mods'));
        }
        catch(err) {
            return Promise.reject(new Error('Unable to write to Mods folder for Stardew Valley: '+ err.message));
        }

        // Check if SMAPI is installed/deployed.
        const smapiPath = path.join(discovery.path, SMAPI_EXE);
        try {
            await fs.statAsync(smapiPath);
        }
        catch(err) {
            if (err.code !== 'ENOENT') log('warn', 'Unexpected error checking for SMAPI', err);
            return this.context.api.sendNotification({
                id: 'smapi-missing',
                type: 'warning',
                title: 'SMAPI is not installed',
                message: 'SMAPI is required to mod Stardew Valley',
                displayMS: 10000,
                actions: [
                    {
                        title: 'Get SMAPI',
                        action: async (dismiss) => {
                            try {
                                // Attempt to open the SMAPI mod page in the user's browser.
                                await util.opn('https://www.nexusmods.com/stardewvalley/mods/2400');
                            }
                            catch(err) {}
                            dismiss();
                        }
                    }
                ]
            })
        }

    };
}
