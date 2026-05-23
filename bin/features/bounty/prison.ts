import { API_Character, API_Connector, AssetGet } from "bc-bot";
import { as, ensure, pickRandom, ret, str, time } from "../../utils";

import __ from "./strings";
import { Common, Shared, Util } from "./_shared";
import Core from "./core";
import Pending from "./pending";

//#region vendored
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

type Prison = ReturnType<typeof Prison.create>;

/** @desc ~ module containing prison functionality */
namespace Prison {

    //#region types
    namespace Restraint {
        export type Item = {
            Group: AssetGroupName, Name: string, Color: ItemColor,
            TypeRecord: ItemProperties["TypeRecord"] | null,
            ExtraProp: Partial<ItemProperties> | null,
            Lock: AssetLockType | null,
        };

        export type Set = {
            name: string,
            createDesc: (vars: { name: string }) => string,
            items: Item[],
        };
    }

    type Cell = ChatRoomMapPos;
    namespace Prisoner {
        export type Stub = {
            id: number,
            cell: Cell,
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
    }
    export type Prisoner = Prisoner.Stub;
    //#endregion

    //#region store
    type Store = ReturnType<typeof Store.create>;
    namespace Store {
        type Config = Shared.Config & { util: Util };
        export const create = ({ namespace, util }: Config) => {
            const store = {
                handle: util.db.createKeyedCollection<Prisoner.Stub>(namespace, "prisoners"),
                prisoners: {
                    hydrate: (stub: Prisoner.Stub) => {
                        const { id, cell, end, flags } = stub;
                        return Object.freeze<Prisoner>({
                            id,
                            cell: { ...cell },
                            end: { ...end },
                            flags: { ...flags },
                        });
                    },
                    get: (id: number) => {
                        let stub = store.handle.get(id.toString());
                        if (!stub) return null;
                        return store.prisoners.hydrate(stub);
                    },
                },
                flags: {
                    default: ensure<Prisoner["flags"]>({
                        prompted: false,
                        releasing: false,
                    }),
                    update: (id: number, flag: keyof Prisoner["flags"], value: boolean) => {
                        store.handle.update(id.toString(), () => ({
                            flags: {
                                [flag]: value,
                            },
                        }));
                    },
                    add: (id: number, flag: keyof Prisoner["flags"]) => store.flags.update(id, flag, true),
                    remove: (id: number, flag: keyof Prisoner["flags"]) => store.flags.update(id, flag, false),
                },
            };
            return store;
        };
    }
    //#endregion

    //#region dresser
    type Dresser = ReturnType<typeof Dresser.create>;
    namespace Dresser {
        const strip = (target: API_Character) => {
            target.Appearance.getAppearanceData()
            .filter(a => {
                if (!BC.Strip.Groups.has(a.Group)) return false;
                if (BC.Strip.Groups.WithCosplay.has(a.Group) && BC.Strip.Groups.WithCosplay.Assets.has(a.Name)) return false;
                return true;
            })
            .map(a => a.Group)
            .forEach(group => {
                Shared.log(["Prison", "strip"], group);
                target.Appearance.RemoveItem(group);
            });
        };

        export type RestrainOptions = {
            target: API_Character,
            names: {
                bot: string,
                target: string,
            },
        };

        type Config = { restraints: Restraint.Set };
        export const create = ({ restraints }: Config) => ({
            strip,
            restrain: ({ target, names }: RestrainOptions) => {
                const targetItems = new Set(target.Appearance.getAppearanceData().map(i => i.Group));
                restraints.items.forEach(r => {
                    if (targetItems.has(r.Group)) return;
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
                        Description: restraints.createDesc({ name: names.target }),
                        Color: Array.isArray(r.Color) ? r.Color.join(",") : r.Color,
                        Private: false,
                        Effects: {},
                        Item: r.Name,
                        ItemProperty: asset.Property,
                        TypeRecord: r.TypeRecord ?? {},
                        Lock: r.Lock ?? "",
                        MemberNumber: -1,
                        MemberName: names.bot,
                    };
                    target.Appearance.AddItem(asset);
                });
            },
            unrestrain: (target: API_Character) => {
                target.Appearance.getAppearanceData()
                    .filter(a => {
                        if (!a.Craft) return false;
                        if (a.Craft.Name !== restraints.name) return false;
                        return true;
                    })
                    .map(a => a.Group)
                    .forEach(group => {
                        Shared.log(["Prison", "unrestrain"], group);
                        target.Appearance.RemoveItem(group);
                    });
            },
        });
    }
    //#endregion

    namespace Sentence {

