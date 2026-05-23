//@ts-ignore
import { API_Character } from "bc-bot";
import { GenericMapRoomOptions, MapRoom, MapRoomArguments } from "./map-room";
import { time, isValidNumber, parseApiCharObj, pickRandom } from "../utils";
import { WithCommands } from "../mixins";

import _shared from "../features/_shared";
import B, { __ } from "../features/bounty";

export type BountyRoomOptions = GenericMapRoomOptions<{
    bounty: {
        namespace: string,
        common: B.Common.Config,
        roles: B.Roles.Config.Additions,
        core: B.Core.Config.Additions,
        prison: B.Prison.Config.Additions,
    },
}>;

const MixedMapRoomClass = WithCommands(MapRoom);

export class BountyRoom extends MixedMapRoomClass {
    #util: B.Util;
    #roles: B.Roles;
    #common: B.Common;
    #pending: B.Pending;
    #prison: B.Prison;
    #shop: B.Shop;
    #core: B.Core;
    #stayTime: B.StayTime;

    constructor(arg: MapRoomArguments<BountyRoomOptions>) {
        //#region pre-init
        const opts = arg.opts.bounty;
        let conf: B.Shared.Config = { namespace: opts.namespace };

        const util = B.Util.create();
        const roles = B.Roles.create({ ...conf, ...opts.roles, util });
        //#endregion

        //#region init
        super({
            ...arg, mixins: {
                ...(arg.mixins ?? {}), "cmd-handler": {
                    ...(arg.mixins?.["cmd-handler"] ?? {}),
                    texts: {
                        help: {
                            getHelpText: _shared.cmd.help.createTextFormatter({
                                texts: {
                                    help_title: __.cmd.help.title,
                                    public_role_name: __.cmd.help.public_role_name,
                                },
                                templates: {
                                    cmd_to_text: (prefix, name, desc) => __.cmd.help.cmd_to_text(prefix, name, desc),
                                    role_title: __.cmd.help.role_commands_title,
                                },
                            }),
                        },
                    },
                    roles: roles.mapping,
                },
            },
        });

        this.#util = util;
        this.#roles = roles;
        this.#common = B.Common.create(opts.common);
        this.#pending = B.Pending.create();
        this.#prison = B.Prison.create({
            ...conf, ...opts.prison,
            util: this.#util,
            common: this.#common,
        });
        this.#shop = B.Shop.create({
            ...conf,
            util: this.#util,
        });
        this.#core = B.Core.create({
            ...conf, ...opts.core,
            util: this.#util,
            roles: this.#roles,
            prison: this.#prison,
        });
        this.#stayTime = B.StayTime.create({
            conn: this._conn,
            core: this.#core,
        });

        this.#setupEvents();
        this.#setupCommands();
        //#endregion

        //#region post-init
        this.#prison.init({
            checkTerm: this.#prison.api.checkTerm,
        });
        this.#prison.api.init({
            conn: this._conn,
            pending: this.#pending,
        });
        //#endregion
    }

    public override init = async () => {
        await super.init();
        this.#onBotRoomConnect();
    }

    public override exit = async () => {
        this.#util.db.flush();
        this.#pending.purge();
        this.#prison.sentences.timers.stop();
        await super.exit();
    };

    //#region events
    #setupEvents = () => {
        this._conn.on("CharacterEntered", this.#onCharEnter);
        this._conn.on("CharacterLeft", this.#onCharLeft);
        this._conn.on("CharacterMapUpdate", this.#onCharMapUpdate);
        this._conn.on("RoomJoin", this.#onBotRoomConnect);
        this._conn.on("RoomCreate", this.#onBotRoomConnect);
    }

    /** @desc ~ in-memory set of joined players pending their map location information */
    #pendingJoins = new Set<number>();

    /** @desc ~ event for when the bot enters the room (first connect/subsequent reconnects) */
    #onBotRoomConnect = () => {
        console.info("FUNC(#onBotRoomConnect):", `#pendingJoins(clear)`);
        this.#pendingJoins.clear();

        this.#stayTime.reset();

        for (const player of (this._conn.chatRoom?.characters ?? [])) {
            console.info("FUNC(#onCharUpdateRoom):", "[OnBotEnter]", `trigger(CheckPrisonTerm<${player.MemberNumber}>)`);
            this.#prison.api.checkTerm(player.MemberNumber);
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
        this.#stayTime.begin(char);

        console.info("FUNC(#onCharEnterMap):", "[OnCharEnter]", `trigger(CheckPrisonTerm<${char.MemberNumber}>)`);
        this.#prison.api.checkTerm(char.MemberNumber);
    }

    #onCharLeft = (...[, char, , intentional]: Parameters<Parameters<typeof this._conn.on<"CharacterLeft">>[1]>) => {
        this.#stayTime.end(char, intentional);

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
                const canHaveBounty = this.#core.players.canHaveBounty(id);
                if (!canHaveBounty.ok) return ctx.reply(__.cmd.put_bounty.err.bounty_immunity(ctx, id, canHaveBounty.err));
                if (bountyGold < 20) return ctx.reply(__.cmd.put_bounty.err.need_min_gold(ctx));

                const result = this.#core.bounties.place(ctx.sender.MemberNumber, id);
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

                const result = this.#core.players.gold.give(id, gold);
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

                const result = this.#core.players.gold.give(id, -gold);
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

        // !listadmin
        this._cmd.register({
            name: __.cmd.list_admin.name, desc: __.cmd.list_admin.desc,
            roles: [this.#roles.SuperAdmin],
            callback: (ctx) => {
                const list = this.#roles.lists.admin.get();
                ctx.reply(
                    __.cmd.list_admin.title(list.length),
                    ...list.map(id =>
                        __.cmd.list_admin.entry(id),
                    ),
                );
            },
        }),
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

        // !listimmune
        this._cmd.register({
            name: __.cmd.list_immune.name, desc: __.cmd.list_immune.desc,
            roles: [this.#roles.Admin],
            callback: (ctx) => {
                const list = this.#roles.lists.immunity.get();
                ctx.reply(
                    __.cmd.list_immune.title(list.length),
                    ...list.map(id =>
                        __.cmd.list_immune.entry(id),
                    ),
                );
            },
        }),
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

        // !listdom
        this._cmd.register({
            name: __.cmd.list_dom.name, desc: __.cmd.list_dom.desc,
            roles: [this.#roles.Admin],
            callback: (ctx) => {
                const list = this.#roles.lists.dom.get();
                ctx.reply(
                    __.cmd.list_dom.title(list.length),
                    ...list.map(id =>
                        __.cmd.list_dom.entry(id),
                    ),
                );
            },
        }),
        //#endregion

        //#region favors mgmt
        // !addfavor (price) (name)
        this._cmd.register({
            name: __.cmd.add_favor.name, desc: __.cmd.add_favor.desc,
            roles: [this.#roles.Admin],
            callback: (ctx) => {
                const [strPrice, ...strRest] = ctx.cmd.args;
                if (!strPrice || !isValidNumber(strPrice)) return ctx.reply(__.cmd.add_favor.err.invalid_price(ctx));
                if (!strRest.length) return ctx.reply(__.cmd.add_favor.err.invalid_name(ctx));

                const favorName = strRest.join(" ");
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
                if (!removed.ok) return ctx.reply(__.cmd.remove_favor.err.failed(removed.err));
                const favor = removed.value;
                ctx.reply(__.cmd.remove_favor.removed(favor.name, favor.cost));
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

                const favors = this.#core.players.favors.getOwed();
                if (index < 1 || index > favors.length) return ctx.reply(__.cmd.remove_owed.err.index_out_of_range(ctx));

                const { forId, forIndex, name } = favors[index - 1];
                this.#core.players.favors.resolve(forId, forIndex);
                ctx.reply(__.cmd.remove_owed.resolved(name, forId));
            },
        });

        // !displayOwed
        this._cmd.register({
            name: __.cmd.display_owed.name, desc: __.cmd.display_owed.desc,
            roles: [this.#roles.Admin],
            callback: (ctx) => {
                const favors = this.#core.players.favors.getOwed();
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
                const prisoner = this.#prison.prisoners.get(id);
                if (!prisoner) return ctx.reply(__.cmd.release.err.not_prisoner(id));
                const target = this._conn.chatRoom?.getCharacter(prisoner.id) ?? null;
                if (!target) return ctx.reply(__.cmd.release.err.not_present(id));
                this.#prison.release(target);
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
                const player = this.#core.players.require(ctx.sender.MemberNumber);
                ctx.reply(__.cmd.gold.stat(player.gold, player.rank.level, player.rank.name));
            },
        });

        // !favors
        this._cmd.register({
            name: __.cmd.favors.name, desc: __.cmd.favors.desc,
            callback: (ctx) => {
                const favors = this.#core.players.favors.getOwed(ctx.sender.MemberNumber);
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
                const player = this.#core.players.require(ctx.sender.MemberNumber);
                if (player.rank.level >= this.#core.players.ranks.length - 1)
                    return ctx.reply(__.cmd.rankup.at_max_rank(player.rank.name));

                const nextRank = this.#core.players.ranks[player.rank.level + 1];
                ctx.reply(__.cmd.rankup.info(
                    player.rank.name, player.rank.level,
                    this.#core.players.ranks.length - 1,
                    nextRank.name, nextRank.cost,
                    player.gold
                ));
            }
        });

        // !purchaserankup
        this._cmd.register({
            name: __.cmd.purchase_rankup.name, desc: __.cmd.purchase_rankup.desc,
            callback: (ctx) => {
                const player = this.#core.players.require(ctx.sender.MemberNumber);
                if (player.rank.level >= this.#core.players.ranks.length - 1)
                    return ctx.reply(__.cmd.purchase_rankup.at_max_rank);

                const nextRank = this.#core.players.ranks[player.rank.level + 1];
                if (player.gold < nextRank.cost)
                    return ctx.reply(__.cmd.purchase_rankup.err.not_enough_gold(nextRank.name, nextRank.cost, player.gold));

                const originalInfo = { player };
                ctx.reply(__.cmd.purchase_rankup.prompt(nextRank.name, nextRank.cost, player.gold));
                this.#pending.confirm.queue(ctx.sender.MemberNumber, (ctx) => {
                    const player = this.#core.players.require(ctx.sender.MemberNumber);
                    if (player.gold !== originalInfo.player.gold)
                        return ctx.reply(__.cmd.purchase_rankup.err.mismatch);

                    const result = this.#core.players.ranks.promote(player, nextRank);
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
                const purchased = this.#core.players.favors.purchase(ctx.sender.MemberNumber, favor);
                if (!purchased.ok) return ctx.reply(__.cmd.buy.err.failed(purchased.err));
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
                const bounty = this.#core.bounties.get(id);
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
                    this.#core.bounties.get(c.MemberNumber) &&
                    this.#common.areas.BountyTarget.covers(c.MapPos)
                );
                if (!target) return ctx.reply(__.cmd.claim_bounty.err.no_targets);

                const bounty = this.#core.bounties.get(target.MemberNumber);
                if (!bounty) return ctx.reply(__.cmd.claim_bounty.err.no_bounty);

                const cells = this.#prison.cells.free.filter(tile =>
                    !players.some(({ MapPos: { X, Y } }) => tile.X === X && tile.Y === Y )
                );
                if (!cells.length) return ctx.reply(__.cmd.claim_bounty.err.prison_full);

                const targetMeta = parseApiCharObj(target);
                const prisoner = this.#prison.admit({
                    bounty,
                    cell: pickRandom(cells),
                    target,
                    names: {
                        bot: this._conn.Player.Name,
                        target: targetMeta.name,
                    },
                });
                if (typeof prisoner === "string")
                    return ctx.reply(__.cmd.claim_bounty.err.admit_failed(prisoner));

                const claimer = this.#core.bounties.claim(ctx.sender.MemberNumber, bounty);
                if (!claimer) return ctx.reply(__.cmd.claim_bounty.err.internal_error);
                ctx.reply(__.cmd.claim_bounty.collected(bounty.gold, claimer.gold));
                this._conn.SendMessage(
                    "Whisper",
                    __.cmd.claim_bounty.been_collected(time.formatSecs(prisoner.end.duration)),
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
                const bounty = this.#core.bounties.get(id);
                if (!bounty) return ctx.reply(__.cmd.clear_bounty.err.no_bounty(id));

                const player = this.#core.players.require(ctx.sender.MemberNumber);
                const infoPrefix = __.cmd.clear_bounty.info_prefix(id, bounty.gold, bounty.clearCost);
                if (player.gold < bounty.clearCost)
                    return ctx.reply(__.cmd.clear_bounty.err.not_enough_gold(infoPrefix, player.gold));
                
                const originalInfo = { player, bounty };
                ctx.reply(__.cmd.clear_bounty.prompt(infoPrefix, player.gold));
                this.#pending.confirm.queue(ctx.sender.MemberNumber, (ctx) => {
                    const bounty = this.#core.bounties.get(id);
                    const player = this.#core.players.require(ctx.sender.MemberNumber);
                    if (player.gold !== originalInfo.player.gold || !bounty || bounty.gold !== originalInfo.bounty.gold)
                        return ctx.reply(__.cmd.clear_bounty.err.mismatch(id));

                    const result = this.#core.bounties.clear(player, bounty);
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
                const canHaveBounty = this.#core.players.canHaveBounty(id);
                if (!canHaveBounty.ok) return ctx.reply(__.cmd.place_bounty.err.bounty_immunity(ctx, id, canHaveBounty.err));
                if (bountyGold < 20) return ctx.reply(__.cmd.place_bounty.err.need_min_gold(ctx))

                const player = this.#core.players.require(ctx.sender.MemberNumber);
                if (player.gold < bountyGold) return ctx.reply(__.cmd.place_bounty.err.not_enough_gold(player.gold));

                const result = this.#core.bounties.place(player, id, bountyGold);
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