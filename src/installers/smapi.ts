import * as path from 'path';
import { fs, types, log, util } from 'vortex-api';
import { GAME_ID, SMAPI_EXE } from '../common';
const SMAPI_DLL = 'SMAPI.Installer.dll';
const SMAPI_DATA = ['windows-install.dat', 'install.dat'];
const _SMAPI_BUNDLED_MODS = ['ErrorHandler', 'ConsoleCommands', 'SaveBackup'];
const getBundledMods = () => {
    return Array.from(new Set(_SMAPI_BUNDLED_MODS.map(modName => modName.toLowerCase())));
 }


function testSMAPI(files: string[], gameId: string): { supported: boolean, requiredFiles: string[] } {
    // Make sure the archive contains the SMAPI data archive.
    const supported = (gameId === GAME_ID) && (!!files.find(f => path.basename(f) === SMAPI_DLL));
    return { supported, requiredFiles: [] };
}

async function installSMAPI(getDiscoverPath: () => string, files: string[], destinationPath: string): Promise<types.IInstallResult> {
    // The folder we want to extract SMAPI from depends on the OS the user is running. Match the OS to the folder name.
    const folder = process.platform === 'win32' 
    ? 'windows'
    : process.platform === 'linux'
        ? 'linux'
        : 'macos';
    // Check if the file is for the correct platform.
    const fileHasCorrectPlatform = (file: string) => {
        const segments = file.split(path.sep).map(seg => seg.toLowerCase());
        return (segments.includes(folder));
    }

    // INSTALLER STARTS HERE
    // Find the SMAPI Data archive
    const dataFile = files.find(f => {
        const isCorrectPlatform = fileHasCorrectPlatform(f);
        return isCorrectPlatform && SMAPI_DATA.includes(path.basename(f).toLowerCase());
    });

    if (dataFile === undefined) {
        return Promise.reject( new util.DataInvalid('Failed to find the SMAPI data files - download appears '
        + 'to be corrupted; please re-download SMAPI and try again') );
    }

    let data = '';
    try {
        // Grab the Stardew Valley.deps.json file, as we'll need to add this in. 
        data = await fs.readFileAsync(path.join(getDiscoverPath(), 'Stardew Valley.deps.json'), { encoding: 'utf8' });
    }
    catch(err) {
        log('error', 'Failed to parse Stardew Valley.deps.json', err);
    }

    // file will be outdated after the walk operation so prepare a replacement. 
    const updatedFiles = [];

    const szip = new util.SevenZip();
    // Unzip the files from the data archive. This doesn't seem to behave as described here: https://www.npmjs.com/package/node-7z#events
    await szip.extractFull(path.join(destinationPath, dataFile), destinationPath);

    // Find any files that are not in the parent folder.
    await util.walk(destinationPath, (iter, stats) => {
        const relPath = path.relative(destinationPath, iter);
        //Filter out files from the original install as they're not longer required.
        if (!files.includes(relPath) && stats.isFile() && !files.includes(relPath+path.sep)) updatedFiles.push(relPath);
        const segments = relPath.toLocaleLowerCase().split(path.sep);
        const modsFolderIdx = segments.indexOf('mods');
        if ((modsFolderIdx !== -1) && (segments.length > modsFolderIdx + 1)) {
          _SMAPI_BUNDLED_MODS.push(segments[modsFolderIdx + 1]);
        }
    });

    // Find the SMAPI EXE file
    const smapiExe = updatedFiles.find(file => file.toLowerCase().endsWith(SMAPI_EXE.toLowerCase()));
    if (smapiExe === undefined) {
      return Promise.reject(new util.DataInvalid(`Failed to extract ${SMAPI_EXE} - download appears `
        + 'to be corrupted; please re-download SMAPI and try again'));
    }
    const idx = smapiExe.indexOf(path.basename(smapiExe));

    // Build the instructions for installation. 
    const instructions: types.IInstruction[] = updatedFiles.map(file => {
        return {
            type: 'copy',
            source: file,
            destination: path.join(file.substr(idx)),
        }
    });
  
    instructions.push({
      type: 'attribute',
      key: 'smapiBundledMods',
      value: getBundledMods(),
    });
  
    instructions.push({
      type: 'generatefile',
      data,
      destination: 'StardewModdingAPI.deps.json',
    });
  
    return Promise.resolve({ instructions });
}

function isSMAPIModType(instructions): Promise<boolean> {
    // Find the SMAPI exe file.
    const smapiData = instructions.find(inst => (inst.type === 'copy') && inst.source.endsWith(SMAPI_EXE));
  
    return Promise.resolve(smapiData !== undefined);
}

export { testSMAPI, installSMAPI, isSMAPIModType, getBundledMods };