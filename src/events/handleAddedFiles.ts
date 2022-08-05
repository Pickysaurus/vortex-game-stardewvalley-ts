import * as path from 'path';
import { fs, selectors, types, util, log } from 'vortex-api';
import { GAME_ID } from '../common';
import { getBundledMods } from '../installers/smapi';

async function handleAddedFiles(api: types.IExtensionApi, profileId: string, files: { filePath: string, candidates: string[]}[]) {
    const state = api.getState();
    const profile = selectors.profileById(state, profileId);
    if (profile.gameId !== GAME_ID) return;

    const game = util.getGame(GAME_ID);
    const discovery = selectors.discoveryByGame(state, GAME_ID);
    const modPaths = game.getModPaths(discovery.path);
    const installPath = selectors.installPathForGame(state, GAME_ID);

    await Promise.all(files.map(async (file) => {
        // only act if we know which mod owns the file.
        if (!file.candidates.length) return;
        const mod = state.persistent.mods[GAME_ID]?.[file.candidates[0]];
        if (!isModCandidateValid(mod, file)) return;
        const relPath = path.relative(modPaths[mod.type ?? ''], file.filePath);
        const targetPath = path.join(installPath, mod.id, relPath);
        
        // copy the new file back into the corresponding mod, then delete it. That way, vortex will
        // create a link to it with the correct deployment method and not ask the user any questions
        await fs.ensureDirAsync(path.dirname(targetPath));
        try {
            await fs.copyAsync(file.filePath, targetPath);
            await fs.removeAsync(file.filePath);
        } catch(err) {
            if (!err.message.includes('are the same file')) {
                // should we be reporting this to the user? This is a completely
                // automated process and if it fails more often than not the
                // user probably doesn't care
                log('error', 'failed to re-import added file to mod', err.message);
            }
        }
    }));
}

const isModCandidateValid = (mod: types.IMod, entry: { filePath: string, candidates: string[] }) => {
    if (mod?.id === undefined || mod.type === 'sdvrootfolder') {
      // There is no reliable way to ascertain whether a new file entry
      //  actually belongs to a root modType as some of these mods will act
      //  as replacement mods. This obviously means that if the game has
      //  a substantial update which introduces new files we could potentially
      //  add a vanilla game file into the mod's staging folder causing constant
      //  contention between the game itself (when it updates) and the mod.
      //
      // There is also a potential chance for root modTypes to conflict with regular
      //  mods, which is why it's not safe to assume that any addition inside the
      //  mods directory can be safely added to this mod's staging folder either.
      return false;
    }

    if (mod.type !== 'SMAPI') {
      // Other mod types do not require further validation - it should be fine
      //  to add this entry.
      return true;
    }

    const segments = entry.filePath.toLowerCase().split(path.sep).filter(seg => !!seg);
    const modsSegIdx = segments.indexOf('mods');
    const modFolderName = ((modsSegIdx !== -1) && (segments.length > modsSegIdx + 1))
      ? segments[modsSegIdx + 1] : undefined;

    let bundledMods = util.getSafe(mod, ['attributes', 'smapiBundledMods'], []);
    bundledMods = bundledMods.length > 0 ? bundledMods : getBundledMods();
    if (segments.includes('content')) {
      // SMAPI is not supposed to overwrite the game's content directly.
      //  this is clearly not a SMAPI file and should _not_ be added to it.
      return false;
    }

    return (modFolderName !== undefined) && bundledMods.includes(modFolderName);
  };


export default handleAddedFiles;