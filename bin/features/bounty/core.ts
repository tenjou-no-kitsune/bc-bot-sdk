import { ret, time } from "../../utils";

import __ from "./strings";
import { Shared, Util } from "./_shared";
import Prison from "./prison";
import Roles from "./roles";
import Shop from "./shop";

type Core = ReturnType<typeof Core.create>;

/** @desc ~ module containing core functionality (player/bounty) */
namespace Core {

    //#region Player Types
    export namespace Player {
        export type Rank = { level: number, name: string, cost: number };

        export type Stub = {
            id: number, gold: number, rank: number,
            inventory: {
                favors: string[],
            },
        };
    }

    export type Player = { id: number, gold: number, rank: Omit<Player.Rank, "cost"> };
    //#endregion

    //#region Bounty Types
    export namespace Bounty {
        namespace Type {
            export type Placed = { kind: "Placed", srcId: number };
            export type RoomHop = { kind: "Room Hop" };
            export type WallWalk = { kind: "Wall Walk" };
        }
        export type Type = Type.Placed | Type.RoomHop | Type.WallWalk;
        export type Kind = Type["kind"];
        export type Meta = {
            gold: number,
            expiration: {
                at: number,
                duration: number,
            },
        };

        export type Stub = {
            id: number,
            reasons: (Type & Meta)[];
        };

        export type Punishments = Record<
            Exclude<Kind, "Placed">,
            { gold: number, expiration: { duration: number } }
        >;

        export type Reason = (Pick<Meta, "gold"> & Type);
    }

    export type Bounty = {
        id: number,
        gold: number,
        clearCost: number,
        reasons: Bounty.Reason[],
    };
    //#endregion

    export namespace Config {
        export type Additions = {
            ranks: Player.Rank[],
            punishments: Bounty.Punishments,
        };
    }
    export type Config = Shared.Config & Config.Additions & {
        util: Util,
        roles: Roles,
        prison: Prison,
    };

