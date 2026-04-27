//@ts-ignore
import { API_Character, AssetGet } from "bc-bot";
import { CommandContext, WithCommands } from "../mixins";
import { DeepPartial, ObjStore, isValidNumber, map, parseApiCharObj, pickRandom, withReason } from "../utils";
import { GenericMapRoomOptions, MapRoom, MapRoomArguments } from "./map-room";
import { deepMerge } from "../utils/obj-store";

//#region "Vendored" Variables
/*/#region Script to "Vendor" (BC Game Client)
(() => {
    const StrippedGroups = AssetGroup.filter(a => (a.Clothing) && !a.BodyCosplay && !a.Name.includes("Luzi")).map(a => a.Name);
    const CosplayAssets = Asset.filter(a => a.BodyCosplay);
    const GroupsWithCosplayAssets = new Set(CosplayAssets.map(a => a.Group.Name));
    const StrippedGroupsWithCosplay = [...GroupsWithCosplayAssets].filter(i => StrippedGroups.includes(i))
    const StrippedCosplayAssets = CosplayAssets.filter(a => StrippedGroupsWithCosplay.includes(a.Group.Name)).map(a => a.Name);

    const vendored = {
        StrippedGroups,
        StrippedGroupsWithCosplay,
        StrippedCosplayAssets,
    };

    return {
        ...vendored,
        vendor() {
            copy(
                JSON.stringify(vendored, null, 4)
                    .replace(/\[\s+([\s\S]+?)\s+\]/g, (match, content) => `[ ${content.replace(/\s+/g, ' ')} ]`)
            )
        },
    }
})();
//#endregion */

const BC = Object.freeze((() => {
    // paste vendored object here
    const src = Object.freeze({
        "StrippedGroups": [ "ClothOuter", "Cloth", "Decals", "ClothAccessory", "Necklace", "Suit", "SuitLower", "ClothLower", "Bra", "Corset", "Panties", "Socks", "SocksRight", "SocksLeft", "AnkletRight", "AnkletLeft", "Garters", "Shoes", "Hat", "HairAccessory3", "HairAccessory1", "Gloves", "HandAccessoryLeft", "HandAccessoryRight", "Bracelet", "Glasses", "Jewelry", "Mask" ],
        "StrippedGroupsWithCosplay": [ "ClothAccessory", "HairAccessory3", "HairAccessory1", "Mask" ],
        "StrippedCosplayAssets": [ "Glitter", "Kissmark", "WombTattoos", "BodyWritings", "FaceWritings", "Halo", "Ears1", "Ears2", "PonyEars1", "BunnyEars1", "BunnyEars2", "PuppyEars1", "SuccubusHorns", "Horns", "Horns2", "Horns3", "FoxEars1", "BatWings", "KittenEars1", "KittenEars2", "WolfEars1", "WolfEars2", "FoxEars2", "FoxEars3", "PuppyEars2", "RaccoonEars1", "MouseEars1", "MouseEars2", "ElfEars", "CowHorns", "Halo", "Antennae", "UnicornHorn", "DildocornHorn", "BigLynxEars", "CyberneticEars1", "CyberEars", "FloppyBunnyEars", "Onihorns", "SkunkEars", "AquaticEars", "CustomizableFluffyEars1", "CustomizableFluffyEars2", "CustomizableFluffyEars3", "CustomizableCatEars", "CustomizableElfEars", "CustomizableCowEars", "PetNose", "Glitter", "Kissmark", "FaceScars" ]
    });

    return {
        Strip: {
            Groups: Object.assign(new Set(src.StrippedGroups), {
                WithCosplay: Object.assign(new Set(src.StrippedGroupsWithCosplay), {
                    Assets: new Set(src.StrippedCosplayAssets)
                }),
            }),
        },
    };
})());
//#endregion

//#region modules
namespace BCB {

    //#region config
    export type Config = {
        namespace: string,
    };
    //#endregion

    //#region util
    type Util = ReturnType<typeof createUtil>;
    const createUtil = () => {

        const time = {
            getUnix: () => Math.floor(Date.now() / 1000),
            formatSecs: (seconds: number) => {
                const d = Math.floor(seconds / 86400);
                const h = Math.floor((seconds % 86400) / 3600);
                const m = Math.floor((seconds % 3600) / 60);
                const s = Math.floor(seconds % 60);
    
                const parts = [d, h, m, s] as const;
                const partUnits = ["d", "h", "m", "s"] as const;
                const strParts = parts.map(part => String(part).padStart(2, "0"));

                let str = "";
                let include = false;
                parts.forEach((part, idx) => {
                    if (!part && !include) return;
                    if (part && !include) include = true;
                    str += `${strParts[idx]}${partUnits[idx]}`;
                });
                return str;
            },
        };

        const db = (() => {
            const stores = new Set<ObjStore<any>>();

            const createStore = <T extends object>(...params: Parameters<typeof ObjStore.create<T>>) => {
                const store = ObjStore.create(...params);
                stores.add(store);
                return store;
            };

            const getStoreIdentifiers = (namespace: string, name: string): Pick<Parameters<typeof createStore>["0"], "name" | "file"> => ({
                name: `${namespace}/bcb<${name}>`,
                file: { path: `${namespace}/bcb/${name}.json` },
            });

            return {
                flush: () => {
                    for (const store of stores) {
                        store.flush();
                    }
                },
                getStoreIdentifiers,
                createStore,
                createKeyedCollection: <T extends object>(namespace: string, name: string) => {
                    const store = createStore<Record<string, T>>({
                        ...getStoreIdentifiers(namespace, name),
                        data: { default: {} },
                        options: {
                            queueUpdateMs: 500,
                        },
                    });
                    const data = store.load();
                    const queueUpdate = () => store.update(data);
        
                    return {
                        get store() { return store; },
                        get keys() { return Object.keys(data); },
                        get values() { return Object.values(data); },
                        has(key: string) { return key in data; },
                        get(key: string): T | null {
                            if (key in data) return data[key];
                            return null;
                        },
                        set(key: string, value: T) {
                            data[key] = value;
                            return data[key];
                        },
                        update(key: string, dispatcher: (prev: T) => DeepPartial<T>) {
                            const diff = dispatcher(data[key]);
                            if (key in data) deepMerge(diff, data[key] as DeepPartial<T>);
                            else data[key] = diff as T;
                            queueUpdate();
                            return data[key];
                        },
                        delete(key: string, shouldQueue = true) {
                            delete data[key];
                            if (shouldQueue) queueUpdate();
                        },
                        queueUpdate,
                    };
                },
            };
        })();

        return {
            time,
            db,
        };
    };
    export let util: Util = createUtil();
    //#endregion

    //#region common
    type CommonAreas = {
        Shop: ReturnType<typeof map.createArea>,
        Claim: ReturnType<typeof map.createArea>,
        BountyTarget: ReturnType<typeof map.createArea>,
        Prison: ReturnType<typeof map.createTileList>,
        Lobby: ReturnType<typeof map.createTileList>,
    };
    export type CommonConfig = {
        defAreas: (helpers: {
            defArea: typeof map.createArea,
            defTileList: typeof map.createTileList
        }) => CommonAreas,
    };

    export type Common = ReturnType<typeof createCommon>;
    export const createCommon = ({ defAreas }: CommonConfig) => {
        const areas = Object.freeze(
            defAreas({
                defArea: map.createArea,
                defTileList: map.createTileList
            })
        );

        return {
            areas,
        };
    };
    //#endregion

    //#region pending
    export type Pending = ReturnType<typeof createPending>;
    export const createPending = () => {
        const purgeFuncs: (() => void)[] = [];

        const createRegistry = () => {
            type RegistryAction = {
                caller: number,
                run: (ctx: CommandContext, ...params: any[]) => void,
                cancel: () => void,
                expiry: NodeJS.Timeout,
            };
            const actions = new Map<number, RegistryAction>();

            const cancelAction = (caller: number) => {
                clearTimeout(actions.get(caller)?.expiry);
                actions.delete(caller);
            };

            const createAction = <TActionArgs extends any[]>(
                caller: number,
                callback: (ctx: CommandContext, ...args: TActionArgs) => void,
                onTimeout: (run: typeof callback) => void = () => {},
            ): RegistryAction => {
                const cancel = () => cancelAction(caller);
                const expiry: NodeJS.Timeout = setTimeout(() => {
                    onTimeout(callback);
                    cancel();
                }, 10 * 1000);

                return {
                    caller,
                    run: (...params: Parameters<typeof callback>) => {
                        callback(...params);
                        cancel();
                    },
                    cancel,
                    expiry,
                };
            };

            purgeFuncs.push(() => {
                actions.forEach((action) => {
                    action.cancel();
                });
            });

            return {
                get(caller: number) { return actions.get(caller) ?? null; },
                queue<TActionArgs extends any[]>(...params: Parameters<typeof createAction<TActionArgs>>) {
                    actions.set(params[0], createAction<TActionArgs>(...params));
                },
            };
        };

        return {
            confirm: createRegistry(),
            response: createRegistry(),
            purge: () => purgeFuncs.forEach(purge => purge()),
        };
    };
    //#endregion

