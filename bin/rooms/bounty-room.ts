//@ts-ignore
import { API_Character, AssetGet } from "bc-bot";
import { CommandContext, WithCommands } from "../mixins";
import { DeepPartial, ObjStore, obj, isValidNumber, map, parseApiCharObj, pickRandom, withReason } from "../utils";
import { GenericMapRoomOptions, MapRoom, MapRoomArguments } from "./map-room";
import { __ } from "../features/bounty";

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
                            if (key in data) obj.deep.apply(diff, data[key]);
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
                _name: name,
            });
        
            return Object.freeze({
                SuperAdmin: createIds(__.roles.names.super_admin, membersOf.SuperAdmin),
                GoldManager: createIds(__.roles.names.gold_manager, membersOf.GoldManager),
                BountyManager: createIds(__.roles.names.bounty_manager, membersOf.BountyManager),
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
            Object.assign(() => internalLists[key], { _name: name });
        type RoleMapping = typeof mapping;
        const mapping = {
            ...fixedRoles,
            Admin: createRoleList(__.roles.names.admin, "admin"),
            Dom: createRoleList(__.roles.names.dom, "dom"),
            Immune: createRoleList(__.roles.names.immune, "immunity"),
        };
        const roles: Record<keyof RoleMapping, string> = Object.fromEntries(
            Object.entries(mapping).map(([key, list]) => [key, list._name])
        ) as never;

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
        const lists = (Object.keys(internalLists) as RoleKey[])
            .reduce<Record<RoleKey, RoleList>>((acc, key) => {
                acc[key] = createList(key);
                return acc;
            }, {} as Record<RoleKey, RoleList>);
        type RoleList = ReturnType<typeof createList>;

        return {
            ...roles,
            mapping: Object.fromEntries(
                Object.entries(mapping).map(([, list]) => [list._name, list])
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
                    return __.prison.err.no_add_restraint_permission;
                if (store.get(bounty.id.toString()))
                    return __.prison.err.already_a_prisoner;
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
                        __.prison.warn.no_remove_restraint_permission,
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
                    if (!catalogue.favors[index]) return withReason(__.shop.err.non_existent_index);
                    const favor = catalogue.favors[index];
                    updateFavors((favors) => favors.splice(index, 1));
                    return favor;
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

        const getOwedFavors = () => stores.players.values.flatMap(
            player => player.inventory.favors.map(
                (favor, index) => ({ forId: player.id, forIndex: index, name: favor })
            )
        ).map((val, index) => ({ index, ...val }));
        //#endregion

        return {
            requirePlayer, getBounty, requireBounty,
            //#region bounty ops
            canHaveBounty: (id: number) => {
                if (prison.has(id)) return withReason(__.core.err.is_imprisoned);
                if (roles.lists.immunity.has(id)) return withReason(__.core.err.is_immune);
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
                if (!bounty) return __.core.err.bounty_not_found;
                if (clearer.gold < bounty.clearCost) return __.core.err.not_enough_gold;

                const player = stores.players.update(clearer.id.toString(), (prev) => ({
                    gold: prev.gold - bounty.clearCost
                }));
                stores.bounties.delete(bounty.id.toString());
                return player;
            },
            placeBounty: (placer: number | Player, targetId: number, gold: number = 0) => {
                if (typeof placer === "number") placer = requirePlayer(placer);
                const bounty = requireBounty(targetId);

                if (placer.gold < gold) return __.core.err.not_enough_gold;
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
                if (player.gold < newRank.cost) return __.core.err.not_enough_gold;
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
                if (player.gold < favor.cost) return withReason(__.core.err.not_enough_gold);
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
            getOwedFavors: (player: number | Player | null = null) => {
                const owed = getOwedFavors();
                if (!player) return owed;
                if (typeof player === "number") player = requirePlayer(player);
                return owed.filter(f => f.forId === player.id);
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
                                const cmdToText = (cmd: typeof cmds[number]) =>
                                    __.cmd.help.cmd_to_text(ctx.cmd.prefix, cmd.name, cmd.desc);

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
                                            __.cmd.help.role_commands_title(role),
                                            ...cmds.map(cmdToText),
                                        )
                                    );
                                    texts.push(__.cmd.help.public_commands_title);
                                }
                                return [
                                    __.cmd.help.title,
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
                __.events.room_hop.warning,
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
                    __.events.room_hop.bounty(this.#core.punishments["Room Hop"].gold, char.MemberNumber),
                );
        }
    }
    //#endregion

    //#region prison
    /** @desc ~ prompts release/extend to prisoner, assumes player passed in exists */
    #promptPrisonRelease = ({ MemberNumber }: API_Character, prisoner: BCB.Prisoner) => {
        this._conn.SendMessage("Whisper", __.events.prison.release.prompt, MemberNumber);
        this.#prison.flag(prisoner.id, "prompted");
        this.#pending.response.queue(MemberNumber, (ctx, expired = false) => {
            const player = this._conn.chatRoom?.getCharacter(MemberNumber) ?? null;
            let release = expired;
            if (ctx) {
                const [res] = ctx.cmd.args;
                if (!res || !res.length || (res[0] !== "n" && res[0] !== "y"))
                    return player && this._conn.SendMessage(
                        "Whisper",
                        __.events.prison.release.unknown_response,
                        MemberNumber,
                    );
                release = res[0] === 'n';
            }
            if (!release) {
                if (player) this._conn.SendMessage(
                    "Whisper",
                    __.events.prison.release.extended,
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
        this._conn.SendMessage("Whisper", __.events.prison.release.completed, player.MemberNumber);
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
        this._conn.on("CharacterMapUpdate", this.#onCharMapUpdate);
    }

    #onGenericMsg = async (...[{ message, sender }]: Parameters<Parameters<typeof this._conn.on<"Message">>[1]>) => {
        console.debug("EVENT(#onGenericMsg): ", message);
        if (message.Type === "Action") {
            if (message.Content === "ServerUpdateRoom") this.#onCharUpdateRoom(sender);
        }
    }

    /** @desc ~ in-memory set of joined players pending their map location information */
    #pendingJoins = new Set<number>();

    /** @desc ~ event for when the bot enters the room (first connect/subsequent reconnects) */
    #onCharUpdateRoom = (char: API_Character) => {
        if (char.MemberNumber !== this._conn.Player.MemberNumber) return;

        console.info("FUNC(#onCharUpdateRoom):", `#pendingJoins(clear)`);
        this.#pendingJoins.clear();

        this.#resetStayTime();

        for (const player of (this._conn.chatRoom?.characters ?? [])) {
            console.info("FUNC(#onCharUpdateRoom):", "[OnBotEnter]", `trigger(CheckPrisonTerm<${player.MemberNumber}>)`);
            this.#checkPrisonTerm(player.MemberNumber);
        }
    }

    /** @desc ~ event on player join room... still without map information */
    #onCharEnter = (...[char]: Parameters<Parameters<typeof this._conn.on<"CharacterEntered">>[1]>) => {
        console.info("FUNC(#onCharEnter):", `#pendingJoins(added)`, `+#${char.MemberNumber}`);
        this.#pendingJoins.add(char.MemberNumber);
    }

    /** @desc ~ event on character move including the first map information */
    #onCharMapUpdate = (...[char]: Parameters<Parameters<typeof this._conn.on<"CharacterMapUpdate">>[1]>) => {
        if (this.#pendingJoins.delete(char.MemberNumber)) {
            console.info("FUNC(#onCharMapUpdate):", `#pendingJoins(resolved)`, `-#${char.MemberNumber}`);
            this.#onCharEnterMap(char);
        }
    }

    /** @desc ~ event when character entered the map and their first map information arrived */
    #onCharEnterMap = (char: API_Character) => {
        this.#beginStayTime(char);

        console.info("FUNC(#onCharEnterMap):", "[OnCharEnter]", `trigger(CheckPrisonTerm<${char.MemberNumber}>)`);
        this.#checkPrisonTerm(char.MemberNumber);
    }

    #onCharLeft = (...[, char, , intentional]: Parameters<Parameters<typeof this._conn.on<"CharacterLeft">>[1]>) => {
        this.#endStayTime(char, intentional);

        console.info("FUNC(#onCharLeft):", `#pendingJoins(resolved)`, `-#${char.MemberNumber}`);
        this.#pendingJoins.delete(char.MemberNumber);
    }
    //#endregion
    
    //#region commands
    #setupCommands = () => {

        //#region bounty manager
        // !putbounty (id) (gold)
        this._cmd.register({
            name: __.cmd.put_bounty.name, desc: __.cmd.put_bounty.desc,
            roles: [this.#roles.BountyManager],
            callback: (ctx) => {
                const [strId, strBountyGold] = ctx.cmd.args;
                if (!strId || !isValidNumber(strId)) return ctx.reply(__.cmd.put_bounty.err.invalid_id(ctx));
                if (!strBountyGold || !isValidNumber(strBountyGold)) return ctx.reply(__.cmd.put_bounty.err.invalid_gold(ctx));

                const id = parseInt(strId);
                const bountyGold = parseInt(strBountyGold);
                const canHaveBounty = this.#core.canHaveBounty(id);
                if (!canHaveBounty) return ctx.reply(__.cmd.put_bounty.err.bounty_immunity(ctx, id, canHaveBounty.reason));
                if (bountyGold < 20) return ctx.reply(__.cmd.put_bounty.err.need_min_gold(ctx));

                const result = this.#core.placeBounty(ctx.sender.MemberNumber, id);
                if (typeof result === "string")
                    return ctx.reply(__.cmd.put_bounty.err.failed(result));
                ctx.reply(__.cmd.put_bounty.placed(bountyGold, id));

                this._conn.SendMessage("Chat", __.cmd.put_bounty.announce(bountyGold, id));
            }
        });
        //#endregion

        //#region gold manager
        // !givegold (id) (gold)
        this._cmd.register({
            name: __.cmd.give_gold.name, desc: __.cmd.give_gold.desc,
            roles: [this.#roles.GoldManager],
            callback: (ctx) => {
                const [strId, strGold] = ctx.cmd.args;
                if (!strId || !isValidNumber(strId)) return ctx.reply(__.cmd.give_gold.err.invalid_id(ctx));
                if (!strGold || !isValidNumber(strGold)) return ctx.reply(__.cmd.give_gold.err.invalid_gold(ctx));

                const id = parseInt(strId);
                const gold = parseInt(strGold);
                if (gold <= 0) return ctx.reply(__.cmd.give_gold.err.neg_or_zero_gold(ctx))

                const result = this.#core.giveGold(id, gold);
                ctx.reply(__.cmd.give_gold.given(gold, id, result.gold));
                this._conn.SendMessage("Whisper", __.cmd.give_gold.received(gold, result.gold), id);
            },
        });

        // !removegold (id) (gold)
        this._cmd.register({
            name: __.cmd.remove_gold.name, desc: __.cmd.remove_gold.desc,
            roles: [this.#roles.GoldManager],
            callback: (ctx) => {
                const [strId, strGold] = ctx.cmd.args;
                if (!strId || !isValidNumber(strId)) return ctx.reply(__.cmd.remove_gold.err.invalid_id(ctx));
                if (!strGold || !isValidNumber(strGold)) return ctx.reply(__.cmd.remove_gold.err.invalid_gold(ctx));

                const id = parseInt(strId);
                const gold = parseInt(strGold);
                if (gold <= 0) return ctx.reply(__.cmd.remove_gold.err.neg_or_zero_gold(ctx))

                const result = this.#core.giveGold(id, -gold);
                ctx.reply(__.cmd.remove_gold.removed(gold, id, result.gold));
                this._conn.SendMessage("Whisper", __.cmd.remove_gold.lost(gold, result.gold), id);
            },
        });
        //#endregion

        //#region super admin
        // !addadmin (id)
        this._cmd.register({
            name: __.cmd.add_admin.name, desc: __.cmd.add_admin.desc,
            roles: [this.#roles.SuperAdmin],
            callback: (ctx) => {
                const [strId] = ctx.cmd.args;
                if (!strId || !isValidNumber(strId)) return ctx.reply(__.cmd.add_admin.err.invalid_id(ctx));
                const id = parseInt(strId)
                if (this.#roles.lists.admin.has(id)) return ctx.reply(__.cmd.add_admin.err.already_added(id));
                const list = this.#roles.lists.admin.add(id);
                ctx.reply(__.cmd.add_admin.added(id, list.length));
            },
        });

        // !removeadmin (id)
        this._cmd.register({
            name: __.cmd.remove_admin.name, desc: __.cmd.remove_admin.desc,
            roles: [this.#roles.SuperAdmin],
            callback: (ctx) => {
                const [strId] = ctx.cmd.args;
                if (!strId || !isValidNumber(strId)) return ctx.reply(__.cmd.remove_admin.err.invalid_id(ctx));
                const id = parseInt(strId)
                if (!this.#roles.lists.admin.has(id)) return ctx.reply(__.cmd.remove_admin.err.not_in_list(id));
                const list = this.#roles.lists.admin.remove(id);
                ctx.reply(__.cmd.remove_admin.removed(id, list.length));
            },
        });
        //#endregion

        //#region admin
        //#region immunity list
        // !addimmune (id)
        this._cmd.register({
            name: __.cmd.add_immune.name, desc: __.cmd.add_immune.desc,
            roles: [this.#roles.Admin],
            callback: (ctx) => {
                const [strId] = ctx.cmd.args;
                if (!strId || !isValidNumber(strId)) return ctx.reply(__.cmd.add_immune.err.invalid_id(ctx));
                const id = parseInt(strId)
                if (this.#roles.lists.immunity.has(id)) return ctx.reply(__.cmd.add_immune.err.already_added(id));
                const list = this.#roles.lists.immunity.add(id);
                ctx.reply(__.cmd.add_immune.added(id, list.length));
            },
        });

        // !removeimmune (id)
        this._cmd.register({
            name: __.cmd.remove_immune.name, desc: __.cmd.remove_immune.desc,
            roles: [this.#roles.Admin],
            callback: (ctx) => {
                const [strId] = ctx.cmd.args;
                if (!strId || !isValidNumber(strId)) return ctx.reply(__.cmd.remove_immune.err.invalid_id(ctx));
                const id = parseInt(strId)
                if (!this.#roles.lists.immunity.has(id)) return ctx.reply(__.cmd.remove_immune.err.not_in_list(id));
                const list = this.#roles.lists.immunity.remove(id);
                ctx.reply(__.cmd.remove_immune.removed(id, list.length));
            },
        });
        //#endregion

        //#region dom list
        // !adddom (id)
        this._cmd.register({
            name: __.cmd.add_dom.name, desc: __.cmd.add_dom.desc,
            roles: [this.#roles.Admin],
            callback: (ctx) => {
                const [strId] = ctx.cmd.args;
                if (!strId || !isValidNumber(strId)) return ctx.reply(__.cmd.add_dom.err.invalid_id(ctx));
                const id = parseInt(strId)
                if (this.#roles.lists.dom.has(id)) return ctx.reply(__.cmd.add_dom.err.already_added(id));
                const list = this.#roles.lists.dom.add(id);
                ctx.reply(__.cmd.add_dom.added(id, list.length));
            },
        });

        // !removedom (id)
        this._cmd.register({
            name: __.cmd.remove_dom.name, desc: __.cmd.remove_dom.desc,
            roles: [this.#roles.Admin],
            callback: (ctx) => {
                const [strId] = ctx.cmd.args;
                if (!strId || !isValidNumber(strId)) return ctx.reply(__.cmd.remove_dom.err.invalid_id(ctx));
                const id = parseInt(strId)
                if (!this.#roles.lists.dom.has(id)) return ctx.reply(__.cmd.remove_dom.err.not_in_list(id));
                const list = this.#roles.lists.dom.remove(id);
                ctx.reply(__.cmd.remove_dom.removed(id, list.length));
            },
        });
        //#endregion

        //#region favors mgmt
        // !addfavor (price) (name)
        this._cmd.register({
            name: __.cmd.add_favor.name, desc: __.cmd.add_favor.desc,
            roles: [this.#roles.Admin],
            callback: (ctx) => {
                const [strPrice, favorName] = ctx.cmd.args;
                if (!strPrice || !isValidNumber(strPrice)) return ctx.reply(__.cmd.add_favor.err.invalid_price(ctx));
                if (!favorName) return ctx.reply(__.cmd.add_favor.err.invalid_name(ctx));

                const price = parseInt(strPrice);
                if (price <= 0) return ctx.reply(__.cmd.add_favor.err.neg_or_zero_price(ctx));

                this.#shop.favors.add({ cost: price, name: favorName });
                ctx.reply(__.cmd.add_favor.added(favorName, price));
            },
        });

        // !removefavor (index)
        this._cmd.register({
            name: __.cmd.remove_favor.name, desc: __.cmd.remove_favor.desc,
            roles: [this.#roles.Admin],
            callback: (ctx) => {
                const [strIndex] = ctx.cmd.args;
                if (!strIndex || !isValidNumber(strIndex)) return ctx.reply(__.cmd.remove_favor.err.invalid_index(ctx));
                const index = parseInt(strIndex)

                const favors = this.#shop.favors.list;
                if (index < 1 || index > favors.length) return ctx.reply(__.cmd.remove_favor.err.index_out_of_range(ctx));

                const removed = this.#shop.favors.remove(index - 1);
                if (!removed) return ctx.reply(__.cmd.remove_favor.err.failed(removed.reason));
                ctx.reply(__.cmd.remove_favor.removed(removed.name, removed.cost));
            },
        });

        // !removeOwed (index)
        this._cmd.register({
            name: __.cmd.remove_owed.name, desc: __.cmd.remove_owed.desc,
            roles: [this.#roles.Admin],
            callback: (ctx) => {
                const [strIndex] = ctx.cmd.args;
                if (!strIndex || !isValidNumber(strIndex)) return ctx.reply(__.cmd.remove_owed.err.invalid_index(ctx));
                const index = parseInt(strIndex)

                const favors = this.#core.getOwedFavors();
                if (index < 1 || index > favors.length) return ctx.reply(__.cmd.remove_owed.err.index_out_of_range(ctx));

                const { forId, forIndex, name } = favors[index - 1];
                this.#core.resolveFavor(forId, forIndex);
                ctx.reply(__.cmd.remove_owed.resolved(name, forId));
            },
        });

        // !displayOwed
        this._cmd.register({
            name: __.cmd.display_owed.name, desc: __.cmd.display_owed.desc,
            roles: [this.#roles.Admin],
            callback: (ctx) => {
                const favors = this.#core.getOwedFavors();
                ctx.reply(
                    __.cmd.display_owed.title(favors.length),
                    ...favors.map(({ index, forId, name }) =>
                        __.cmd.display_owed.entry(index + 1, forId, name)
                    ),
                );
            },
        });
        //#endregion
        //#endregion

        //#region prison mgmt
        // !release (id)
        this._cmd.register({
            name: __.cmd.release.name, desc: __.cmd.release.desc,
            roles: [this.#roles.Dom, this.#roles.Admin, this.#roles.SuperAdmin],
            callback: (ctx) => {
                const [strId] = ctx.cmd.args;
                if (!strId || !isValidNumber(strId)) return ctx.reply(__.cmd.release.err.invalid_id(ctx));
                const id = parseInt(strId)
                const prisoner = this.#prison.getPrisoner(id);
                if (!prisoner) return ctx.reply(__.cmd.release.err.not_prisoner(id));
                const target = this._conn.chatRoom?.getCharacter(prisoner.id) ?? null;
                if (!target) return ctx.reply(__.cmd.release.err.not_present(id));
                this.#releasePrisoner(target);
            },
        });
        //#endregion

        //#region misc
        // !confirm
        this._cmd.register({
            name: __.cmd.confirm.name, desc: __.cmd.confirm.desc,
            callback: (ctx) => {
                const pending = this.#pending.confirm.get(ctx.sender.MemberNumber);
                if (!pending) return ctx.reply(__.cmd.confirm.err.no_action);
                pending.run(ctx);
            }
        });

        // !respond (response)
        this._cmd.register({
            name: __.cmd.respond.name, desc: __.cmd.respond.desc,
            callback: (ctx) => {
                const pending = this.#pending.response.get(ctx.sender.MemberNumber);
                if (!pending) return ctx.reply(__.cmd.respond.err.no_prompt);
                pending.run(ctx);
            },
        })
        //#endregion

        //#region profile ops
        // !gold
        this._cmd.register({
            name: __.cmd.gold.name, desc: __.cmd.gold.desc,
            callback: (ctx) => {
                const player = this.#core.requirePlayer(ctx.sender.MemberNumber);
                ctx.reply(__.cmd.gold.stat(player.gold, player.rank.level, player.rank.name));
            },
        });

        // !favors
        this._cmd.register({
            name: __.cmd.favors.name, desc: __.cmd.favors.desc,
            callback: (ctx) => {
                const favors = this.#core.getOwedFavors(ctx.sender.MemberNumber);
                ctx.reply(
                    __.cmd.favors.title(favors.length),
                    ...favors.map(({ name }) => __.cmd.favors.entry(name)),
                );
            },
        });

        // !rankup
        this._cmd.register({
            name: __.cmd.rankup.name, desc: __.cmd.rankup.desc,
            callback: (ctx) => {
                const player = this.#core.requirePlayer(ctx.sender.MemberNumber);
                if (player.rank.level >= this.#core.ranks.length - 1)
                    return ctx.reply(__.cmd.rankup.at_max_rank(player.rank.name));

                const nextRank = this.#core.ranks[player.rank.level + 1];
                ctx.reply(__.cmd.rankup.info(
                    player.rank.name, player.rank.level,
                    this.#core.ranks.length - 1,
                    nextRank.name, nextRank.cost,
                    player.gold
                ));
            }
        });

        // !purchaserankup
        this._cmd.register({
            name: __.cmd.purchase_rankup.name, desc: __.cmd.purchase_rankup.desc,
            callback: (ctx) => {
                const player = this.#core.requirePlayer(ctx.sender.MemberNumber);
                if (player.rank.level >= this.#core.ranks.length - 1)
                    return ctx.reply(__.cmd.purchase_rankup.at_max_rank);

                const nextRank = this.#core.ranks[player.rank.level + 1];
                if (player.gold < nextRank.cost)
                    return ctx.reply(__.cmd.purchase_rankup.err.not_enough_gold(nextRank.name, nextRank.cost, player.gold));

                const originalInfo = { player };
                ctx.reply(__.cmd.purchase_rankup.prompt(nextRank.name, nextRank.cost, player.gold));
                this.#pending.confirm.queue(ctx.sender.MemberNumber, (ctx) => {
                    const player = this.#core.requirePlayer(ctx.sender.MemberNumber);
                    if (player.gold !== originalInfo.player.gold)
                        return ctx.reply(__.cmd.purchase_rankup.err.mismatch);

                    const result = this.#core.rankUp(player, nextRank);
                    if (typeof result === "string")
                        return ctx.reply(__.cmd.purchase_rankup.err.failed(result));
                    ctx.reply(__.cmd.purchase_rankup.success(nextRank.name, result.gold));

                    this._conn.SendMessage(
                        "Chat",
                        __.cmd.purchase_rankup.announce(parseApiCharObj(ctx.sender).name, nextRank.name),
                    );
                });
            }
        });
        //#endregion

        //#region favor store
        // !displaystore
        this._cmd.register({
            name: __.cmd.display_store.name, desc: __.cmd.display_store.desc,
            callback: (ctx) => {
                const favors = this.#shop.favors.list;
                ctx.reply(
                    __.cmd.display_store.title(favors.length),
                    ...favors.map(({ cost, name }, index) =>
                        __.cmd.display_store.entry(index + 1, name, cost),
                    ),
                );
            },
        });

        // !buy (index)
        this._cmd.register({
            name: __.cmd.buy.name, desc: __.cmd.buy.desc,
            callback: (ctx) => {
                const [strIndex] = ctx.cmd.args;
                if (!strIndex || !isValidNumber(strIndex)) return ctx.reply(__.cmd.buy.err.invalid_index(ctx));
                const index = parseInt(strIndex)

                const favors = this.#shop.favors.list;
                if (index < 1 || index > favors.length)
                    return ctx.reply(__.cmd.buy.err.index_out_of_range(ctx));

                const favor = favors[index - 1];
                const purchased = this.#core.purchaseFavor(ctx.sender.MemberNumber, favor);
                if (!purchased) return ctx.reply(__.cmd.buy.err.failed(purchased.reason));
                ctx.reply(__.cmd.buy.bought(favor.name));
            },
        });
        //#endregion

        //#region bounty ops
        // !bounty (id)
        this._cmd.register({
            name: __.cmd.bounty.name, desc: __.cmd.bounty.desc,
            callback: (ctx) => {
                const [strId] = ctx.cmd.args;
                if (!strId || !isValidNumber(strId)) return ctx.reply(__.cmd.bounty.err.invalid_id(ctx));

                const id = parseInt(strId);
                const bounty = this.#core.getBounty(id);
                if (!bounty) return ctx.reply(__.cmd.bounty.no_bounty(id));
                ctx.reply(__.cmd.bounty.bounty(id, bounty.gold));
            },
        });

        // !claimbounty
        this._cmd.register({
            name: __.cmd.claim_bounty.name, desc: __.cmd.claim_bounty.desc,
            callback: (ctx) => {
                if (!ctx.sender.MapPos) return;
                if (!this.#common.areas.Claim.covers(ctx.sender.MapPos)) return ctx.reply(__.cmd.claim_bounty.err.not_in_zone);

                const players = (this._conn.chatRoom?.characters ?? []).filter(p => p.MapPos);
                const target = players.find(c =>
                    c.MemberNumber !== ctx.sender.MemberNumber &&
                    this.#core.getBounty(c.MemberNumber) &&
                    this.#common.areas.BountyTarget.covers(c.MapPos)
                );
                if (!target) return ctx.reply(__.cmd.claim_bounty.err.no_targets);

                const bounty = this.#core.getBounty(target.MemberNumber);
                if (!bounty) return ctx.reply(__.cmd.claim_bounty.err.no_bounty);

                const cells = this.#prison.cells.free.filter(tile =>
                    !players.some(({ MapPos: { X, Y } }) => tile.X === X && tile.Y === Y )
                );
                if (!cells.length) return ctx.reply(__.cmd.claim_bounty.err.prison_full);

                const targetMeta = parseApiCharObj(target);
                const prisoner = this.#prison.admit({
                    bounty,
                    botName: this._conn.Player.Name,
                    targetName: targetMeta.name,
                    target,
                    cell: pickRandom(cells),
                });
                if (typeof prisoner === "string")
                    return ctx.reply(__.cmd.claim_bounty.err.admit_failed(prisoner));

                const claimer = this.#core.claimBounty(ctx.sender.MemberNumber, bounty);
                if (!claimer) return ctx.reply(__.cmd.claim_bounty.err.internal_error);
                ctx.reply(__.cmd.claim_bounty.collected(bounty.gold, claimer.gold));
                this._conn.SendMessage(
                    "Whisper",
                    __.cmd.claim_bounty.been_collected(this.#util.time.formatSecs(prisoner.end.duration)),
                    target.MemberNumber
                );

                this._conn.SendMessage(
                    "Chat",
                    __.cmd.claim_bounty.announce(parseApiCharObj(ctx.sender).name, targetMeta.name),
                );
            },
        });

        // !clearbounty (id)
        this._cmd.register({
            name: __.cmd.clear_bounty.name, desc: __.cmd.clear_bounty.desc,
            callback: (ctx) => {
                if (!ctx.sender.MapPos) return;
                if (!this.#common.areas.Shop.covers(ctx.sender.MapPos)) return ctx.reply(__.cmd.clear_bounty.err.not_in_area);

                const [strId] = ctx.cmd.args;
                if (!strId || !isValidNumber(strId)) return ctx.reply(__.cmd.clear_bounty.err.invalid_id(ctx));

                const id = parseInt(strId);
                const bounty = this.#core.getBounty(id);
                if (!bounty) return ctx.reply(__.cmd.clear_bounty.err.no_bounty(id));

                const player = this.#core.requirePlayer(ctx.sender.MemberNumber);
                const infoPrefix = __.cmd.clear_bounty.info_prefix(id, bounty.gold, bounty.clearCost);
                if (player.gold < bounty.clearCost)
                    return ctx.reply(__.cmd.clear_bounty.err.not_enough_gold(infoPrefix, player.gold));
                
                const originalInfo = { player, bounty };
                ctx.reply(__.cmd.clear_bounty.prompt(infoPrefix, player.gold));
                this.#pending.confirm.queue(ctx.sender.MemberNumber, (ctx) => {
                    const bounty = this.#core.getBounty(id);
                    const player = this.#core.requirePlayer(ctx.sender.MemberNumber);
                    if (player.gold !== originalInfo.player.gold || !bounty || bounty.gold !== originalInfo.bounty.gold)
                        return ctx.reply(__.cmd.clear_bounty.err.mismatch(id));

                    const result = this.#core.clearBounty(player, bounty);
                    if (typeof result === "string")
                        return ctx.reply(__.cmd.clear_bounty.err.failed(result));
                    ctx.reply(__.cmd.clear_bounty.cleared(id, bounty.clearCost, result.gold));

                    this._conn.SendMessage("Whisper", __.cmd.clear_bounty.been_cleared, id);
                });
            },
        });

        // !placebounty (id) (gold)
        this._cmd.register({
            name: __.cmd.place_bounty.name, desc: __.cmd.place_bounty.desc,
            callback: (ctx) => {
                if (!ctx.sender.MapPos) return;
                if (!this.#common.areas.Shop.covers(ctx.sender.MapPos)) return ctx.reply(__.cmd.place_bounty.err.not_in_area);

                const [strId, strBountyGold] = ctx.cmd.args;
                if (!strId || !isValidNumber(strId)) return ctx.reply(__.cmd.place_bounty.err.invalid_id(ctx));
                if (!strBountyGold || !isValidNumber(strBountyGold)) return ctx.reply(__.cmd.place_bounty.err.invalid_gold(ctx));

                const id = parseInt(strId);
                const bountyGold = parseInt(strBountyGold);
                const canHaveBounty = this.#core.canHaveBounty(id);
                if (!canHaveBounty) return ctx.reply(__.cmd.place_bounty.err.bounty_immunity(ctx, id, canHaveBounty.reason));
                if (bountyGold < 20) return ctx.reply(__.cmd.place_bounty.err.need_min_gold(ctx))

                const player = this.#core.requirePlayer(ctx.sender.MemberNumber);
                if (player.gold < bountyGold) return ctx.reply(__.cmd.place_bounty.err.not_enough_gold(player.gold));

                const result = this.#core.placeBounty(player, id, bountyGold);
                if (typeof result === "string")
                    return ctx.reply(__.cmd.place_bounty.err.failed(result));
                ctx.reply(__.cmd.place_bounty.placed(bountyGold, id, result.gold));

                this._conn.SendMessage("Chat", __.cmd.place_bounty.announce(bountyGold, id));
            }
        });
        //#endregion
    }
    //#endregion
}