    export const create = ({ namespace, util, roles, prison, ...conf }: Config) => {
        const ranks = conf.ranks;
        const punishments = conf.punishments;

        //#region player store
        const players = {
            store: util.db.createKeyedCollection<Player.Stub>(namespace, "players"),
            hydrate: (stub: Player.Stub) => {
                const { id, gold, rank: rankId } = stub;
                const rank = ranks[rankId];
                return Object.freeze<Player>({
                    id, gold,
                    rank: {
                        level: rank.level,
                        name: rank.name,
                    },
                });
            },
            require: (id: number) => {
                let stub = players.store.get(id.toString());
                if (!stub) {
                    stub = players.store.set(id.toString(), {
                        id, gold: 0, rank: 0,
                        inventory: { favors: [] },
                    });
                }
                return players.hydrate(stub);
            },
            favors: {
                get owed() {
                    return players.store.values
                        .flatMap(
                            player => player.inventory.favors.map(
                                (favor, index) => ({ forId: player.id, forIndex: index, name: favor })
                        ))
                        .map((val, index) => ({ index, ...val }));
                },
            },
        };
        //#endregion

        //#region bounty store
        const bounties = {
            store: util.db.createKeyedCollection<Bounty.Stub>(namespace, "bounties"),
            refreshExpiration: Object.assign(() => {
                const currTime = time.unix();
                if (currTime <= bounties.refreshExpiration.lastRun) return;
                let updated = 0;
                bounties.refreshExpiration.lastRun = currTime;
                bounties.store.keys.forEach(id => {
                    const b = bounties.store.get(id);
                    if (!b) return;
                    const prevLength = b.reasons.length;
                    b.reasons = b.reasons.filter(r => r.expiration.at > currTime);
                    if (prevLength !== b.reasons.length) updated++;
                    if (!b.reasons.length) bounties.store.delete(id, false);
                });
                if (updated) {
                    Shared.log(["Core", "refreshBountyExpiration"], `${updated} bounty entries updated`);
                    bounties.store.queueUpdate();
                }
            }, { lastRun: 0 }),
            hydrate: (stub: Bounty.Stub) => {
                let { id, reasons } = stub;
                const gold = reasons.reduce((acc, r) => acc + r.gold, 0);
                return Object.freeze<Bounty>({
                    id,
                    gold,
                    clearCost: Math.ceil(gold * 1.5),
                    reasons: reasons.map(({ expiration: _x, ...rest }) => rest),
                });
            },
            require: (id: number) => {
                bounties.refreshExpiration();
                let stub = bounties.store.get(id.toString());
                if (!stub) {
                    stub = bounties.store.set(id.toString(), {
                        id, reasons: [],
                    });
                }
                return bounties.hydrate(stub);
            },
            get: (id: number) => {
                bounties.refreshExpiration();
                let stub = bounties.store.get(id.toString());
                if (!stub) return null;
                return bounties.hydrate(stub);
            },
        };
        //#endregion

        return {
            //#region player ops
            players: {
                require: players.require,
                canHaveBounty: (id: number) => {
                    if (prison.prisoners.has(id)) return ret.err(__.core.err.is_imprisoned);
                    if (roles.lists.immunity.has(id)) return ret.err(__.core.err.is_immune);
                    return ret.ok();
                },
                gold: {
                    give: (player: number | Player, gold: number) => {
                        if (typeof player === "number") player = players.require(player);
                        return players.store.update(player.id.toString(), (prev) => ({
                            gold: prev.gold + gold,
                        }));
                    },
                },
                ranks: Object.assign(ranks, {
                    promote: (player: number | Player, newRank: Player.Rank) => {
                        if (typeof player === "number") player = players.require(player);
                        if (player.gold < newRank.cost) return __.core.err.not_enough_gold;
                        return players.store.update(player.id.toString(), (prev) => ({
                            gold: prev.gold - newRank.cost,
                            rank: newRank.level,
                        }));
                    },
                }),
                //#region favor ops
                favors: {
                    purchase: (player: number | Player, favor: Shop.Favor) => {
                        if (typeof player === "number") player = players.require(player);
                        if (player.gold < favor.cost) return ret.err(__.core.err.not_enough_gold);
                        return ret.ok(players.store.update(player.id.toString(), (prev) => ({
                            gold: prev.gold - favor.cost,
                            inventory: {
                                favors: [
                                    ...prev.inventory.favors,
                                    favor.name,
                                ],
                            },
                        })));
                    },
                    getOwed: (player: number | Player | null = null) =>  {
                        const owed = players.favors.owed;
                        if (!player) return owed;
                        if (typeof player === "number") player = players.require(player);
                        return owed.filter(f => f.forId === player.id);
                    },
                    resolve: (player: number | Player, index: number) => {
                        if (typeof player === "number") player = players.require(player);
                        return players.store.update(player.id.toString(), (prev) => ({
                            inventory: {
                                favors: prev.inventory.favors.filter((_val, idx) => idx !== index),
                            },
                        }));
                    },
                },
                //#endregion
            },
            //#endregion

            //#region bounty ops
            bounties: {
                get: bounties.get,
                require: bounties.require,
                claim: (claimer: number | Player, bounty: number | Bounty | null) => {
                    if (typeof claimer === "number") claimer = players.require(claimer);
                    if (typeof bounty === "number") bounty = bounties.get(bounty);
                    if (!bounty) return null;
    
                    const player = players.store.update(claimer.id.toString(), (prev) => ({
                        gold: prev.gold + bounty.gold
                    }));
                    bounties.store.delete(bounty.id.toString());
                    return player;
                },
                clear: (clearer: number | Player, bounty: number | Bounty | null) => {
                    if (typeof clearer === "number") clearer = players.require(clearer);
                    if (typeof bounty === "number") bounty = bounties.get(bounty);
                    if (!bounty) return __.core.err.bounty_not_found;
                    if (clearer.gold < bounty.clearCost) return __.core.err.not_enough_gold;
    
                    const player = players.store.update(clearer.id.toString(), (prev) => ({
                        gold: prev.gold - bounty.clearCost
                    }));
                    bounties.store.delete(bounty.id.toString());
                    return player;
                },
                place: (placer: number | Player, targetId: number, gold: number = 0) => {
                    if (typeof placer === "number") placer = players.require(placer);
                    const bounty = bounties.require(targetId);
    
                    if (placer.gold < gold) return __.core.err.not_enough_gold;
                    const player = players.store.update(placer.id.toString(), (prev) => ({
                        gold: prev.gold - gold,
                    }));
                    bounties.store.update(bounty.id.toString(), (prev) => ({
                        reasons: [
                            ...prev.reasons,
                            {
                                gold,
                                expiration: {
                                    duration: 60 * 60 * 24 * 7,
                                    at: time.unix() + (60 * 60 * 24 * 7),
                                },
                                kind: "Placed",
                                srcId: placer.id,
                            }
                        ]
                    }));
                    return player;
                },

                //#region punishment
                punishments: Object.assign(punishments, {
                    place: (targetId: number, type: Exclude<Bounty.Type["kind"], "Placed">) => {
                        const bounty = bounties.require(targetId);
                        if (type === "Room Hop" && bounty.reasons.find(r => r.kind === type))
                            return null;
                        const { gold, expiration } = punishments[type];
                        return bounties.hydrate(
                            bounties.store.update(targetId.toString(), (prev) => ({
                                reasons: [
                                    ...prev.reasons,
                                    {
                                        kind: type, gold,
                                        expiration: {
                                            duration: expiration.duration,
                                            at: time.unix() + expiration.duration,
                                        },
                                    }
                                ]
                            }))
                        );
                    },
                }),
                //#endregion
            },
            //#endregion
        };
    };
}

export default Core;