import * as path from 'path';
import * as React from 'react';
import { types, util, TableDateTimeFilter, TableTextFilter, ITableRowAction, fs, log } from 'vortex-api';
import { IGameExt, ISave } from '../types';

const defaultcolumns = (game: IGameExt) : types.ITableAttribute[] => ([
    {
        id: 'image',
        name: 'Image',
        description: 'Image Associated with the saved game',
        icon: 'id-badge',
        calc: (save: ISave) => save.details?.name || save.id,
        customRenderer: (save: ISave, detail: boolean, t) => {
            let backgroundImage = save.details?.image || game.saves?.fallbackImage || path.join(game.extensionPath as string, game.logo as string);
            if (!(backgroundImage as string).startsWith('http')) backgroundImage = `file://${(backgroundImage as string).replace(/[\\]+/g, '/')}`;
            
            return (
                <div
                    style={{
                        backgroundImage: `url('${backgroundImage}')`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        height: !detail ? '50px' : '150px',
                        width: !detail ? '100px' : 'auto',
                        border: '1px solid var(--border-color)',
                        backgroundRepeat: 'no-repeat'
                    }}
                />
            );
        },
        placement: 'both',
        isDefaultVisible: true,
        isToggleable: true,
        edit: {},
        position: 10
    },
    {
        id: 'name',
        name: 'Name',
        description: 'Save Game name',
        icon: 'id-badge',
        calc: (save: ISave) => save.details?.name || save.id,
        placement: 'both',
        isDefaultVisible: true,
        isSortable: true,
        edit: {},
        filter: new TableTextFilter(true),
        position: 10
    },
    {
        id: 'date',
        name: 'Date',
        description: 'Last Updated Time',
        icon: 'calendar',
        calc: (save: ISave) => save?.date,
        placement: 'both',
        isDefaultVisible: true,
        isDefaultSort: true,
        isSortable: true,
        filter: new TableDateTimeFilter(),
        customRenderer: (save: ISave, detail: boolean, t) => 
            (<span title={save.date?.toLocaleDateString(util.getCurrentLanguage())}>{save.date?.getTime() ? util.userFriendlyTime(save?.date, t, util.getCurrentLanguage()): null}</span>),
        edit: {},
        position: 20
    },
    {
        id: 'size',
        name: 'Size',
        description: 'File Size',
        icon: 'calendar',
        calc: (save: ISave) => util.bytesToString(save.size),
        placement: 'both',
        isDefaultVisible: true,
        edit: {},
        position: 30
    },
    {
        id: 'summary',
        name: 'Summary',
        description: 'Save summary',
        icon: 'calendar',
        customRenderer: (save: ISave) => (
            <textarea
                className='textarea-details'
                value={save.details?.summary}
                readOnly={true}
            />
        ),
        calc: (save: ISave) => save.details?.summary || '',
        placement: 'detail',
        isDefaultVisible: true,
        edit: {},
        position: 110
    },
    {
        id: 'files',
        name: 'File(s)',
        description: 'File Size',
        icon: 'calendar',
        customRenderer: (save: ISave) => (
           <textarea
                className='textarea-details'
                value={save.paths?.join('\n')}
                readOnly={true}
            />
        ),
        calc: (save: ISave) => save.paths?.join('/n'),
        placement: 'detail',
        isDefaultVisible: true,
        edit: {},
        position: 120
    },
]);

const defaultActions = (api: types.IExtensionApi, saves: ISave[], savePath: string, remove: (saves: ISave[]) => any): ITableRowAction[] => ([
    {
        icon: 'delete',
        title: 'Delete',
        action: (ids) => {
            if (!Array.isArray(ids)) ids = [ids];
            const rSaves = ids.map(i => saves[i]);
            return deleteSaves(api, rSaves, savePath, remove);
        }
    }
]);

async function deleteSaves(api: types.IExtensionApi, saves: ISave[], savePath: string, successCallback: (saves: ISave[]) => any): Promise<void> {
    console.log('Deleting saves', saves);

    const userInput = await api.showDialog('question', `Delete (${saves.length}) save games`, {
        bbcode: 'Are you sure you want to delete the following saved games?',
        message: saves.map(s => `${s.details.name || s.id}\n${s.paths.map(f => `- ${f}`).join('\n')}`).join('\n')
    }, [ { label: 'Cancel', }, { label: 'Delete' } ]);

    if (userInput.action !== 'Delete') return;

    const successfulDeletes: ISave[] = [];
    for (const save of saves) {
        const filesToRemove = save.paths.map(p => path.join(savePath, p));
        let success = true;
        for (const file of filesToRemove) {
            try {
                await fs.removeAsync(file);
            }
            catch(err) {
                if (err.code === 'ENOENT') continue;
                else {
                    log('error', 'Failed to remove saved game file', { id: save.id, file, err });
                    success = false;
                };
            }
        }
        if (success) successfulDeletes.push(save);
    }
    // Remove the state entries for the files we removed. 
    successCallback(successfulDeletes);
}

export { defaultcolumns, defaultActions }