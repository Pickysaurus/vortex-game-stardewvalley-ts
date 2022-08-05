import { createAction } from 'redux-act';
import { ISave } from '../types';

const setCurrentSaves = createAction('SET_CURRENT_SAVES', 
    (saves: ISave[]) => ({ saves })
);

const setSavesPath = createAction('SET_SAVES_PATH',
    (path: string) => ({ path })
);

const deleteSaves = createAction('DELETE_SAVE',
    (saves: ISave[]) => ({ saves })
);

export { setCurrentSaves, setSavesPath, deleteSaves };