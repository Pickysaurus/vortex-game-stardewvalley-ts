import { log, selectors, types } from "vortex-api";
import { IGameExt, ISaveGameData } from './types';
import SavedGamesPage from './views/SavedGamesPage';
import SaveGameSessionReducer from './reducers/SaveGameSessionReducer';
import * as actions from './actions/SaveGameSessionActions';
import examples from './examples/save-examples';


//This is the main function Vortex will run when detecting the game extension. 
function main(context: types.IExtensionContext) {

    context.registerReducer(['session', 'savegames'], SaveGameSessionReducer);

    context.registerMainPage('savegame', 'Save Games', SavedGamesPage, {
        id: 'saved-games-page',
        hotkey: 'S',
        group: 'per-game',
        visible: () => {
            const state: types.IState = context.api.getState();
            const gameId: string = selectors.activeGameId(state);
            const game: IGameExt = selectors.gameById(state, gameId);
            if (!game) return false;
            if (!game.saves && !examples[game.id]) return false;
            return true;
        },
        priority: 120,
        props: () => {}
    });

    context.once(() => contextOnce(context));

    return true;
}

function contextOnce(context: types.IExtensionContext) {
    context.api.events.on('profile-did-change', (newProfileId: string) => {
        // When the profile changes, we want to check where our saves path is.
        const state = context.api.getState();
        const profile: types.IProfile = selectors.profileById(state, newProfileId);
        const game: IGameExt = selectors.gameById(state, profile.gameId);
        const saveData: ISaveGameData = game.saves || examples[game.id];
        if (!saveData) return;
        else context.api.store.dispatch(actions.setSavesPath(saveData.saveFolder(context.api, profile.id)));
    });

    context.api.events.on('get-saves', async (game: IGameExt, profileId: string, callback: () => void, overwrite?: boolean) => {
        if (!game.saves && !examples[game.id]) return;
        const state = context.api.getState();

        // Check we can actually process these saves.
        const saveData: ISaveGameData = game.saves || examples[game.id];
        const savePath: string = (state as any)?.session?.savegames?.savesPath;
        if (!saveData || !savePath) log('error', 'Unable to process saved games', game);

        // CHECK FOR PROFILE SPECIFIC SAVES (TBC!)

        // END PROFILES LOGIC
        
        let saves = [];
        // Use the quick fetch function
        try {
            saves = await saveData.quickParse(savePath);
        }
        catch(err) {
            log('error', `Could not perform quick parse on saves for ${game.id}`, savePath);
        }

        // Commit what we have to the state and trigger the callback.
        context.api.store.dispatch(actions.setCurrentSaves(saves));

        // Use the full fetch function
        try {
            saves = await saveData.fullParse(savePath, saves);
            context.api.store.dispatch(actions.setCurrentSaves(saves));
        }
        catch(err) {
            log('error', `Could not perform full parse on saves for ${game.id}`, savePath);
        }

        callback();

    });
}

module.exports = {
    default: main,
};