    //#region roles
    export type RolesConfigAdditions = {
        membersOf: {
            SuperAdmin: number[],
            GoldManager: number[],
            BountyManager: number[],
        },
    };

    const withNumArrValues = <K extends string>(obj: Record<K, number[]>) => obj;
    export type Roles = ReturnType<typeof createRoles>;
    export const createRoles = ({ namespace, membersOf }: Config & RolesConfigAdditions) => {

        const fixedRoles = Object.freeze(() => {
            const createIds = (name: string, ids: number[]) => Object.assign(ids, {
                name,
            });
        
            return Object.freeze({
                SuperAdmin: createIds("Super Admin", membersOf.SuperAdmin),
                GoldManager: createIds("Gold Manager", membersOf.GoldManager),
                BountyManager: createIds("Bounty Manager", membersOf.BountyManager),
            });
        })();

        type RoleLists = typeof initialRoles;
        const initialRoles = withNumArrValues({
            immunity: [],
            admin: [...fixedRoles.SuperAdmin],
            dom: [],
        });

        const store = util.db.createStore({
            ...util.db.getStoreIdentifiers(namespace, "roles"),
            data: { default: initialRoles },
            options: {
                queueUpdateMs: 500,
            },
        });
        const internalLists = store.load();
        
        type RoleKey = keyof RoleLists;
        const createRoleList = (name: string, key: RoleKey) =>
            Object.assign(() => internalLists[key], { name });
        type RoleMapping = typeof mapping;
        const mapping = {
            ...fixedRoles,
            Admin: createRoleList("Admin", "admin"),
            Dom: createRoleList("Dom", "dom"),
            Immune: createRoleList("Immune", "immunity"),
        };
        const roles: Record<keyof RoleMapping, string> = Object.fromEntries(
            Object.entries(mapping).map(([key, list]) => [key, list.name])
        ) as never;

        const lists = (Object.keys(internalLists) as RoleKey[])
            .reduce<Record<RoleKey, RoleList>>((acc, key) => {
                acc[key] = createList(key);
                return acc;
            }, {} as Record<RoleKey, RoleList>);
        type RoleList = ReturnType<typeof createList>;
        const createList = (key: keyof RoleLists) => {
            const queueUpdate = () => store.update(internalLists);
            return {
                get() { return internalLists[key]; },
                add(id: number): readonly number[] {
                    if (internalLists[key].includes(id)) return [];
                    internalLists[key].push(id);
                    internalLists[key].sort();
                    queueUpdate();
                    return internalLists[key];
                },
                has(id: number) { return internalLists[key].includes(id )},
                remove(id: number): readonly number[] {
                    internalLists[key] = internalLists[key].filter(i => i !== id);
                    queueUpdate();
                    return internalLists[key];
                },
            };
        };

        return {
            ...roles,
            mapping: Object.fromEntries(
                Object.entries(mapping).map(([, list]) => [list.name, list])
            ),
            lists,
        };
    };
    //#endregion

    //#region prison
    //#region capture types
    type CaptureRestraintItem = {
        Group: AssetGroupName, Name: string, Color: ItemColor,
        TypeRecord: ItemProperties["TypeRecord"] | null,
        ExtraProp: Partial<ItemProperties> | null,
        Lock: AssetLockType | null,
    };
    type CaptureRestraints = {
        name: string,
        createDesc: (vars: { name: string }) => string,
        items: CaptureRestraintItem[],
    };
    const CAPTURE_RESTRINTS = Object.freeze<CaptureRestraintItem[]>([
        // { Group: "ItemHands",            Name: "LatexBondageMitts",   Color: ["#222222","#CCCCCC","#222222","#CCCCCC","#CCCCCC","#FFFF66","#CCCC33","#222222","#CCCCCC","#222222","#CCCCCC","#CCCCCC","#FFFF66","#CCCC33"], TypeRecord: {t:0,w:0,r:0,l:0},             ExtraProp: {Effect:["Block","MergedFingers","Lock"]},                                                                                                 Lock: "ExclusivePadlock"    },
        // { Group: "ItemMouth",            Name: "LargeDildo",          Color: ["#333333"],                                                                                                                                   TypeRecord: null,                          ExtraProp: null,                                                                                                                                      Lock: null                  },
        // { Group: "ItemFeet",             Name: "BallChain",           Color: ["Default"],                                                                                                                                   TypeRecord: null,                          ExtraProp: {Effect:["Lock"]},                                                                                                                         Lock: "ExclusivePadlock"    },
        // { Group: "ItemLegs",             Name: "ShinyLegBinder",      Color: ["#FFFFFF","#FF0000","#FFFFFF","#000000","#FFFFFF","#000000"],                                                                                 TypeRecord: {typed:3},                     ExtraProp: {Effect:["Lock"]},                                                                                                                         Lock: "ExclusivePadlock"    },
        // { Group: "ItemArms",             Name: "ShinyStraitjacket",   Color: ["#FFFFFF","#FF0000","#FFFFFF","#FF0000","#EEEEEE","#000000"],                                                                                 TypeRecord: {typed:0},                     ExtraProp: {Effect:["Lock"]},                                                                                                                         Lock: "ExclusivePadlock"    },
        // { Group: "ItemTorso2",           Name: "HeavyLatexCorset",    Color: ["#797979"],                                                                                                                                   TypeRecord: {typed:0},                     ExtraProp: {Effect:["Lock"]},                                                                                                                         Lock: "ExclusivePadlock"    },
        // { Group: "ItemNipplesPiercings", Name: "RoundPiercing",       Color: ["#252525","#252525","#252525"],                                                                                                               TypeRecord: {typed:3},                     ExtraProp: {Effect:["Wiggling","Lock"]},                                                                                                              Lock: "ExclusivePadlock"    },
        // { Group: "ItemNeck",             Name: "SteelPostureCollar",  Color: ["#353535"],                                                                                                                                   TypeRecord: null,                          ExtraProp: {Effect:["Lock"]},                                                                                                                         Lock: "ExclusivePadlock"    },
        // { Group: "ItemNeckRestraints",   Name: "CollarLeash",         Color: ["#000000","#FF0000","#D0D0D0"],                                                                                                               TypeRecord: null,                          ExtraProp: {Effect:["Lock"]},                                                                                                                         Lock: "ExclusivePadlock"    },
        // { Group: "ItemMouth2",           Name: "HarnessBallGag1",     Color: ["#7B0000","Default","#000000"],                                                                                                               TypeRecord: {typed:1},                     ExtraProp: {Effect:["Lock"]},                                                                                                                         Lock: "ExclusivePadlock"    },
        // { Group: "ItemVulva",            Name: "VibratingDildo",      Color: ["#ED4BEE","#ED4BEE"],                                                                                                                         TypeRecord: {vibrating:4},                 ExtraProp: {Mode:"Maximum",Intensity:3,Effect:["Egged","Vibrating"]},                                                                                 Lock: null                  },
        // { Group: "ItemVulvaPiercings",   Name: "TapedClitEgg",        Color: ["Default","Default"],                                                                                                                         TypeRecord: {vibrating:4},                 ExtraProp: {Mode:"Maximum",Intensity:3,Effect:["Egged","Vibrating"]},                                                                                 Lock: null                  },
        // { Group: "ItemButt",             Name: "LockingVibePlug",     Color: ["Default"],                                                                                                                                   TypeRecord: {vibrating:4},                 ExtraProp: {Mode:"Maximum",Intensity:3,Effect:["Egged","Vibrating","Lock"]},                                                                          Lock: "HighSecurityPadlock" },
        // { Group: "ItemPelvis",           Name: "ModularChastityBelt", Color: ["#CC43C8","#818181","#818181","#818181","#9A862D","#BABABA"],                                                                                 TypeRecord: {a:0,c:3,i:4,p:4,s:3,v:0,o:1}, ExtraProp: {Intensity:3,Effect:["UseRemote","CanEdge","Chaste","ButtChaste","Egged","Vibrating","FillVulva","IsPlugged","Slow","DenialMode","Lock"]}, Lock: "HighSecurityPadlock" },
        // { Group: "ItemBoots",            Name: "MonoHeel",            Color: ["#FF0000","#918E8E","#000000"],                                                                                                               TypeRecord: {typed:0},                     ExtraProp: {Effect:["Lock"]},                                                                                                                         Lock: "ExclusivePadlock"    },
    ]);
    //#endregion

