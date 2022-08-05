import * as path from 'path';
// import * as React from 'react';
import { fs, log, util, types, selectors } from 'vortex-api';
import { ISave, ISaveGameData } from '../types';
// import { parseStringPromise } from 'xml2js';

const examples = {
    "xcom2-wotc": xcom2saveData('wotc'),
    "xcom2": xcom2saveData('base'),
    "morrowind": morrowindSaveData(),
}

function morrowindSaveData(): ISaveGameData {
    return {
        gameId: 'morrowind',
        saveFolder: (api, profileId) => {
            const state = api.getState();
            const game = selectors.currentGameDiscovery(state);
            return path.join(game?.path, 'Saves'); 
        },
        quickParse: async (savePath) => {
            const files: string[] = await fs.readdirAsync(savePath).catch(() => []);
            const saveFiles = files.filter(f => ['.ess'].includes(path.extname(f)));
            let saves: ISave[] = [];
            for (const save of saveFiles) {
                try {
                    const saveGamePath = path.join(savePath, save);
                    const saveData = fs.statAsync(saveGamePath);
                    if (saveData.isDirectory()) continue;
                    const data: ISave = {
                        id: save,
                        paths: [ save ],
                        date: saveData.mtime,
                        size: saveData.size,
                    }
                    saves.push(data);
                }
                catch(err) {
                    log('error', 'Failed to parse Morrowind saved game', { err, save });
                    const errorSave: ISave = { id: save, paths: [ save ], date: new Date(0), size: -1, errors: [ { message: 'Failed to parse saved game', details: (err as Error) } ] };
                    saves.push(errorSave);
                }
            }
            return saves;
            
        },
        fullParse: async (savePath, saves: ISave[]) => saves,
    }
}

function xcom2saveData(type: 'wotc' | 'base'): ISaveGameData {
    if (type === 'wotc') {
        return {
            saveFolder: (api: types.IExtensionApi, profileId: string) => path.join(util.getVortexPath('documents'), 'My Games', 'XCOM2 War of the Chosen', 'XComGame', 'SaveData'),
            gameId: 'xcom2-wotc',
            quickParse: xcom2quickparse,
            fullParse: xcom2fullparse,
            fallbackImage: '',
            customColumns: [
                {
                    id: 'xcom2-savetype',
                    name: 'Save Type',
                    description: 'Type of saved game',
                    icon: 'inspect',
                    calc: (save: ISave) => (save.id.toLowerCase().includes('autosave')) ? 'Autosave' : 'Manual',
                    placement: 'detail',
                    edit: {},
                    position: 115
                }
            ]
        }

    }
    else if (type === 'base') {
        return {
            saveFolder: (api: types.IExtensionApi, profileId: string) => path.join(util.getVortexPath('documents'), 'My Games', 'XCOM2', 'XComGame', 'SaveData'),
            gameId: 'xcom2',
            quickParse: xcom2quickparse,
            fullParse: xcom2fullparse,
            fallbackImage: '',
            customColumns: []
        }
    }
}

async function xcom2quickparse(saveFolder: string): Promise<ISave[]> {
    // List all files in the folder
    try {
        const saves = await fs.readdirAsync(saveFolder).catch(() => []);
        // XCOM2 saves do not have a file extension.
        const saveFiles = saves.filter(s => !path.extname(s));
        let resultSaves: ISave[] = [];
        for (const saveGame of saveFiles) {
            const savePath = path.join(saveFolder, saveGame);
            const details: fs.Stats = await fs.statAsync(savePath);
            // Ignore folders (not that there should be any!)
            if (details.isDirectory()) continue;
            const saveData: ISave = {
                id: saveGame,
                paths: [saveGame],
                date: new Date(details.mtime),
                size: details.size
            }
            resultSaves.push(saveData);

        }

        return resultSaves;
    }
    catch(err) {
        log('error', 'Could not parse XCOM2 saves', err);
        return [];
    }

}

async function xcom2fullparse(saveFolder: string, basicSaves: ISave[]): Promise<ISave[]> {
    // Read the save data from each of the files
    let fullSaves: ISave[] = [];

    for (const save of basicSaves as ISave[]) {
        // If we're somehow missing files, stop here
        if (!save.paths?.[0]) {
            const errorsave: ISave = {...save, errors: [ { message: 'Missing save paths', details: new Error(`No save paths detected for ${save.id}`) } ]};
            fullSaves.push(errorsave);
            continue;
        }

        // The first and only file should be the one we want
        const savePath = path.join(saveFolder, save.paths[0]);
        try {
            // Load the save into memory.
            const saveRaw: string = await fs.readFileAsync(savePath, { encoding: 'utf-8' });
            // Grab the top few rows, as this contains the basic data.
            const saveHeader: string[] = saveRaw.split('\n').slice(0, 7);
            // The name of the save is on the third row
            const saveName: string = saveHeader[2];
            // Use the data on rows 3-6 as a summary
            const saveSummary: string = saveHeader.slice(3, 6).join('\n');
            const image = saveSummary.toLowerCase().includes('geoscape') ? path.join(__dirname, 'xcom2-save-geoscape.jpg') : path.join(__dirname, 'xcom2-save-generic.jpg')
            const fullSave: ISave = { ...save, details: { name: saveName, summary: saveSummary, image }};
            fullSaves.push(fullSave);
        }
        catch(err) {
            // Failed to parse the save
            const errorsave: ISave = {...save, errors: [ { message: 'Failed to parse saved game', details: err } ]};
            fullSaves.push(errorsave);
            
        }
    }

    // const savesObject: ISaves = fullSaves.reduce((prev, cur) => ({...prev, [cur.id]: cur}), {});
    return fullSaves;
}

export default examples;