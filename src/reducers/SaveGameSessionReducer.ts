import { types, util } from 'vortex-api';
import * as actions from '../actions/SaveGameSessionActions';

const SaveGameSessionReducer: types.IReducerSpec = {
    reducers: {
        [actions.setCurrentSaves as any]:
            (state, payload) => !!payload ? util.setSafe(state, ['saves'], payload.saves): util.deleteOrNop(state, ['saves']),
        [actions.deleteSaves as any]: 
            (state, payload) => {
                const { saves } = payload;
                const allSaves = util.getSafe(state, ['saves'], []);
                const removeIds = saves.map(s => s.id);
                const filtered = allSaves.filter(s => !removeIds.includes(s.id));
                return util.setSafe(state, ['saves'], filtered);
            },
        [actions.setSavesPath as any]:
            (state, payload) => util.setSafe(state, ['savesPath'], payload.path),
    },
    defaults: {
        saves: undefined,
        savesPath: undefined 
    }
}

export default SaveGameSessionReducer;