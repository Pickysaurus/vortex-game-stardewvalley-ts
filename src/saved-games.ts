import { fs, log, types, util } from 'vortex-api';
import * as path from 'path';
import * as React from 'react';
import { parseStringPromise } from 'xml2js';
import { ISave, ISaveGameData,  } from './types/save-types';

// This is compatibility with a WIP Saved Game manager extension. 

const SDVSaves: ISaveGameData = {
    saveFolder: (api: types.IExtensionApi, profileId: string) => path.join(util.getVortexPath('appData'), 'StardewValley', 'Saves'),
    gameId: 'stardewvalley',
    quickParse: sdvQuickParse,
    fullParse: sdvFullParse,
    fallbackImage: '',
    customColumns: [
        {
            id: 'sdv-playtime',
            name: 'Playtime',
            description: 'How much time has been spent in this save',
            edit: {},
            placement: 'table',
            calc: (save: ISave) => save.details?.playTimeMS || 0,
            customRenderer: (save: ISave, detail: boolean, t): JSX.Element => React.createElement('p', {}, convertMsToHM(save.details?.playTimeMS || 0)),
            isSortable: true,
        }
    ],
    customActions: (api: types.IExtensionApi, saves: ISave[], savePath: string) => {
        return [
            {
                icon: 'undo',
                title: 'Undo last save',
                action: (ids: string | string[]) => undoLastSave(api, ids, saves, savePath),
                condition: (ids: string | string[]): boolean => showBackupOption(ids, saves)
            }
        ]
    }
}

async function sdvQuickParse(saveFolder: string): Promise<ISave[]> {
    // List all folders in this directory
    try {
        const saves = await fs.readdirAsync(saveFolder).catch(() => []);
        const saveFolders = saves.filter(s => !path.extname(s));
        let resultSaves: ISave[] = [];
        for (const folder of saveFolders) {
            const savePath = path.join(saveFolder, folder);
            const details: fs.Stats = await fs.statAsync(savePath);
            // Ignore anything that isn't a folder
            if (!details.isDirectory()) continue;
            const saveFiles: string[] = await fs.readdirAsync(savePath).catch(() => undefined);
            if (!saveFiles || !saveFiles?.length) continue;

            const saveFilePaths = saveFiles.map(s => path.join(savePath, s));

            const saveFileStats: fs.Stats[] = await Promise.all(saveFilePaths.map(async sf => await fs.statAsync(sf)));

            const totalSize = saveFileStats.reduce((p, c) => p += c.size, 0);

            const save: ISave = {
                id: folder,
                paths: [folder, ...saveFiles.map(s => path.join(folder, s))],
                date: new Date(details.mtime),
                size: totalSize
            }
            resultSaves.push(save);
        }

        return resultSaves;
    }
    catch(err) {
        log('error', 'Could not parse Stardew Valley saves', err);
        return [];
    }
}

async function sdvFullParse(saveFolder: string, basicSaves: ISave[]): Promise<ISave[]> {
    let fullSaves: ISave[] = [];

    for (const save of basicSaves) {
        const savePath = path.join(saveFolder, save.paths[0]);
        // Point to the XML file, it doesn't have an extension.
        const saveInfoPath = path.join(savePath, 'SaveGameInfo');
        try {
            // Check for backup files
            const hasBackup: boolean = save.paths.filter(s => s.endsWith('_old')).length > 0;
            // Load the save info XML file
            const saveRaw = await fs.readFileAsync(saveInfoPath, { encoding: 'utf8' });
            // Convert from XML to an object
            const saveGame = await parseStringPromise(saveRaw);
            // Read the attributes we want.

            const newSave: ISave = {
                ...save,
                details: {
                    name:  saveGame.Farmer?.name[0], //name XML
                    farm: saveGame.Farmer?.farmName[0], //farmName XML
                    money: parseInt(saveGame.Farmer?.money[0]) || 0, //money XML
                    day: parseInt(saveGame.Farmer?.dayOfMonthForSaveGame[0]), //dayOfMonthForSaveGame XML
                    season: parseInt(saveGame.Farmer?.seasonForSaveGame[0]), //seasonForSaveGame XML
                    year: parseInt(saveGame.Farmer?.yearForSaveGame[0]), //yearForSaveGame XML
                    playTimeMS: parseInt(saveGame.Farmer?.millisecondsPlayed[0]), //millisecondsPlayed XML
                    hasBackup
                }
            } 

            if (!newSave || !newSave.details) continue;
            newSave.details.summary = getSummarySDV(newSave);

            fullSaves.push(newSave);

        }
        catch(err) {
            const errorsave: ISave = {...save, errors: [ { message: 'Failed to parse saved game', details: err } ]};
            fullSaves.push(errorsave);
        }
    }

    return fullSaves;
}