        //#region timer
        type Timer = ReturnType<typeof Timer.create>;
        namespace Timer {
            export const create = (at: number, action: () => void) => {
                let end = at;
                const makeTimeout = () =>
                    setTimeout(
                        () => action(),
                        (end - time.unix()) * 1000,
                    );

                let handle = makeTimeout();
                return {
                    get at() { return end },
                    cancel() { clearTimeout(handle) },
                    extend(duration: number) {
                        at += duration;
                        clearTimeout(handle);
                        handle = makeTimeout();
                    },
                };
            };
        }
        //#endregion

        namespace Term {
            export const Calculators = <Record<Core.Bounty.Kind, (reason: Core.Bounty.Reason) => number>>{
                "Room Hop": () => 10 * 60, // 10m
                "Wall Walk": () => 0, // unused
                "Placed": ({ gold }) => {
                    let calculatedTime = 10 * 60; // baseline 10min
                    calculatedTime += (Math.max(20, gold) - 20) * 30; // 30s for each subsequent gold
                    return Math.min(60 * 60, calculatedTime) // max 1h
                },
            };
        }

        //#region sentence
        type Manager = ReturnType<typeof Manager.create>;
        export namespace Manager {

            export namespace Externs {
                export type Delegates = {
                    checkTerm: (prisonerId: number) => void,
                };
            }
            export type Externs = {
                store: Store,
                delegates: Externs.Delegates,
            };

            export const create = () => {
                const x = as<Externs>({});
                const timers = Object.assign(<Record<number, Timer>>{}, {
                    has: (id: number) => id in timers,
                    start: (id: number) => {
                        const prisoner = x.store.handle.get(id.toString());
                        if (!prisoner || timers.has(id) || time.unix() > prisoner.end.at) return;
                        timers[prisoner.id] = Timer.create(prisoner.end.at, () => {
                            Shared.log(["Prison.Sentence.Timer"], "[OnPrisonerTimerEnd]", `trigger(CheckPrisonTerm<${prisoner.id}>)`);
                            x.delegates.checkTerm(prisoner.id);
                            delete timers[prisoner.id];
                        });
                    },
                    extend: (id: number, duration: number) => {
                        if (!timers.has(id)) return false;
                        return ret.and(true, () => timers[id].extend(duration));
                    },
                    cancel: (id: number) => {
                        if (!timers.has(id)) return;
                        timers[id].cancel();
                        delete timers[id];
                    },
                    reset: () => Object.keys(timers).map(Number).forEach(id => timers.cancel(id)),
                });

                const manager = {
                    init: (externs: Externs) => {
                        Object.assign(x, externs);
                        manager.sync();
                    },
                    timers: {
                        start: timers.start,
                        cancel: timers.cancel,
                        reset: timers.reset,
                    },
                    extend: (id: number, duration: number) => {
                        if (!timers.extend(id, duration)) return;
                        x.store.handle.update(id.toString(), (prev) => ({
                            flags: { ...x.store.flags.default },
                            end: {
                                duration: prev.end.duration + duration,
                                at: prev.end.at + duration,
                            },
                        }));
                    },
                    admit: (cell: Cell, bounty: Readonly<Core.Bounty>) => {
                        let sentenceTime = 0; // in seconds
                        bounty.reasons.forEach(r => {
                            sentenceTime += Term.Calculators[r.kind](r);
                        });
                        return ret.and(
                            x.store.handle.set(bounty.id.toString(), {
                                id: bounty.id,
                                cell,
                                end: {
                                    duration: sentenceTime,
                                    at: time.unix() + sentenceTime,
                                },
                                flags: { ...x.store.flags.default },
                            }), () => {
                                timers.start(bounty.id);
                            },
                        );
                    },
                    end: (id: number) => {
                        const prisoner = x.store.prisoners.get(id);
                        if (!prisoner) return false;
                        x.store.handle.delete(prisoner.id.toString());
                        timers.cancel(prisoner.id);
                        return true;
                    },
                    sync: () => x.store.handle.values.forEach(p => timers.start(p.id)),
                };

                return manager;
            };
        }
        //#endregion
    }

    //#region internals
    type Internals = ReturnType<typeof Internals.create>;
    namespace Internals {
        export namespace Config {
            export type Additions = {
                restraints: Restraint.Set,
            };
        }
        export type Config = Shared.Config & Config.Additions & {
            util: Util,
            common: Common,
        };