    //#region prisoner types
    type PrisonCell = ChatRoomMapPos;
    export type PrisonerStub = {
        id: number,
        cell: PrisonCell,
        end: {
            duration: number,
            at: number,
        },
        /** @desc ~ flags to keep track of prisoner state */
        flags: { 
            /** @desc ~ whether extend/release is prompted; prompt when next seen */
            prompted: boolean,
            /** @desc ~ whether or not is confirmed releasing; release when next seen */
            releasing: boolean,
        },
    };
    export type Prisoner = PrisonerStub;
    //#endregion
    
    export type PrisonConfigAdditions = {
        restraints: CaptureRestraints,
    };
    type PrisonConfig = Config & PrisonConfigAdditions & { common: Common };
    export type Prison = ReturnType<typeof createPrison>;
    export const createPrison = ({ namespace, common, ...conf }: PrisonConfig) => {
        const restraints = Object.freeze(conf.restraints);
        let store = util.db.createKeyedCollection<PrisonerStub>(namespace, "prisoners");

        //#region appearance
        const strip = (target: API_Character) => {
            target.Appearance.getAppearanceData().forEach(a => {
                if (!BC.Strip.Groups.has(a.Group)) return;
                if (BC.Strip.Groups.WithCosplay.has(a.Group) && BC.Strip.Groups.WithCosplay.Assets.has(a.Name)) return;
                target.Appearance.RemoveItem(a.Group);
            });
        };

        const restrain = ({ botName, targetName, target }: { botName: string, targetName: string, target: API_Character }) => {
            restraints.items.forEach(r => {
                const asset = AssetGet(r.Group, r.Name);
                asset.Color = r.Color;
                asset.Property = {};
                if (r.TypeRecord || r.ExtraProp || r.Lock) {
                    asset.Property = r.ExtraProp ?? {};
                    if (r.TypeRecord) asset.Property.TypeRecord = r.TypeRecord;
                    if (r.Lock) {
                        asset.Property.LockedBy = r.Lock;
                        asset.Property.LockMemberNumber = -1;
                        //@ts-ignore
                        asset.Property.LockMemberName = botName;
                    }
                }
                asset.Craft = {
                    Name: restraints.name,
                    Description: restraints.createDesc({ name: targetName }),
                    Color: Array.isArray(r.Color) ? r.Color.join(",") : r.Color,
                    Private: false,
                    Effects: {},
                    Item: r.Name,
                    ItemProperty: asset.Property,
                    TypeRecord: r.TypeRecord ?? {},
                    Lock: r.Lock ?? "",
                    MemberNumber: -1,
                    MemberName: botName,
                };
                target.Appearance.AddItem(asset);
            });
        };

        const unrestrain = (target: API_Character) => {
            target.Appearance.getAppearanceData().forEach(a => {
                if (!a.Craft) return;
                if (a.Craft.Name !== restraints.name) return;
                target.Appearance.RemoveItem(a.Group);
            });
        };
        //#endregion

        //#region getters
        const hydratePrisonerStub = (stub: PrisonerStub) => {
            const { id, cell, end, flags } = stub;
            return Object.freeze<Prisoner>({
                id,
                cell: { ...cell },
                end: { ...end },
                flags: { ...flags },
            });
        };

        const getPrisoner = (id: number) => {
            let stub = store.get(id.toString());
            if (!stub) return null;
            return hydratePrisonerStub(stub);
        };
        //#endregion

        //#region timers
        const timers: Record<number, PrisonTimer> = {};

        type PrisonTimer = ReturnType<typeof createTimer>;
        const createTimer = (prisoner: PrisonerStub, fn: () => void) => {
            let endAt = prisoner.end.at;
            const getEndAt = () => endAt;
            const getTimeLeft = () => (getEndAt() - util.time.getUnix()); 
            const run = () => {
                console.info("BCB.Prison(timers/run):", "[OnPrisonerTimerEnd]", `trigger(CheckPrisonTerm<${prisoner.id}>)`);
                fn();
                cancel();
            };

            let timeout = setTimeout(run, getTimeLeft() * 1000);
            const cancel = () => {
                clearTimeout(timeout);
                delete timers[prisoner.id];
            };

            return {
                id: prisoner.id,
                get timeLeft() { return getTimeLeft(); },
                run, cancel,
                extend(duration: number) {
                    if (timers[prisoner.id] !== this) return false;
                    clearTimeout(timeout);
                    endAt += duration;
                    timeout = setTimeout(run, getTimeLeft() * 1000);
                    return true;
                }
            }
        };

        const requestTimer = (prisonerId: number, fn: () => void) => {
            const prisoner = store.get(prisonerId.toString());
            if (!prisoner || prisoner.id in timers || util.time.getUnix() > prisoner.end.at) return;
            const timer = createTimer(prisoner, fn);
            timers[prisoner.id] = timer;
        };

        const initTimers = (termCheckFuncMaker: (id: number) => () => void) => {
            store.values.forEach(p => {
                requestTimer(p.id, termCheckFuncMaker(p.id));
            });
        };

        const removeTimer = (prisonerId: number) => {
            if (!(prisonerId in timers)) return;
            timers[prisonerId].cancel();
        };

        const cancelTimers = () => Object.values(timers).forEach(t => t.cancel());
        //#endregion

        //#region sentence ops
        const sentencedTimeMapper: Record<BountyDesc["desc"], (reason: Bounty["reasons"][number]) => number> = {
            "Room Hop": () => 10 * 60, // 10m
            "Wall Walk": () => 0, // unused
            "Placed": ({ gold }) => {
                let calculatedTime = 10 * 60; // baseline 10min
                calculatedTime += (Math.max(20, gold) - 20) * 30; // 30s for each subsequent gold
                return Math.min(60 * 60, calculatedTime) // max 1h
            },
        };

        const registerPrisoner = (cell: PrisonCell, bounty: Readonly<Bounty>) => {
            let sentenceTime = 0; // in seconds
            bounty.reasons.forEach(r => {
                sentenceTime += sentencedTimeMapper[r.desc](r);
            });
            return store.set(bounty.id.toString(), {
                id: bounty.id,
                cell,
                end: {
                    duration: sentenceTime,
                    at: util.time.getUnix() + sentenceTime,
                },
                flags: {
                    prompted: false,
                    releasing: false,
                },
            });
        };

        const extendPrisonerTerm = (id: number, duration: number) => {
            store.update(id.toString(), (prev) => ({
                flags: { ...defaultFlags },
                end: {
                    duration: prev.end.duration + duration,
                    at: prev.end.at + duration,
                },
            }))
            if (id in timers) timers[id].extend(duration);
        };

        const releasePrisoner = (id: number) => {
            const prisoner = getPrisoner(id);
            if (!prisoner) return false;
            store.delete(prisoner.id.toString());
            removeTimer(prisoner.id);
            return true;
        };
        //#endregion

        //#region flags
        const defaultFlags: Prisoner["flags"] = {
            prompted: false,
            releasing: false,
        } as const;

        const updateFlag = (id: number, flag: keyof Prisoner["flags"], value: boolean) => {
            store.update(id.toString(), () => ({
                flags: {
                    [flag]: value,
                },
            }));
        };

        const flag = (id: number, flag: keyof Prisoner["flags"]) => updateFlag(id, flag, true);
        const unflag = (id: number, flag: keyof Prisoner["flags"]) => updateFlag(id, flag, false);
        //#endregion

        const strCell = (cell: PrisonCell) => `X${cell.X}Y${cell.Y}`;
        return {
            init: (conf: {
                timers: Parameters<typeof initTimers>,
            }) => initTimers(...conf.timers),
            stop: () => cancelTimers(),
            cells: {
                get free() {
                    const occupied = new Set(store.values.map(p => strCell(p.cell)));
                    return common.areas.Prison.filter(c => !occupied.has(strCell(c)));
                },
            },
            has(id: number) { return store.has(id.toString()); },
            getPrisoner, flag, unflag, requestTimer,
            hasTimerFor(id: number) { return id in timers; },
            //#region control
            extend: extendPrisonerTerm,
            admit(
                { bounty, botName, targetName, target, cell }: {
                    bounty: Readonly<Bounty>,
                    botName: string,
                    targetName: string,
                    target: API_Character,
                    cell: ChatRoomMapPos
                }
            ) {
                if (!target.AllowItem)
                    return "insufficient permissions to imprison target";
                if (store.get(bounty.id.toString()))
                    return "target is already a prisoner";
                target.mapTeleport(cell);
                strip(target);
                restrain({ botName, targetName, target });
                return registerPrisoner(cell, bounty);
            },
            release(target: API_Character) {
                if (!releasePrisoner(target.MemberNumber)) return false;
                target.mapTeleport(pickRandom(common.areas.Lobby));
                if (!target.AllowItem)
                    target.connection.SendMessage(
                        "Whisper",
                        `(⚠️ The bot does not have permissions to remove the restraints. You will have to do it yourself.)`,
                        target.MemberNumber,
                    );
                else
                    unrestrain(target);
                return true;
            },
            //#endregion
        };
    };
    //#endregion

