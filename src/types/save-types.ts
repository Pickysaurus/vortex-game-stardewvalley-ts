import { ITableRowAction, types } from 'vortex-api';
import { IExtensionContext } from 'vortex-api/lib/types/api';

interface ISave {
    // Unique ID (usually just the file name)
    id: string;
    // Relative paths to the base save folder.
    paths: string[];
    // Created or modified date, for sorting the table.
    date: Date;
    // Size
    size: number;
    // Optional extra details provided by the full parse function.
    details?: {
        name?: string;
        summary?: string;
        image?: string;
        [key: string]: any;
    }
    // Errors processing this save. 
    errors?: {
        message: string;
        details: Error;
    }[];
}

interface ISaveGameData {
    saveFolder: (api: types.IExtensionApi, profileId: string) => string;
    gameId: string;
    quickParse: ( saveFolder: string ) => Promise<ISave[]>;
    fullParse: ( saveFolder: string, saves: ISave[] ) => Promise<ISave[]>;
    profileManagement?: {
        onProfileChange: (oldProfileId: string, newProfileId: string) => Promise<void>; 
    }
    fallbackImage?: string | URL;
    customColumns?: types.ITableAttribute[];
    customActions?: (api: types.IExtensionApi, saves: ISave[], savePath: string) => ITableRowAction[];
}

interface IGameExt extends types.IGameStored {
    saves?: ISaveGameData;
}

export { ISaveGameData, ISave, IGameExt };