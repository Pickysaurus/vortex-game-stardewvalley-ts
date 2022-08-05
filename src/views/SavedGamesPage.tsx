import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { 
    selectors, types, MainContext,
    MainPage, IconBar, Table, Spinner, ToolbarIcon, 
    ITableRowAction, util
} from 'vortex-api';
import { Alert } from 'react-bootstrap';
import { IGameExt, ISave, ISaveGameData } from '../types';
import { setCurrentSaves, deleteSaves } from '../actions/SaveGameSessionActions';
import examples from '../examples/save-examples';
import { defaultActions, defaultcolumns } from '../util/tableDefaults';

interface IProps {
    active: boolean;
}

function SavedGamesPage(props: IProps): JSX.Element {
    // Import from the redux state or other hooks
    const { t } = useTranslation(['saved-games']);
    const game: IGameExt = useSelector((state: types.IState) => selectors.currentGame(state));
    const profile: types.IProfile = useSelector((state: types.IState) => selectors.activeProfile(state));
    const saves: ISave[] = useSelector((state: types.IState) => (state.session as any)?.savegames?.saves);
    const savesPath: string = useSelector((state: types.IState) => (state.session as any)?.savegames?.savesPath);
    const context: types.IExtensionContext = React.useContext(MainContext) as any;
    // Dispatch to state
    const dispatch = useDispatch();
    const setActiveSaves: (saves: ISave[]) => any = (saves: ISave[]) => dispatch(setCurrentSaves(saves));
    const deleteSavesGames: (saves: ISave[]) => any = (saves: ISave[]) => dispatch(deleteSaves(saves));
    // Values for the component state and props;
    const [loading, setLoading]: [boolean, React.Dispatch<any>] = React.useState(true); 
    const { active } = props;   

    React.useEffect(() => {
        const unsetLoading = () => setLoading(false);

        if (active === true && !saves) {
            setLoading(true);
            context.api.events.emit('get-saves', game, profile.id, unsetLoading, true);
        }
    }, [active, saves]);

    React.useEffect(() => {
        // Clear the save list when the game or save path changes.
        setActiveSaves(undefined);
    }, [game, savesPath]);

    const toolbar = [
        {
            component: ToolbarIcon,
            props: () => {
                return {
                    id: 'btn-refresh-saves',
                    key: 'btn-refresh-saves',
                    icon: 'refresh',
                    text: 'Refresh',
                    onClick: () => setActiveSaves(undefined),
                }
            }
        },
        {
            component: ToolbarIcon,
            props: () => {
                return {
                    id: 'btn-open-saves',
                    key: 'btn-open-saves',
                    icon: 'open-ext',
                    text: 'Open Save Games',
                    onClick: () => util.opn(savesPath).catch(() => undefined)
                }
            }
        }
    ];

    const saveFunc: ISaveGameData = game.saves || examples[game.id];

    const allColumns = [...defaultcolumns(game), ...(saveFunc?.customColumns || [])];

    const actions: ITableRowAction[] = [ ...defaultActions(context.api, saves, savesPath, deleteSavesGames), ...(saveFunc?.customActions?.(saves, savesPath) || []) ];
    return (
        <MainPage>
            <MainPage.Header>
                <IconBar 
                    t={t}
                    group='saved-games-icons'
                    staticElements={toolbar}
                    className='menubar'
                />
            </MainPage.Header>
            <MainPage.Body>
                { loading || saves?.length === undefined
                ? <Alert><Spinner /> {t('Fetching saved game data...')}</Alert>
                : null }
                { !!saves ?
                <Table 
                    tableId='saved-games'
                    actions={actions}
                    data={saves || []}
                    staticElements={allColumns}
                />
                : <Spinner/>}
            </MainPage.Body>
        </MainPage>
    );
}



export default (SavedGamesPage);