    //#region shop
    type Favor = { name: string, cost: number };
    export type Shop = ReturnType<typeof createShop>;
    export const createShop = ({ namespace }: Config) => {
        let catalogue = {
            favors: [] as Favor[],
        };

        const store = util.db.createStore({
            ...util.db.getStoreIdentifiers(namespace, "shop"),
            data: { default: catalogue },
            options: {
                queueUpdateMs: 500,
            },
        });
        catalogue = store.load();

        const updateFavors = (updateFunc: (favors: Favor[]) => void) => {
            updateFunc(catalogue.favors);
            catalogue.favors.sort((f1, f2) => f1.cost - f2.cost);
            store.update(catalogue);
        };

        return {
            favors: {
                add: (favor: Favor) => {
                    if (catalogue.favors.find(f => f.name === favor.name)) return withReason("already exists in store");
                    updateFavors((favors) => favors.push(favor));
                    return true;
                },
                remove: (index: number) => {
                    if (!catalogue.favors[index]) return withReason("non-existent index");
                    updateFavors((favors) => favors.splice(index, 1));
                    return true;
                },
                get list() { return catalogue.favors; }
            },
        };
    };
    //#endregion

    //#region core
    //#region player types
    type Rank = { level: number, name: string, cost: number };
    type PlayerStub = {
        id: number, gold: number, rank: number,
        inventory: {
            favors: string[],
        },
    };
    type Player = { id: number, gold: number, rank: Omit<Rank, "cost"> };
    //#endregion

    //#region bounty types
    type PlacedBountyDesc = { desc: "Placed", srcId: number };
    type RoomHopBountyDesc = { desc: "Room Hop" };
    type WallWalkBountyDesc = { desc: "Wall Walk" };
    type BountyDesc = PlacedBountyDesc | RoomHopBountyDesc | WallWalkBountyDesc;
    type BountyMeta = {
        gold: number,
        expiration: {
            at: number,
            duration: number,
        },
    };

    type BountyStub = {
        id: number,
        reasons: (BountyDesc & BountyMeta)[],
    };
    type Bounty = {
        id: number,
        gold: number,
        clearCost: number,
        reasons: (Pick<BountyMeta, "gold"> & BountyDesc)[],
    };
    type PunishmentBountyRecords = Record<
        Exclude<BountyDesc["desc"], "Placed">,
        { gold: number, expiration: { duration: number } }
    >;
    //#endregion

    export type CoreConfigAdditions = {
        ranks: Rank[],
        punishments: PunishmentBountyRecords,
    };
    type CoreConfig = Config & CoreConfigAdditions & { roles: Roles, prison: Prison };
    export type Core = ReturnType<typeof createCore>;
    export const createCore = ({ namespace, roles, prison, ...conf }: CoreConfig) => {
        const ranks = Object.freeze(conf.ranks);
        const punishments = Object.freeze(conf.punishments);

        let stores = {
            players: util.db.createKeyedCollection<PlayerStub>(namespace, "players"),
            bounties: util.db.createKeyedCollection<BountyStub>(namespace, "bounties"),
        };

        //#region getters
        let lastRefreshed: number = 0;
        const refreshBountyExpiration = () => {
            const currTime = util.time.getUnix();
            if (currTime <= lastRefreshed) return;
            let updated = 0;
            lastRefreshed = currTime;
            stores.bounties.keys.forEach(id => {
                const b = stores.bounties.get(id);
                if (!b) return;
                const prevLength = b.reasons.length;
                b.reasons = b.reasons.filter(r => r.expiration.at > currTime);
                if (prevLength !== b.reasons.length) updated++;
                if (!b.reasons.length) stores.bounties.delete(id, false);
            });
            if (updated) {
                console.info("BCB.Core(refreshBountyExpiration):", `${updated} bounty entries updated`);
                stores.bounties.queueUpdate();
            }
        };

        const hydrateBountyStub = (stub: BountyStub) => {
            let { id, reasons } = stub;
            const gold = reasons.reduce((acc, r) => acc + r.gold, 0);
            return Object.freeze<Bounty>({
                id,
                gold,
                clearCost: Math.ceil(gold * 1.5),
                reasons: reasons.map(({ expiration: _x, ...rest }) => rest),
            });
        };

        const requireBounty = (id: number) => {
            refreshBountyExpiration();
            let stub = stores.bounties.get(id.toString());
            if (!stub) {
                stub = stores.bounties.set(id.toString(), {
                    id, reasons: [],
                });
            }
            return hydrateBountyStub(stub);
        };

        const getBounty = (id: number) => {
            refreshBountyExpiration();
            let stub = stores.bounties.get(id.toString());
            if (!stub) return null;
            return hydrateBountyStub(stub);
        }

        const hydratePlayerStub = (stub: PlayerStub) => {
            const { id, gold, rank: rankId } = stub;
            const rank = ranks[rankId];
            return Object.freeze<Player>({
                id, gold,
                rank: {
                    level: rank.level,
                    name: rank.name,
                },
            });
        };

        const requirePlayer = (id: number) => {
            let stub = stores.players.get(id.toString());
            if (!stub) {
                stub = stores.players.set(id.toString(), {
                    id, gold: 0, rank: 0,
                    inventory: { favors: [] },
                });
            }
            return hydratePlayerStub(stub);
        };
        //#endregion

        return {
            requirePlayer, getBounty, requireBounty,
            //#region bounty ops
            canHaveBounty: (id: number) => {
                if (prison.has(id)) return withReason("is imprisoned");
                if (roles.lists.immunity.has(id)) return withReason("is immune" );
                return true;
            },
            claimBounty: (claimer: number | Player, bounty: number | Bounty | null) => {
                if (typeof claimer === "number") claimer = requirePlayer(claimer);
                if (typeof bounty === "number") bounty = getBounty(bounty);
                if (!bounty) return null;

                const player = stores.players.update(claimer.id.toString(), (prev) => ({
                    gold: prev.gold + bounty.gold
                }));
                stores.bounties.delete(bounty.id.toString());
                return player;
            },
            clearBounty: (clearer: number | Player, bounty: number | Bounty | null) => {
                if (typeof clearer === "number") clearer = requirePlayer(clearer);
                if (typeof bounty === "number") bounty = getBounty(bounty);
                if (!bounty) return "no bounty found";
                if (clearer.gold < bounty.clearCost) return "not enough gold";

                const player = stores.players.update(clearer.id.toString(), (prev) => ({
                    gold: prev.gold - bounty.clearCost
                }));
                stores.bounties.delete(bounty.id.toString());
                return player;
            },
            placeBounty: (placer: number | Player, targetId: number, gold: number = 0) => {
                if (typeof placer === "number") placer = requirePlayer(placer);
                const bounty = requireBounty(targetId);

                if (placer.gold < gold) return "not enough gold";
                const player = stores.players.update(placer.id.toString(), (prev) => ({
                    gold: prev.gold - gold,
                }));
                stores.bounties.update(bounty.id.toString(), (prev) => ({
                    reasons: [
                        ...prev.reasons,
                        {
                            gold,
                            expiration: {
                                duration: 60 * 60 * 24 * 7,
                                at: util.time.getUnix() + (60 * 60 * 24 * 7),
                            },
                            desc: "Placed",
                            srcId: placer.id,
                        }
                    ]
                }));
                return player;
            },
            punishments,
            punishmentBounty: (targetId: number, type: Exclude<BountyDesc["desc"], "Placed">) => {
                const bounty = requireBounty(targetId);
                if (type === "Room Hop" && bounty.reasons.find(r => r.desc === type))
                    return null;
                const { gold, expiration } = punishments[type];
                return hydrateBountyStub(
                    stores.bounties.update(targetId.toString(), (prev) => ({
                        reasons: [
                            ...prev.reasons,
                            {
                                desc: type, gold,
                                expiration: {
                                    duration: expiration.duration,
                                    at: util.time.getUnix() + expiration.duration,
                                },
                            }
                        ]
                    }))
                );
            },
            //#endregion
            //#region player ops
            ranks,
            rankUp: (player: number | Player, newRank: Rank) => {
                if (typeof player === "number") player = requirePlayer(player);
                if (player.gold < newRank.cost) return "not enough gold";
                return stores.players.update(player.id.toString(), (prev) => ({
                    gold: prev.gold - newRank.cost,
                    rank: newRank.level,
                }));
            },
            //#endregion
            //#region gold ops
            giveGold: (player: number | Player, gold: number) => {
                if (typeof player === "number") player = requirePlayer(player);
                return stores.players.update(player.id.toString(), (prev) => ({
                    gold: prev.gold + gold,
                }));
            },
            //#endregion
            //#region favor ops
            purchaseFavor: (player: number | Player, favor: Favor) => {
                if (typeof player === "number") player = requirePlayer(player);
                if (player.gold < favor.cost) return "not enough gold";
                return stores.players.update(player.id.toString(), (prev) => ({
                    gold: prev.gold - favor.cost,
                    inventory: {
                        favors: [
                            ...prev.inventory.favors,
                            favor.name,
                        ],
                    },
                }));
            },
            getPurchasedFavors: (player: number | Player) => {
                if (typeof player === "number") player = requirePlayer(player);
                return stores.players.get(player.id.toString())!.inventory.favors;
            },
            resolveFavor: (player: number | Player, index: number) => {
                if (typeof player === "number") player = requirePlayer(player);
                return stores.players.update(player.id.toString(), (prev) => ({
                    inventory: {
                        favors: prev.inventory.favors.filter((_val, idx) => idx !== index),
                    },
                }));
            },
            //#endregion
        };
    };
    //#endregion
};
//#endregion

