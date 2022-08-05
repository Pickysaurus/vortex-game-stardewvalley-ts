import * as path from 'path';
import * as rjson from 'relaxed-json';
import { fs, types, log, util } from 'vortex-api';
import { GAME_ID, getManifestValue } from '../common';
import { ISMAPIManifest, SMAPIManifestClass } from '../types/smapi-types';
import SMAPI_API, { getModDependencies } from '../SMAPI_API';

const PTRN_CONTENT = path.sep + 'Content' + path.sep;
const MANIFEST_FILE = 'manifest.json';

async function testSupported(files: string[], gameId: string) {
    const supported = (gameId === GAME_ID)
      && (files.find(isValidManifest) !== undefined)
      && (files.find(file => {
        // We create a prefix fake directory just in case the content
        //  folder is in the archive's root folder. This is to ensure we
        //  find a match for "/Content/"
        const testFile = path.join('fakeDir', file);
        return (testFile.endsWith(PTRN_CONTENT));
      }) === undefined);
    return { supported };
}

function isValidManifest(filePath: string): boolean {
    const segments = filePath.toLowerCase().split(path.sep);
    const isManifestFile = segments[segments.length - 1] === MANIFEST_FILE;
    const isLocale = segments.includes('locale');
    return isManifestFile && !isLocale;
}

interface IModwithManifest {
    manifest: ISMAPIManifest;
    manifestFile: string;
    rootFolder: string;
    manifestIndex: number;
    modFiles: string[];
}

async function install(context: types.IExtensionContext, files: string[], destinationPath: string): Promise<types.IInstallResult> {
    // The archive may contain multiple manifest files which would
    //  imply that we're installing multiple mods.
    const manifestFiles = files.filter(isValidManifest);

    // Collect the unique IDs and versions from the manifests
    const smapiManifests: {[id: string]: ISMAPIManifest} = {};
    
    // Collect any modrules
    let rules : types.IModRule[] = [];
    
    // Gather data from the mod manifests. Use the manifest files to split the files list into mods. 
    const modManifests: IModwithManifest[] = await Promise.all(manifestFiles.map(async (manifestFile) => {
        const rootFolder = path.dirname(manifestFile);
        const manifestIndex = manifestFile.toLowerCase().indexOf(MANIFEST_FILE);
        const modFiles = files.filter(file => 
            (file.indexOf(rootFolder) !== -1)
            && (path.dirname(file) !== '.' || rootFolder === '.')
            && !file.endsWith(path.sep));
        
        const manifest: ISMAPIManifest = new SMAPIManifestClass(await getModManifest(destinationPath, manifestFile));

        if (!!manifest) {
            // Convert to a consistent type
            const modManifest = new SMAPIManifestClass(manifest);
            // Save the data we need for SMAPI checks
            const id: string = modManifest.UniqueID;
            const installedVersion: string = modManifest.Version;
            if (!!id && !!installedVersion) smapiManifests[id] = modManifest.toJSON();
            // Add rule dependencies
            // const modRules: types.IModRule[] = await getModDependencies(context, manifest);
            // if (modRules.length) rules = [...modRules, ... rules];
        }
        
        return {
            manifest,
            manifestFile,
            rootFolder,
            manifestIndex,
            modFiles,
        }
        
    }));

    // Resolve the mod and manifest into groups of instructions.
    const modInstructions: types.IInstruction[][] = modManifests.map((mod) => {
        const resolveNameEntry = (data: ISMAPIManifest): string =>
            ['Name', 'uniqueid', 'name'].find(entry => data.hasOwnProperty(entry));
        const nameKey = resolveNameEntry(mod.manifest);
        const manifestModName: string = mod.manifest[nameKey]?.replace(/[^a-zA-Z0-9]/g, '');
        const modName = (mod.rootFolder !== '.')
        ? mod.rootFolder
        : manifestModName;

        return mod.modFiles.map((file: string) => {
            const destination = path.join(modName, file.substring(mod.manifestIndex));
            return {
                type: 'copy',
                source: file,
                destination: destination
            }
        });
    });

    // Build instructions from our rules.
    const ruleInstr = rules.length ? rules.map(r => ({
        type: 'rule',
        rule: {
            type: r.extra?.required ? 'requires' : 'recommends',
            comment: '',
            version: '*',
            ...r
        }
    })) : [];

    // If we found some SMAPI IDs, save them as an attribute.
    let instructions : types.IInstruction[] = [].concat.apply( [], modInstructions);
    if (Object.keys(smapiManifests).length) instructions = [...instructions, { type: 'attribute', key: 'smapiManifests', value: smapiManifests }];
    if (ruleInstr.length) instructions = [...instructions, ...ruleInstr as types.IInstruction[]];

    return { instructions };
}

async function getModManifest(destinationPath: string, manfiestFile: string): Promise<ISMAPIManifest> {
    const manifestPath = path.join(destinationPath, manfiestFile);
    try {
        const file = await fs.readFileBOM(manifestPath, 'utf8');
        const manifest: ISMAPIManifest = rjson.parse(file);
        return manifest;
    }
    catch(err) {
        log('error', 'Unable to parse manifest.json file', manifestPath);
        return {};
    }
}


async function getModName(destinationPath: string, manifestFile: string): Promise<string> {
    const manifestPath = path.join(destinationPath, manifestFile);
    const resolveNameEntry = (data: object): string =>
      ['Name', 'uniqueid', 'name'].find(entry => data.hasOwnProperty(entry));
    try {
      const file = await fs.readFileAsync(manifestPath, { encoding: 'utf8' });
      // it seems to be not uncommon that these files are not valid json,
      // so we use relaxed-json to improve our chances of parsing successfully
      const data = rjson.parse(util.deBOM(file));
      const nameElement = resolveNameEntry(data);
      return (data[nameElement] !== undefined)
        ? Promise.resolve(data[nameElement].replace(/[^a-zA-Z0-9]/g, ''))
        : Promise.reject(new util.DataInvalid('Invalid manifest.json file'));
    } catch(err) {
      log('error', 'Unable to parse manifest.json file', manifestPath);
      return path.basename(destinationPath, '.installing');
    }
}

export { testSupported, install };