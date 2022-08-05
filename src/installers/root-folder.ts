import * as path from 'path';
import { fs, types, log, util } from 'vortex-api';
import { GAME_ID } from '../common';

const PTRN_CONTENT = path.sep + 'Content' + path.sep;
const MANIFEST_FILE = 'manifest.json';

async function testRootFolder(files: string[], gameId: string): Promise<{ supported: boolean, requiredFiles?: string[] }> {
    // We assume that any mod containing "/Content/" in its directory
    //  structure is meant to be deployed to the root folder.
    const filtered = files.filter(file => file.endsWith(path.sep))
      .map(file => path.join('fakeDir', file));
    const contentDir = filtered.find(file => file.endsWith(PTRN_CONTENT));
    const supported = ((gameId === GAME_ID)
      && (contentDir !== undefined));
  
    return { supported };
}

async function installRootFolder(files: string[]): Promise<types.IInstallResult> {
    // We're going to deploy "/Content/" and whatever folders come alongside it.
    //  i.e. SomeMod.7z
    //  Will be deployed     => ../SomeMod/Content/
    //  Will be deployed     => ../SomeMod/Mods/
    //  Will NOT be deployed => ../Readme.doc
    const contentFile: string|undefined = files.find(file => path.join('fakeDir', file).endsWith(PTRN_CONTENT));
    if (!contentFile) throw new Error('Could not install mod as it does not include a "Content" folder.');
    const idx = (contentFile).indexOf(PTRN_CONTENT) + 1;
    const rootDir = path.basename(contentFile.substring(0, idx));
    const filtered = files.filter(file => !file.endsWith(path.sep)
      && (file.indexOf(rootDir) !== -1)
      && (path.extname(file) !== '.txt'));
    const instructions: types.IInstruction[] = filtered.map(file => {
      return {
        type: 'copy',
        source: file,
        destination: file.substr(idx),
      };
    });
  
    return { instructions };
}

async function isRootFolderMod(instructions: types.IInstruction[]) {
    // Only interested in copy instructions.
    const copyInstructions = instructions.filter(instr => instr.type === 'copy');
    // This is a tricky pattern so we're going to 1st present the different packaging
    //  patterns we need to cater for:
    //  1. Replacement mod with "Content" folder. Does not require SMAPI so no
    //    manifest files are included.
    //  2. Replacement mod with "Content" folder + one or more SMAPI mods included
    //    alongside the Content folder inside a "Mods" folder.
    //  3. A regular SMAPI mod with a "Content" folder inside the mod's root dir.
    //
    // pattern 1:
    //  - Ensure we don't have manifest files
    //  - Ensure we have a "Content" folder
    //
    // To solve patterns 2 and 3 we're going to:
    //  Check whether we have any manifest files, if we do, we expect the following
    //    archive structure in order for the modType to function correctly:
    //    archive.zip =>
    //      ../Content/
    //      ../Mods/
    //      ../Mods/A_SMAPI_MOD\manifest.json
    const hasManifest = copyInstructions.find(instr =>
      instr.destination?.endsWith(MANIFEST_FILE))
    const hasModsFolder = copyInstructions.find(instr =>
      instr.destination?.startsWith('Mods' + path.sep)) !== undefined;
    const hasContentFolder = copyInstructions.find(instr =>
      instr.destination?.startsWith('Content' + path.sep)) !== undefined

    return (hasManifest)
      ? Promise.resolve(hasContentFolder && hasModsFolder)
      : Promise.resolve(hasContentFolder);
  }



export {testRootFolder, installRootFolder, isRootFolderMod};