export type BountyRoomOptions = GenericMapRoomOptions<{
    bounty: {
        namespace: string,
        common: BCB.CommonConfig,
        roles: BCB.RolesConfigAdditions,
        core: BCB.CoreConfigAdditions,
        prison: BCB.PrisonConfigAdditions,
    },
}>;

const MixedMapRoomClass = WithCommands(MapRoom);

export class BountyRoom extends MixedMapRoomClass {
    #util = BCB.util;
    #common: BCB.Common;
    #pending: BCB.Pending;
    #roles: BCB.Roles;
    #prison: BCB.Prison;
    #shop: BCB.Shop;
    #core: BCB.Core;

    constructor(arg: MapRoomArguments<BountyRoomOptions>) {
        //#region logic pre-init
        let conf: BCB.Config = { namespace: arg.opts.bounty.namespace };
        let common = BCB.createCommon(arg.opts.bounty.common);
        let pending = BCB.createPending();
        let roles = BCB.createRoles({ ...conf, ...arg.opts.bounty.roles });
        let prison = BCB.createPrison({ ...conf, ...arg.opts.bounty.prison, common });
        let shop = BCB.createShop(conf);
        let core = BCB.createCore({ ...conf, ...arg.opts.bounty.core, roles, prison });
        //#endregion

        //#region init
        super({
            ...arg, mixins: {
                ...(arg.mixins ?? {}), "cmd-handler": {
                    ...(arg.mixins?.["cmd-handler"] ?? {}),
                    texts: {
                        //#region help
                        help: {
                            getHelpText: (ctx, cmds) => {
                                const cmdToText = (cmd: typeof cmds[number]) => `${ctx.cmd.prefix}${cmd.name} ${cmd.desc}`;

                                const texts: string[] = [];
                                if (ctx.roles.length) {
                                    const privilegedCmds = cmds
                                        .filter(c => ctx.roles.some(r => c.roles.has(r)))
                                        .reduce<Record<string, Mutable<typeof cmds>>>((acc, c) => {
                                            if (!c.roles.main) return acc;
                                            if (!(c.roles.main in acc))
                                                acc[c.roles.main] = [];
                                            acc[c.roles.main].push(c);
                                            return acc;
                                        }, {});
                                    Object.entries(privilegedCmds).forEach(([role, cmds]) =>
                                        texts.push(
                                            `=== ${role} Commands`,
                                            ...cmds.map(cmdToText),
                                        )
                                    );
                                    texts.push("=== Public Commands");                                    
                                }
                                return [
                                    `(📋 Bounty System Commands:`,
                                    ...texts,
                                    ...cmds.filter(c => !c.roles.size).map(cmdToText),
                                ];
                            },
                        },
                        //#endregion
                    },
                    roles: roles.mapping,
                },
            },
        });
        this.#common = common;
        this.#pending = pending;
        this.#roles = roles;
        this.#prison = prison;
        this.#shop = shop;
        this.#core = core;
        this.#setupEvents();
        this.#setupCommands();
        //#endregion

        //#region post-init
        this.#prison.init({ timers: [(id) => () => this.#checkPrisonTerm(id)] });
        //#endregion
    }

    public override exit = async () => {
        this.#util.db.flush();
        this.#pending.purge();
        this.#prison.stop();
        super.exit();
    };

    //#region stay time
    #tracker = (() => {
        const players = new Map<number, ReturnType<typeof createRecord>>();
        const util = this.#util;

        const createRecord = (id: number) => ({
            id,
            joinedAt: util.time.getUnix(),
            seal() {
                const leftAt = util.time.getUnix();
                return Object.freeze({
                    id: this.id,
                    joinedAt: this.joinedAt,
                    leftAt,
                    stayTime: leftAt - this.joinedAt,
                });
            }
        });