        export const create = ({ namespace, util, common, ...conf }: Config) => {
            const restraints = Object.freeze(conf.restraints);
            const dresser = Dresser.create({ restraints });
            const store = Store.create({ namespace, util });
            const sentences = Sentence.Manager.create();

            const strCell = (cell: Cell) => `X${cell.X}Y${cell.Y}`;
            return {
                init: (delegates: Sentence.Manager.Externs.Delegates) => sentences.init({ store, delegates }),
                cells: {
                    get free() {
                        const occupied = new Set(store.handle.values.map(p => strCell(p.cell)));
                        return common.areas.Prison.filter(c => !occupied.has(strCell(c)));
                    },
                },
                prisoners: {
                    has: (id: number) => store.handle.has(str(id)),
                    get: store.prisoners.get,
                    flag: store.flags.add,
                    unflag: store.flags.remove,
                },
                sentences: {
                    extend: sentences.extend,
                    timers: {
                        start: sentences.timers.start,
                        stop: sentences.timers.reset,
                    },
                },
                admit(
                    { bounty, cell, target, names }: {
                        bounty: Readonly<Core.Bounty>,
                        cell: ChatRoomMapPos
                    } & Dresser.RestrainOptions
                ) {
                    if (!target.AllowItem)
                        return __.prison.err.no_add_restraint_permission;
                    if (store.handle.get(bounty.id.toString()))
                        return __.prison.err.already_a_prisoner;
                    target.mapTeleport(cell);
                    dresser.strip(target);
                    dresser.restrain({ target, names });
                    return sentences.admit(cell, bounty);
                },
                release(target: API_Character) {
                    if (!sentences.end(target.MemberNumber)) return false;
                    target.mapTeleport(pickRandom(common.areas.Lobby.tiles));
                    if (!target.AllowItem)
                        target.connection.SendMessage(
                            "Whisper",
                            __.prison.warn.no_remove_restraint_permission,
                            target.MemberNumber,
                        );
                    else
                        dresser.unrestrain(target);
                    return true;
                },
            };
        };
    }
    //#endregion

    //#region api
    namespace API {
        export namespace Externs {
            export type Delegates = {
                checkTerm: (prisonerId: number) => void,
            };
        }
        export type Externs = {
            conn: API_Connector,
            pending: Pending,
        };

        export const create = (prison: Internals) => {
            const x = as<Externs>({});
            const api = {
                init: (externs: Externs) => Object.assign(x, externs),
                /** @desc ~ prompts release/extend to prisoner, assumes player passed in exists */
                promptRelease: ({ MemberNumber }: API_Character, prisoner: Prisoner) => {
                    x.conn.SendMessage("Whisper", __.events.prison.release.prompt, MemberNumber);
                    prison.prisoners.flag(prisoner.id, "prompted");
                    x.pending.response.queue(MemberNumber, (ctx, expired: boolean = false) => {
                        const player = x.conn.chatRoom?.getCharacter(MemberNumber) ?? null;
                        let release = expired;
                        if (ctx) {
                            const [res] = ctx.cmd.args;
                            if (!res || !res.length || (res[0] !== "n" && res[0] !== "y"))
                                return player && x.conn.SendMessage(
                                    "Whisper",
                                    __.events.prison.release.unknown_response,
                                    MemberNumber,
                                );
                            release = res[0] === 'n';
                        }
                        if (!release) {
                            if (player) x.conn.SendMessage(
                                "Whisper",
                                __.events.prison.release.extended,
                                MemberNumber,
                            );
                            return prison.sentences.extend(prisoner.id, 10 * 60);
                        }
                        prison.prisoners.flag(prisoner.id, "releasing");
                        Shared.log(["Prison.API", "promptRelease/response"], "[OnPromptResponseRelease]", `trigger(CheckPrisonTerm<${prisoner.id}>)`);
                        api.checkTerm(prisoner.id);
                    }, (run) => run(null as never, true));
            
                },
                /** @desc ~ releases prisoner, assumes player passed in exists */
                release: (player: API_Character) => {
                    if (!prison.release(player)) return;
                    x.conn.SendMessage("Whisper", __.events.prison.release.completed, player.MemberNumber);
                },
                /** @desc ~ a sanity check for prisoner state, if not in assigned cell, just sync state, forcing an assumed release */
                syncRelease: (player: API_Character, prisoner: Prisoner) => {
                    if (!player.MapPos) return false;
                    if (player.MapPos.X === prisoner.cell.X && player.MapPos.Y === prisoner.cell.Y) return false;
                    api.release(player);
                    return true;
                },
                /** @desc ~ runs through the whole check prisoner, check player exists flow */
                checkTerm: (id: number): void => {
                    const prisoner = prison.prisoners.get(id);
                    if (!prisoner) return;
                    const player = x.conn.chatRoom?.getCharacter(prisoner.id) ?? null;
                    if (!player) return;
                    if (api.syncRelease(player, prisoner)) return;
                    if (time.unix() < prisoner.end.at) return prison.sentences.timers.start(prisoner.id);
                    if (!prisoner.flags.prompted) return api.promptRelease(player, prisoner);
                    if (prisoner.flags.releasing) return api.release(player);
                },
            };
            return api;
        };
    }
    //#endregion

    export namespace Config {
        export type Additions = Internals.Config.Additions;
    }
    export type Config = Internals.Config;
    export const create = (conf: Config) => {
        const internals = Internals.create(conf);
        return Object.assign(internals, {
            api: API.create(internals),
        });
    };
}

export default Prison;