function getSummarySDV(save: ISave): string {
    let gameSeason = 'unknown season';
    switch(save.details?.season) {
        case 0: gameSeason = 'Spring';
        break;
        case 1: gameSeason = 'Summer';
        break;
        case 2: gameSeason = 'Fall';
        break;
        case 3: gameSeason = 'Winter';
        break;
    }
    const gameDate = `Day ${save.details?.day} of ${gameSeason}, Year ${save.details?.year}`;
    const farmName = `${save.details?.farm} Farm`;
    const playtimeToHours = convertMsToHM(save.details?.playTimeMS);

    const summary = `${farmName}\n${gameDate}\n💰${save.details?.money.toLocaleString()} - ⏲️${playtimeToHours}`;

    return summary;
}

function convertMsToHM(ms: number): string {
    const padTo2Digits = (input: number) => input.toString().padStart(2, '0');

    let seconds = Math.floor(ms / 1000);
    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);

    seconds = seconds % 60;
    minutes = seconds >= 30 ? minutes + 1 : minutes;

    minutes = minutes % 60;

    return `${padTo2Digits(hours)}:${padTo2Digits(minutes)}`
}

function showBackupOption(ids: string | string[], saves: ISave[]): boolean {
    // Check if we found a backup when parsing the save for at least one entry. 
    if (!Array.isArray(ids)) ids = [ids];
    const savesList = ids.map(id => saves[id]);
    return !!savesList.find(s => s.details?.hasBackup === true);
}

async function undoLastSave(api: types.IExtensionApi, ids: string | string[], saves: ISave[], savePath: string) {
    if (!Array.isArray(ids)) ids = [ids];
    const savesList = ids.map(id => saves[id]).filter(s => s.details?.hasBackup === true);
    try {
        const consent = await api.showDialog('question', 'Undo Last Save', {
            text: 'Vortex will delete your latest saved game and roll back to the last automatic SMAPI save for the characters listed below. This cannot be undone. Would you like to continue?',
            message: savesList.map((s: ISave) => s.details?.name || s.id).join('\n')
        }, [
            {
                label: 'Cancel',
                default: true
            },
            {
                label: 'Continue'
            }
        ]);
        if (consent.action !== 'Continue') return;
        // Complete the rollback. 
        for (const save of savesList) {
            const backups: string[] = save.paths.filter(p => p.endsWith('_old'));
            if (!backups || !backups.length) continue;
            // Get the current files and ensure they are in our save directory.
            const current = backups.map(b => b.replace('_old', '')).filter(bu => save.paths.includes(bu));
            if (current.length !== backups.length) {
                log('warn', 'Mismatched original and backup files when rolling back SDV save', { current, backups });
                continue;
            }
            // Rename/remove the files
            for (const cur of current) {
                const originalPath = path.join(savePath, cur);
                const backupPath = path.join(savePath, `${cur}_old`);
                try {
                    // await fs.removeAsync(originalPath);
                    // For testing, we'll just rename it.
                    await fs.renameAsync(originalPath, originalPath+".removed");
                    await fs.renameAsync(backupPath, originalPath);
                }
                catch(err) {
                    log('error', 'Error removing/renaming SDV saved game file', err);
                    continue;
                }
            }
            // TODO refresh the altered saved game data!
            // Possibly need an event here, or an action to be dispatched? 
        }

    }
    catch(err) {
        log('error', 'Error reverting SDV saved game', err);
        api.showErrorNotification('Failed to roll back saved game(s)', err, { extensionName: 'Stardew Valley support' });
    }
    

}


export default SDVSaves;