        return {
            reset: () => players.clear(),
            track: (id: number) => {
                players.set(id, createRecord(id));
            },
            untrack: (id: number) => {
                const record = players.get(id)?.seal() ?? null;
                players.delete(id);
                return record;
            },
        };
    })();

    #resetStayTime = () => {
        console.info("FUNC(#resetStayTime):", "[TrackerReset]", "initial room update by bot ~ new session assumed");
        this.#tracker.reset();
    }

    #beginStayTime = (char: API_Character) => {
        if (!this.#core.canHaveBounty(char.MemberNumber))
            return;
        this.#tracker.track(char.MemberNumber);
        const bounty = this.#core.getBounty(char.MemberNumber);
        if ((!bounty || !bounty.reasons.find(r => r.desc === "Room Hop"))) {
            this._conn.SendMessage(
                "Whisper",
                `(⚠️ A bounty will be placed on you for room hopping if you don't stay for at least 10s.)`,
                char.MemberNumber
            );
        }
    }

    #endStayTime = (char: API_Character, intentional: boolean) => {
        const record = this.#tracker.untrack(char.MemberNumber);
        if (!intentional || !record) return;
        if (record.stayTime < 10) {
            const bounty = this.#core.punishmentBounty(char.MemberNumber, "Room Hop");
            if (bounty)
                this._conn.SendMessage(
                    "Chat",
                    `(⚠️ A ${this.#core.punishments["Room Hop"].gold} gold bounty has been placed on #${char.MemberNumber} for room hopping!)`
                );
        }
    }
    //#endregion

    //#region prison
    /** @desc ~ prompts release/extend to prisoner, assumes player passed in exists */
    #promptPrisonRelease = ({ MemberNumber }: API_Character, prisoner: BCB.Prisoner) => {
        this._conn.SendMessage(
            "Whisper", [
                `(Your imprisonment term has ended. Do you want to extend your term by 10min?`,
                `Please respond with '/bot respond <yes/no>' within 10s, no response will be treated as no.`,
            ].join("\n"),
            MemberNumber,
        );
        this.#prison.flag(prisoner.id, "prompted");
        this.#pending.response.queue(MemberNumber, (ctx, expired = false) => {
            const player = this._conn.chatRoom?.getCharacter(MemberNumber) ?? null;
            let release = expired;
            if (ctx) {
                const [res] = ctx.cmd.args;
                if (!res || !res.length || (res[0] !== "n" && res[0] !== "y"))
                    return player && this._conn.SendMessage(
                        "Whisper",
                        `(Unknown response, please respond with 'yes' or 'no'.)`,
                        MemberNumber,
                    );
                release = res[0] === 'n';
            }
            if (!release) {
                if (player) this._conn.SendMessage(
                    "Whisper",
                    `(Your imprisonment term will be extended by 10min, enjoy!)`,
                    MemberNumber,
                );
                return this.#prison.extend(prisoner.id, 10 * 60);
            }
            this.#prison.flag(prisoner.id, "releasing");
            console.info("FUNC(#promptPrisonRelease/response):", "[OnPromptResponseRelease]", `trigger(CheckPrisonTerm<${prisoner.id}>)`);
            this.#checkPrisonTerm(prisoner.id);
        }, (run) => run(null as never, true));

    }

    /** @desc ~ releases prisoner, assumes player passed in exists */
    #releasePrisoner = (player: API_Character) => {
        if (!this.#prison.release(player)) return;
        this._conn.SendMessage(
            "Whisper",
            `(You have been released from your imprisonment term.)`,
            player.MemberNumber,
        );
    }

    /** @desc ~ a sanity check for prisoner state, if not in assigned cell, just sync state, forcing an assumed release */
    #syncPrisonerRelease = (player: API_Character, prisoner: BCB.Prisoner) => {
        if (!player.MapPos) return false;
        if (player.MapPos.X === prisoner.cell.X && player.MapPos.Y === prisoner.cell.Y) return false;
        this.#releasePrisoner(player);
        return true;
    }

    /** @desc ~ runs through the whole check prisoner, check player exists flow */
    #checkPrisonTerm = (id: number): void => {
        const prisoner = this.#prison.getPrisoner(id);
        if (!prisoner) return;
        const player = this._conn.chatRoom?.getCharacter(prisoner.id) ?? null;
        if (!player) return;
        if (this.#syncPrisonerRelease(player, prisoner)) return;
        if (this.#util.time.getUnix() < prisoner.end.at) return this.#prison.requestTimer(prisoner.id, () => this.#checkPrisonTerm(id));
        if (!prisoner.flags.prompted) return this.#promptPrisonRelease(player, prisoner);
        if (prisoner.flags.releasing) return this.#releasePrisoner(player);
    }
    //#endregion

    //#region events
    #setupEvents = () => {
        this._conn.on("Message", this.#onGenericMsg);
        this._conn.on("CharacterEntered", this.#onCharEnter);
        this._conn.on("CharacterLeft", this.#onCharLeft);
    }

    #onGenericMsg = async (...[{ message, sender }]: Parameters<Parameters<typeof this._conn.on<"Message">>[1]>) => {
        console.debug("EVENT(#onGenericMsg): ", message);
        if (message.Type === "Action") {
            if (message.Content === "ServerUpdateRoom") this.#onCharUpdateRoom(sender);
        }
    }

    #onCharUpdateRoom = (char: API_Character) => {
        if (char.MemberNumber !== this._conn.Player.MemberNumber) return;
        this.#resetStayTime();
        for (const player of (this._conn.chatRoom?.characters ?? [])) {
            console.info("FUNC(#onCharUpdateRoom):", "[OnBotEnter]", `trigger(CheckPrisonTerm<${player.MemberNumber}>)`);
            this.#checkPrisonTerm(player.MemberNumber);
        }
    }

    #onCharEnter = (...[char]: Parameters<Parameters<typeof this._conn.on<"CharacterEntered">>[1]>) => {
        this.#beginStayTime(char);
        console.info("FUNC(#onCharEnter):", "[OnCharEnter]", `trigger(CheckPrisonTerm<${char.MemberNumber}>)`);
        this.#checkPrisonTerm(char.MemberNumber);
    }

    #onCharLeft = (...[, char, , intentional]: Parameters<Parameters<typeof this._conn.on<"CharacterLeft">>[1]>) => {
        this.#endStayTime(char, intentional);
    }
    //#endregion
    
    //#region commands
    #setupCommands = () => {

        //#region bounty manager
        // !putbounty (id) (gold)
        this._cmd.register({
            name: "putbounty",
            desc: "(id) (gold) — put a bounty at no cost [at least 20 gold]",
            roles: [this.#roles.BountyManager],
            callback: (ctx) => {
                const [strId, strBountyGold] = ctx.cmd.args;
                if (!strId || !isValidNumber(strId)) return ctx.reply(`(❌ Usage: !putbounty (id) (gold) ~ please provide a valid id)`);
                if (!strBountyGold || !isValidNumber(strBountyGold)) return ctx.reply(`(❌ Usage: !putbounty (id) (gold) ~ please provide a valid gold amount)`);

                const id = parseInt(strId);
                const bountyGold = parseInt(strBountyGold);
                const canHaveBounty = this.#core.canHaveBounty(id);
                if (!canHaveBounty) return ctx.reply(`(❌ Usage: !putbounty (id) (gold) ~ #${id} ${canHaveBounty.reason}!)`);
                if (bountyGold < 20) return ctx.reply(`(❌ Usage: !putbounty (id) (gold) ~ gold amount must be at least 20!)`);

                const result = this.#core.placeBounty(ctx.sender.MemberNumber, id);
                if (typeof result === "string")
                    return ctx.reply(`(⚠️ Failed to place bounty because: ${result})`);
                ctx.reply(`(✅ Placed a ${bountyGold} gold bounty on #${id}.)`);

                this._conn.SendMessage(
                    "Chat",
                    `(⚠️ A ${bountyGold} gold bounty has been placed on member #${id}!)`
                );
            }
        });
        //#endregion

        //#region gold manager
        // !givegold (id) (gold)
        this._cmd.register({
            name: "givegold",
            desc: "(id) (gold) — prints gold for target player",
            roles: [this.#roles.GoldManager],
            callback: (ctx) => {
                const [strId, strGold] = ctx.cmd.args;
                if (!strId || !isValidNumber(strId)) return ctx.reply(`(❌ Usage: !givegold (id) (gold) ~ please provide a valid id)`);
                if (!strGold || !isValidNumber(strGold)) return ctx.reply(`(❌ Usage: !givegold (id) (gold) ~ please provide a valid gold amount)`);

                const id = parseInt(strId);
                const gold = parseInt(strGold);
                if (gold <= 0) return ctx.reply(`(❌ Usage: !givegold (id) (gold) ~ gold amount cannot be negative or zero!)`)

                const result = this.#core.giveGold(id, gold);
                ctx.reply(`(✅ Gave ${gold} gold to #${id}. They now have ${result.gold} gold.)`);
                this._conn.SendMessage(
                    "Whisper",
                    `(💰 You received ${gold} gold! You now have ${result.gold} gold.)`,
                    id,
                );
            },
        });

        // !removegold (id) (gold)
        this._cmd.register({
            name: "removegold",
            desc: "(id) (gold) — confiscate gold from target player",
            roles: [this.#roles.GoldManager],
            callback: (ctx) => {
                const [strId, strGold] = ctx.cmd.args;
                if (!strId || !isValidNumber(strId)) return ctx.reply(`(❌ Usage: !removegold (id) (gold) ~ please provide a valid id)`);
                if (!strGold || !isValidNumber(strGold)) return ctx.reply(`(❌ Usage: !removegold (id) (gold) ~ please provide a valid gold amount)`);

                const id = parseInt(strId);
                const gold = parseInt(strGold);
                if (gold <= 0) return ctx.reply(`(❌ Usage: !removegold (id) (gold) ~ gold amount cannot be negative or zero!)`)

                const result = this.#core.giveGold(id, -gold);
                ctx.reply(`(✅ Removed ${gold} gold from #${id}. They now have ${result.gold} gold.)`);
                this._conn.SendMessage(
                    "Whisper",
                    `(💰 You have lost ${gold} gold! You now have ${result.gold} gold.)`,
                    id,
                );
            },
        });
        //#endregion

        //#region super admin
        // !addadmin (id)
        this._cmd.register({
            name: "addadmin",
            desc: "(id) — adds member to admin list",
            roles: [this.#roles.SuperAdmin],
            callback: (ctx) => {
                const [strId] = ctx.cmd.args;
                if (!strId || !isValidNumber(strId)) return ctx.reply(`(❌ Usage: !addadmin (id) ~ please provide a valid id)`);
                const id = parseInt(strId)
                if (this.#roles.lists.admin.has(id)) return ctx.reply(`(⚠️ #${id} is already in the admin list.)`);
                const list = this.#roles.lists.admin.add(id);
                ctx.reply(`(✅ #${id} added to admin list. The list member count is now ${list.length}.)`)
            },
        });

        // !removeadmin (id)
        this._cmd.register({
            name: "removeadmin",
            desc: "(id) — removes member from admin list",
            roles: [this.#roles.SuperAdmin],
            callback: (ctx) => {
                const [strId] = ctx.cmd.args;
                if (!strId || !isValidNumber(strId)) return ctx.reply(`(❌ Usage: !removeadmin (id) ~ please provide a valid id)`);
                const id = parseInt(strId)
                if (!this.#roles.lists.admin.has(id)) return ctx.reply(`(⚠️ #${id} is not in the admin list.)`);
                const list = this.#roles.lists.admin.remove(id);
                ctx.reply(`(✅ #${id} added to admin list. The list member count is now ${list.length}.)`)
            },
        });
        //#endregion

        //#region admin
        //#region immunity list
        // !addimmune (id)
        this._cmd.register({
            name: "addimmune",
            desc: "(id) — adds member to immune list",
            roles: [this.#roles.Admin],
            callback: (ctx) => {
                const [strId] = ctx.cmd.args;
                if (!strId || !isValidNumber(strId)) return ctx.reply(`(❌ Usage: !addimmune (id) ~ please provide a valid id)`);
                const id = parseInt(strId)
                if (this.#roles.lists.immunity.has(id)) return ctx.reply(`(⚠️ #${id} is already in the immunity list.)`);
                const list = this.#roles.lists.immunity.add(id);
                ctx.reply(`(✅ #${id} added to immunity list. The list member count is now ${list.length}.)`)
            },
        });

        // !removeimmune (id)
        this._cmd.register({
            name: "removeimmune",
            desc: "(id) — removes member from immune list",
            roles: [this.#roles.Admin],
            callback: (ctx) => {
                const [strId] = ctx.cmd.args;
                if (!strId || !isValidNumber(strId)) return ctx.reply(`(❌ Usage: !removeimmune (id) ~ please provide a valid id)`);
                const id = parseInt(strId)
                if (!this.#roles.lists.immunity.has(id)) return ctx.reply(`(⚠️ #${id} is not in the immunity list.)`);
                const list = this.#roles.lists.immunity.remove(id);
                ctx.reply(`(✅ #${id} added to immunity list. The list member count is now ${list.length}.)`)
            },
        });
        //#endregion

        //#region dom list
        // !adddom (id)
        this._cmd.register({
            name: "adddom",
            desc: "(id) — adds member to dom list",
            roles: [this.#roles.Admin],
            callback: (ctx) => {
                const [strId] = ctx.cmd.args;
                if (!strId || !isValidNumber(strId)) return ctx.reply(`(❌ Usage: !adddom (id) ~ please provide a valid id)`);
                const id = parseInt(strId)
                if (this.#roles.lists.dom.has(id)) return ctx.reply(`(⚠️ #${id} is already in the dom list.)`);
                const list = this.#roles.lists.dom.add(id);
                ctx.reply(`(✅ #${id} added to dom list. The list member count is now ${list.length}.)`)
            },
        });

        // !removedom (id)
        this._cmd.register({
            name: "removedom",
            desc: "(id) — removes member from dom list",
            roles: [this.#roles.Admin],
            callback: (ctx) => {
                const [strId] = ctx.cmd.args;
                if (!strId || !isValidNumber(strId)) return ctx.reply(`(❌ Usage: !removedom (id) ~ please provide a valid id)`);
                const id = parseInt(strId)
                if (!this.#roles.lists.dom.has(id)) return ctx.reply(`(⚠️ #${id} is not in the dom list.)`);
                const list = this.#roles.lists.dom.remove(id);
                ctx.reply(`(✅ #${id} added to dom list. The list member count is now ${list.length}.)`)
            },
        });
        //#endregion
        //#endregion

        //#region prison mgmt
        // !release (id)
        this._cmd.register({
            name: "release",
            desc: "(id) — force releases player from prison term",
            roles: [this.#roles.Dom, this.#roles.Admin, this.#roles.SuperAdmin],
            callback: (ctx) => {
                const [strId] = ctx.cmd.args;
                if (!strId || !isValidNumber(strId)) return ctx.reply(`(❌ Usage: !release (id) ~ please provide a valid id)`);
                const id = parseInt(strId)
                const prisoner = this.#prison.getPrisoner(id);
                if (!prisoner) return ctx.reply(`(❌ #${id} isn't a prisoner in the system.)`);
                const target = this._conn.chatRoom?.getCharacter(prisoner.id) ?? null;
                if (!target) return ctx.reply(`(❌ Cannot release #${id} when they aren't here.)`);
                this.#releasePrisoner(target);
            },
        });
        //#endregion

        //#region misc
        // !confirm
        this._cmd.register({
            name: "confirm",
            desc: "— confirm a pending action",
            callback: (ctx) => {
                const pending = this.#pending.confirm.get(ctx.sender.MemberNumber);
                if (!pending) return ctx.reply('(❌ Nothing to confirm.)');
                pending.run(ctx);
            }
        });

        // !respond (response)
        this._cmd.register({
            name: "respond",
            desc: "(response) — respond to a prompt",
            callback: (ctx) => {
                const pending = this.#pending.response.get(ctx.sender.MemberNumber);
                if (!pending) return ctx.reply(`(❌ Nothing to respond to.)`);
                pending.run(ctx);
            },
        })
        //#endregion

        //#region profile ops
        // !gold
        this._cmd.register({
            name: "gold",
            desc: "— check your gold and rank",
            callback: (ctx) => {
                const player = this.#core.requirePlayer(ctx.sender.MemberNumber);
                ctx.reply(`(💰 Gold: ${player.gold} | Rank: ${player.rank} (${player.rank.name})`);
            },
        });

        // !rankup
        this._cmd.register({
            name: "rankup",
            desc: "— see next rank cost",
            callback: (ctx) => {
                const player = this.#core.requirePlayer(ctx.sender.MemberNumber);
                if (player.rank.level >= this.#core.ranks.length - 1)
                    return ctx.reply(`(🏆 You are already at max rank: ${player.rank.name}!)`);

                const nextRank = this.#core.ranks[player.rank.level + 1];
                ctx.reply([
                    `(📊 Current rank: ${player.rank.name} (${player.rank.level}/${this.#core.ranks.length - 1})`,
                    `Next rank: ${nextRank.name} — costs ${nextRank.cost} gold`,
                    `You have ${player.gold} gold.`,
                    `Type !purchaserankup to buy it.`
                ].join("\n"));
            }
        });

        // !purchaserankup
        this._cmd.register({
            name: "purchaserankup",
            desc: "— buy next rank",
            callback: (ctx) => {
                const player = this.#core.requirePlayer(ctx.sender.MemberNumber);
                if (player.rank.level >= this.#core.ranks.length - 1)
                    return ctx.reply(`(🏆 You are already at max rank!)`);

                const nextRank = this.#core.ranks[player.rank.level + 1];
                if (player.gold < nextRank.cost)
                    return ctx.reply(`(❌ Not enough gold! ${nextRank.name} costs ${nextRank.cost} gold. You have ${player.gold}.)`);

                const originalInfo = { player };
                ctx.reply(`(⚠️ Rank up to ${nextRank.name} costs ${nextRank.cost} gold. You have ${player.gold}. Type !confirm to purchase.`);
                this.#pending.confirm.queue(ctx.sender.MemberNumber, (ctx) => {
                    const player = this.#core.requirePlayer(ctx.sender.MemberNumber);
                    if (player.gold !== originalInfo.player.gold)
                        return ctx.reply(`(⚠️ Your gold has changed. Please redo !purchaserankup again to confirm the changes.)`);

                    const result = this.#core.rankUp(player, nextRank);
                    if (typeof result === "string")
                        return ctx.reply(`(⚠️ Failed to rank up because: ${result})`);
                    ctx.reply(`(🏆 Rank up! You are now a ${nextRank.name}! Remaining gold: ${result.gold}.)`);

                    this._conn.SendMessage(
                        "Chat",
                        `(🏆 ${parseApiCharObj(ctx.sender).name} has ranked up to ${nextRank.name}!)`
                    );
                });
            }
        });
        //#endregion

        //#region bounty ops
        // !bounty (id)
        this._cmd.register({
            name: "bounty",
            desc: "(id) — check a bounty",
            callback: (ctx) => {
                const [id] = ctx.cmd.args;
                if (!id || !isValidNumber(id)) return ctx.reply(`(❌ Usage: !bounty (id) ~ please provide a valid id)`);
                const bounty = this.#core.getBounty(parseInt(id));
                if (!bounty) return ctx.reply(`(✅ #${id} has no bounty.)`);
                ctx.reply(`(⚠️ #${id} has a bounty of ${id} gold.)`);
            },
        });

        // !claimbounty
        this._cmd.register({
            name: "claimbounty",
            desc: "— capture a wanted target (stand at claim zone)",
            callback: (ctx) => {
                if (!ctx.sender.MapPos) return;
                if (!this.#common.areas.Claim.covers(ctx.sender.MapPos)) return ctx.reply(`(❌ You need to stand at the bounty claim area to use this.)`);

                const players = (this._conn.chatRoom?.characters ?? []).filter(p => p.MapPos);
                const target = players.find(c =>
                    c.MemberNumber !== ctx.sender.MemberNumber &&
                    this.#core.getBounty(c.MemberNumber) &&
                    this.#common.areas.BountyTarget.covers(c.MapPos)
                );
                if (!target) return ctx.reply(`(❌ No wanted targets found in the capture zone.)`);

                const bounty = this.#core.getBounty(target.MemberNumber);
                if (!bounty) return ctx.reply(`(❌ Target in capture zone somehow has no bounty.)`);

                const cells = this.#prison.cells.free.filter(tile =>
                    !players.some(({ MapPos: { X, Y } }) => tile.X === X && tile.Y === Y )
                );
                if (!cells.length) return ctx.reply("(❌ All prison cells are full! Try again later.)");

                const targetMeta = parseApiCharObj(target);
                const prisoner = this.#prison.admit({
                    bounty,
                    botName: this._conn.Player.Name,
                    targetName: targetMeta.name,
                    target,
                    cell: pickRandom(cells),
                });
                if (typeof prisoner === "string")
                    return ctx.reply(`(❌ Could not admit prisoner: ${prisoner})`);

                const claimer = this.#core.claimBounty(ctx.sender.MemberNumber, bounty);
                if (!claimer) return ctx.reply("(❌ Internal error occured while claiming! Try again later.)");
                ctx.reply(`(✅ You have successfully collected the bounty! +${bounty.gold} gold. Total: ${claimer.gold} gold.)`)
                this._conn.SendMessage(
                    "Whisper",
                    `(🔒 Someone has collected your bounty! You have been taken to prison for a term of ${this.#util.time.formatSecs(prisoner.end.duration)}.)`,
                    target.MemberNumber
                );

                this._conn.SendMessage(
                    "Chat",
                    `(⚡ ${parseApiCharObj(ctx.sender).name} has claimed a bounty on ${targetMeta.name}!)`
                );
            },
        });

        // !clearbounty (id)
        this._cmd.register({
            name: "clearbounty",
            desc: "(id) — pay to clear a bounty (stand at claim zone)",
            callback: (ctx) => {
                if (!ctx.sender.MapPos) return;
                if (!this.#common.areas.Shop.covers(ctx.sender.MapPos)) return ctx.reply(`(❌ You need to stand at the bounty area to use this.)`);

                const [id] = ctx.cmd.args;
                if (!id || !isValidNumber(id)) return ctx.reply(`(❌ Usage: !clearbounty (id) ~ please provide a valid id)`);

                const bounty = this.#core.getBounty(parseInt(id));
                if (!bounty) return ctx.reply(`(❌ #${id} has no bounty.)`);

                const player = this.#core.requirePlayer(ctx.sender.MemberNumber);
                const infoPrefix = `⚠️ #${id} has a bounty of ${bounty.gold} gold. Clearing it costs ${bounty.clearCost} gold (1.5x).`;
                if (player.gold < bounty.clearCost)
                    return ctx.reply(`(${infoPrefix} You only have ${player.gold} gold.)`);
                
                const originalInfo = { player, bounty };
                ctx.reply(`(${infoPrefix} You have ${player.gold} gold. Type !confirm to proceed.`);
                this.#pending.confirm.queue(ctx.sender.MemberNumber, (ctx) => {
                    const bounty = this.#core.getBounty(parseInt(id));
                    const player = this.#core.requirePlayer(ctx.sender.MemberNumber);
                    if (player.gold !== originalInfo.player.gold || !bounty || bounty.gold !== originalInfo.bounty.gold)
                        return ctx.reply(`(⚠️ Either #${id}'s bounty has changed or your gold has changed. Please redo !clearbounty again to confirm the changes.)`);

                    const result = this.#core.clearBounty(player, bounty);
                    if (typeof result === "string")
                        return ctx.reply(`(⚠️ Failed to clear bounty because: ${result})`);
                    ctx.reply(`(✅ Bounty on #${id} cleared! You paid ${bounty.clearCost} gold. Remaining gold: ${result.gold}.)`);

                    this._conn.SendMessage(
                        "Whisper",
                        `(🎉 Your bounty has been cleared by someone!)`,
                        parseInt(id),
                    );
                });
            },
        });

        // !placebounty (id) (gold)
        this._cmd.register({
            name: "placebounty",
            desc: "(id) (gold) — place a bounty [stand at claim zone, at least 20 gold]",
            callback: (ctx) => {
                if (!ctx.sender.MapPos) return;
                if (!this.#common.areas.Shop.covers(ctx.sender.MapPos)) return ctx.reply(`(❌ You need to stand at the bounty area to use this.)`);

                const [strId, strBountyGold] = ctx.cmd.args;
                if (!strId || !isValidNumber(strId)) return ctx.reply(`(❌ Usage: !placebounty (id) (gold) ~ please provide a valid id)`);
                if (!strBountyGold || !isValidNumber(strBountyGold)) return ctx.reply(`(❌ Usage: !placebounty (id) (gold) ~ please provide a valid gold amount)`);

                const id = parseInt(strId);
                const bountyGold = parseInt(strBountyGold);
                const canHaveBounty = this.#core.canHaveBounty(id);
                if (!canHaveBounty) return ctx.reply(`(❌ Usage: !placebounty (id) (gold) ~ #${id} ${canHaveBounty.reason}!)`);
                if (bountyGold < 20) return ctx.reply(`(❌ Usage: !placebounty (id) (gold) ~ gold amount must be at least 20!)`)

                const player = this.#core.requirePlayer(ctx.sender.MemberNumber);
                if (player.gold < bountyGold) return ctx.reply(`(❌ Not enough gold! You have ${player.gold} gold.)`);

                const result = this.#core.placeBounty(player, id, bountyGold);
                if (typeof result === "string")
                    return ctx.reply(`(⚠️ Failed to place bounty because: ${result})`);
                ctx.reply(`(✅ Placed a ${bountyGold} gold bounty on #${id}. Your gold: ${result.gold}.)`);

                this._conn.SendMessage(
                    "Chat",
                    `(⚠️ A ${bountyGold} gold bounty has been placed on member #${id}!)`
                );
            }
        });
        //#endregion
    }
    //#endregion
}