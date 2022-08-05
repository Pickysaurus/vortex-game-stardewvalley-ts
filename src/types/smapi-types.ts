import { types } from "vortex-api";
import { getManifestValue } from "../common";

interface ISMAPIManifestBase {
    // Most fields are optional as SMAPI mods have inconsistent casing.
    /**Name of the mod */
    Name: string;
    /**Author of the mod */
    Author: string;
    /**Mod version */
    Version: string;
    /**Short description, usually 1-2 sentences. */
    Description: string;
    /**Unique ID for this mod, important for dependencies */
    UniqueID: string;
    /**The DLL used to load SMAPI mods. This property is a required field for SMAPI mods. */
    EntryDll?: string;
    /**The MinimumApiVersion fields sets the minimum SMAPI version needed to use this mod. */
    MinimumApiVersion?: string;
    UpdateKeys?: string[];
    /**The Content Pack this mods is for. This property is a required field for Content Packs. */
    ContentPackFor?: {
        UniqueID?: string;
    }
    /** The Dependencies field specifies other mods required to use this mod. */
    Dependencies?: {
        /**Identifier for the required mod. */
        UniqueID: string;
        /**If specified, older versions won't meet the requirement. */
        MinimumVersion?: string;
        /**You can mark a dependency as optional. It will be loaded first if it's installed, otherwise it'll be ignored. */
        isRequired?: boolean;
    }[];
    /**Additional data used by SMAPI when checking for updates. */
    ModUpdater?: {
        Repository?: string;
        User?: string;
        Directory?: string;
        ModFolder?: string;
    }
}

/**
 * This is a manfiest provided with a SMAPI mod. Due to inconsistent casing and potential undocumented additions to the manifest, this is a partial type. When checking keys it is recommended to lowercase everything to be safe.
 *
 * @interface ISMAPIManifest
 */
type ISMAPIManifest = Partial<ISMAPIManifestBase>;

interface SMAPIDLLModManfiest extends SMAPIManifestClass {
    EntryDll: string;
}

interface SMAPIContentPackManifest extends SMAPIManifestClass {
    ContentPackFor: {
        UniqueID: string;
    }
}

/**
 * A custom class that will normalise manifest data for easy manipulation. 
 *
 * @class SMAPIManifestClass
 * @param raw - An object that may be a SMAPI manfiest but hasn't been normalised.
 * @returns A SMAPI manifest class with addition functions.
 * 
 */
class SMAPIManifestClass implements ISMAPIManifestBase {
    public Name: string;
    public Author: string;
    public Version: string;
    public Description: string | undefined;
    public UniqueID: string;
    public EntryDll?: string;
    public MinimumApiVersion?: string;
    public UpdateKeys?: string[];
    public ContentPackFor?: { UniqueID: string };
    public Dependencies: { UniqueID: string; MinimumVersion?: string; isRequired?: boolean; }[];
    public ModUpdater?: { Repository?: string; User?: string; Directory?: string; ModFolder?: string; };

    constructor(raw: Partial<ISMAPIManifestBase>) {
        this.Name = getManifestValue(raw, 'Name');
        this.Author = getManifestValue(raw, 'Author');
        this.Version = getManifestValue(raw, 'Version');
        this.Description = getManifestValue(raw, "Description");
        this.UniqueID = getManifestValue(raw, 'UniqueID');
        this.EntryDll = getManifestValue(raw, 'EntryDll');
        this.MinimumApiVersion = getManifestValue(raw, 'MinimumApiVersion');
        this.UpdateKeys = getManifestValue(raw, 'UpdateKeys');
        this.ContentPackFor = getManifestValue(raw, 'ContentPackFor');
        this.Dependencies = getManifestValue(raw, 'Dependencies') || [];
        this.ModUpdater = getManifestValue(raw, 'ModUpdater');
    }

    /**
     * If the manifest is for a DLL mod, return it as the compatible type. 
     *
     * @returns {SMAPIDLLModManfiest | undefined} A DLL mod manfiest or undefined.
     * 
     */
    public asDLLMod(): SMAPIDLLModManfiest | undefined {
        return this.EntryDll !== undefined 
            ? (this as SMAPIDLLModManfiest)
            : undefined;
    }

    /**
     * If the manifest is for a content pack, return it as the compatible type. 
     *
     * @returns {SMAPIContentPackManifest | undefined} A content pack manfiest or undefined.
     * 
     */
    public asContentPack(): SMAPIContentPackManifest | undefined {
        return this.ContentPackFor?.UniqueID 
            ? (this as SMAPIContentPackManifest)
            : undefined;
    }

    /**
     * Return the manifest as a JSON object. 
     *
     * @returns {ISMAPIManifest} Manifest data without class functions
     * 
     */
    public toJSON(): ISMAPIManifest {
        return {
            Name: this.Name,
            Author: this.Author,
            Version: this.Version,
            Description: this.Description,
            UniqueID: this.UniqueID,
            EntryDll: this.EntryDll,
            MinimumApiVersion: this.MinimumApiVersion,
            UpdateKeys: this.UpdateKeys,
            ContentPackFor: this.ContentPackFor,
            Dependencies: this.Dependencies,
            ModUpdater: this.ModUpdater
        }
    }
}

/**
 * This is the data format used to send a request to the SMAPI API. 
 *
 * @interface IAPIPostRequest
 */
interface IAPIPostRequest {
    mods: IAPIModIdentity[];
    apiVersion?: string;
    gameVersion?: string;
    platform?: 'Android' | 'Linux' | 'Mac' | 'Windows';
    includeExtendedMetadata?: boolean;
}

/**
 * This is the data format used to define mods when sending a request to the SMAPI API. 
 *
 * @interface IAPIModIdentity
 */
interface IAPIModIdentity {
    id: string;
    updateKeys?: string[];
    installedVersion?: string;
    isBroken?: boolean;
}

/**
 * This is the data format expected as a response from the SMAPI API. 
 *
 * @interface IAPIPostResponse
 */
type IAPIPostResponse = IAPIMod[];

interface IAPIMod {
    id: string;
    suggestedUpdate?: {
        version: string;
        url: string;
    };
    errors: string[];
    metadata?: {
        id: string[];
        name: string;
        nexusID?: number;
        curseForgeID?: number;
        curseForgeKey?: string;
        modDropID?: number;
        gitHubRepo?: string;
        main?: {
            version: string;
            url: string;
        }
        hasBetaInfo?: boolean;
        compatibilityStatus?: string;
        compatibilitySummary?: string;
    }
}

type IModRulePlusType = types.IModRule & { type?: 'requires' | 'recommends' } & { reference: IModReferencePlus };

interface IModReferencePlus extends types.IModReference {
    versionMatch?: string;
    gameId?: string;
}

export { SMAPIManifestClass, ISMAPIManifest, IAPIPostRequest, IAPIPostResponse, IAPIMod, IAPIModIdentity, IModRulePlusType };