import { CommandContext } from "../../mixins";
import { as } from "../../utils";

//#region base format
namespace Fmt {
    export type Joined<
        Parts extends readonly string[],
        Separator extends string = " ",
        Prefix extends string = "",
        Suffix extends string = "",
    > = Parts extends readonly [infer Part, ...infer Remaining extends string[]]
        ? `${Prefix}${Part & string}${Suffix}` extends infer Wrapped
            ? Remaining extends []
                ? Wrapped & string
                : `${Wrapped & string}${Separator}${Joined<Remaining, Separator, Prefix, Suffix>}`
            : never
        : "";

    namespace StrTemplate {
        type Marker<Index extends number> = `__$${Index}__`;
        type Markers =  Readonly<[Marker<0>]>;
        type Arg = string | number;
    
        type Resolve<Templated, Args extends Arg[], Completed extends unknown[] = []> =
            Completed["length"] extends Args["length"]
                ? Templated
                : Templated extends `${infer Prefix}${Markers[Completed["length"]]}${infer Suffix}`
                    ? Resolve<`${Prefix}${Args[Completed["length"]]}${Suffix}`, Args, [...Completed, unknown]>
                    : Templated;

        export const strTmpl = <Args extends Arg[], Tmpl extends string>(templater: (...args: Markers) => Tmpl) =>
            <In extends { [K in keyof Args]: Arg } & Arg[]>(...text: In): Resolve<Tmpl, In> =>
                templater(...as<Markers>(text)) as Resolve<Tmpl, In>;
    }
    export const strTmpl = StrTemplate.strTmpl;
}

const fmt = {
    ok: Fmt.strTmpl(txt => `✅ ${txt}`),
    warn: Fmt.strTmpl(txt => `⚠️ ${txt}`),
    err: Fmt.strTmpl(txt => `❌ ${txt}`),
    brkt: Fmt.strTmpl(txt => `❨${txt}❩`),
    params: <StrArr extends string[]>(...params: StrArr) =>
        params.map(p => fmt.brkt(p)).join(' ') as Fmt.Joined<StrArr, " ", "❨", "❩">,
    global: (
        <Str extends string>(text: Str, withSuffix = true) => `(${text}${withSuffix ? ')' : ''}` as const
    ) as {
        <Str extends string>(text: Str): `(${Str})`;
        <Str extends string>(text: Str, suffix: false): `(${Str}`;
    },
};

// sane short utils
/** @desc ~ brackets */
const _b = fmt.brkt;
/** @desc ~ global */
const _g = fmt.global;
/** @desc ~ global prefix */
const _p = Fmt.strTmpl(txt => _g(txt, false));
/** @desc ~ global success */
const _s = Fmt.strTmpl(txt => _g(fmt.ok(txt)));
/** @desc ~ global warn */
const _w = Fmt.strTmpl(txt => _g(fmt.warn(txt)));
/** @desc ~ global error */
const _e = Fmt.strTmpl(txt => _g(fmt.err(txt)));
/** @desc ~ global multiline */
const _m = <StrArr extends string[]>(...txts: StrArr) => _p(txts.join("\n") as Fmt.Joined<StrArr, "\n">);
//#endregion

//#region tmpl
namespace Tmpl {
    namespace Cmd {
        export type Tmpl<
            Name extends string,
            Params extends string,
            Desc extends string,
        > = { name: Name, params: Params, desc: Desc };

        export type ErrTmpl<
            Sig extends string,
            Err extends string
        > = ReturnType<typeof _e<[`Usage: /${Sig} ~ ${Err}`]>>;

        export type ExtendedTmpl<
            Name extends string,
            Params extends string,
            Desc extends string,
            Sig = Params extends "" ? Name : `${Name} ${Params}`,
            NewDesc = Params extends "" ? `— ${Desc}` : `${Params} — ${Desc}`,
        > = {
            name: Name,
            params: Params,
            desc: NewDesc,
            sig: Sig,
            _inval: {
                <Err extends string>(text: Err):
                    (ctx: CommandContext) => ErrTmpl<Sig & string, Err>;
                <Err extends string, Args extends unknown[]>(text: (...args: Args) => Err):
                    (ctx: CommandContext, ...args: Args) => ErrTmpl<Sig & string, Err>;
            },
        };
    }

    export const cmd = <
        N extends string,
        P extends string,
        D extends string,
        Extras extends object,
    >(tmpl: Cmd.Tmpl<N, P, D>, etcMaker: (tmpl: Cmd.ExtendedTmpl<N, P, D>) => Extras) => {
        type ExTmpl = Cmd.ExtendedTmpl<N, P, D>;
        
        const desc = (tmpl.params ? `${tmpl.params} — ${tmpl.desc}` : `— ${tmpl.desc}`) as ExTmpl["desc"];
        const sig = (tmpl.params ? `${tmpl.name} ${tmpl.params}` : tmpl.name) as ExTmpl["sig"];
        const tmpl_err = <Str extends string>(ctx: CommandContext, err: Str) =>
            _e(`Usage: ${ctx.cmd.prefix}${sig} ~ ${err}`);

        type ErrStr<Err extends string> = Cmd.ErrTmpl<ExTmpl["sig"], Err>;
        return {
            ...tmpl, desc, sig,
            ...etcMaker({
                name: tmpl.name, params: tmpl.params, desc, sig,
                _inval: <Err extends string, Args extends unknown[]>(text: ErrStr<Err> | ((...args: Args) => ErrStr<Err>)) => {
                    if (typeof text === "string")
                        return (ctx: CommandContext) => tmpl_err(ctx, text) as ErrStr<Err>;
                    return (ctx: CommandContext, ...args: Args) => tmpl_err(ctx, text(...args)) as ErrStr<Err>;
                },
            }),
        };
    };
}
//#endregion

//#region strings
const strings = Object.freeze({
    // format utils
    fmt,
    // BCB.Roles
    roles: {
        names: {
            super_admin: "Super Admin",
            gold_manager: "Gold Manager",
            bounty_manager: "Bounty Manager",
            admin: "Admin",
            dom: "Dom",
            immune: "Immune",
        },
    },
    // BCB.Prison
    prison: { 
        err: {
            no_add_restraint_permission: "insufficient permissions to imprison target",
            already_a_prisoner: "target is already a prisoner",
        },
        warn: {
            no_remove_restraint_permission: _w("The bot does not have permissions to remove the restraints. You will have to do it yourself."),
        },
    },
    // BCB.Shop
    shop: {
        err: {
            non_existent_index: "non-existent index",
        },
    },
    // BCB.Core
    core: {
        err: {
            is_imprisoned: "is imprisoned",
            is_immune: "is immune",
            bounty_not_found: "no bounty found",
            not_enough_gold: "not enough gold",
        },
    },
    // Events
    events: {
        room_hop: {
            warning: _w("A bounty will be placed on you for room hopping if you don't stay for at least 10s."),
            bounty: (gold: number, id: number) => _w(`A ${gold} gold bounty has been placed on #${id} for room hopping!`),
        },
        prison: {
            release: {
                prompt: _m(
                    "Your imprisonment term has ended. Do you want to extend your term by 10min?",
                    `Please respond with '/bot respond <yes/no>' within 10s, no response will be treated as no.`,
                ),
                unknown_response: _g("Unknown response, please respond with 'yes' or 'no'."),
                extended: _g("Your imprisonment term will be extended by 10min, enjoy!"),
                completed: _g("You have been released from your imprisonment term"),
            },
        },
    },
    // Commands
    cmd: {
        help: {
            title: _p("📋 Bounty System Commands:"),
            public_commands_title: `=== Public Commands`,
            role_commands_title: (role: string) => `=== ${role} Commands` as const,
            cmd_to_text: (pre: string, name: string, desc: string) => `${pre}${name} ${desc}` as const,
        },
        put_bounty: Tmpl.cmd({
            name: "putbounty",
            params: fmt.params("id", "gold"),
            desc: "put a bounty at no cost [at least 20 gold]",
        }, ({ _inval }) => ({
            placed: (gold: number, id: number) => _s(`Placed a ${gold} gold bounty on #${id}`),
            announce: (gold: number, id: number) => _w(`A ${gold} gold bounty has been placed on #${id}`),
            err: {
                invalid_id: _inval("please provide a valid id"),
                invalid_gold: _inval("please provide a valid gold amount"),
                bounty_immunity: _inval((id: number, reason: string) => `#${id} ${reason}` as const),
                need_min_gold: _inval("gold amount must be at least 20"),
                failed: (reason: string) => _w(`Failed to place bounty because ${reason}`),
            },
        })),
        give_gold: Tmpl.cmd({
            name: "givegold",
            params: fmt.params("id", "gold"),
            desc: "prints gold for target player",
        }, ({ _inval }) => ({
            given: (gold: number, id: number, new_gold: number) => _s(`Gave ${gold} gold to #${id}. They now have ${new_gold} gold.`),
            received: (gold: number, new_gold: number) => _g(`💰 You received ${gold} gold! You now have ${new_gold} gold.`),
            err: {
                invalid_id: _inval("please provide a valid id"),
                invalid_gold: _inval("please provide a valid gold amount"),
                neg_or_zero_gold: _inval("gold amount must be positive"),
            },
        })),
        remove_gold: Tmpl.cmd({
            name: "removegold",
            params: fmt.params("id", "gold"),
            desc: "confiscate gold from target player",
        }, ({ _inval }) => ({
            removed: (gold: number, id: number, new_gold: number) => _s(`Removed ${gold} gold from #${id}. They now have ${new_gold} gold.`),
            lost: (gold: number, new_gold: number) => _g(`💰 You have lost ${gold} gold! You now have ${new_gold} gold.`),
            err: {
                invalid_id: _inval("please provide a valid id"),
                invalid_gold: _inval("please provide a valid gold amount"),
                neg_or_zero_gold: _inval("gold amount must be positive"),
            },
        })),
        add_admin: Tmpl.cmd({
            name: "addadmin",
            params: fmt.params("id"),
            desc: "adds member to admin list",
        }, ({ _inval }) => ({
            added: (id: number, new_length: number) => _s(`#${id} added to admin list. The admin count is now ${new_length}`),
            err: {
                invalid_id: _inval("please provide a valid id"),
                already_added: (id: number) => _w(`#${id} is already in the admin list.`),
            },
        })),
        remove_admin: Tmpl.cmd({
            name: "removeadmin",
            params: fmt.params("id"),
            desc: "removes member from admin list",
        }, ({ _inval }) => ({
            removed: (id: number, new_length: number) => _s(`#${id} removed from admin list. The admin count is now ${new_length}`),
            err: {
                invalid_id: _inval("please provide a valid id"),
                not_in_list: (id: number) => _w(`#${id} is not in the admin list.`),
            },
        })),
        add_immune: Tmpl.cmd({
            name: "addimmune",
            params: fmt.params("id"),
            desc: "adds member to immune list",
        }, ({ _inval }) => ({
            added: (id: number, new_length: number) => _s(`#${id} added to immune list. The immune count is now ${new_length}`),
            err: {
                invalid_id: _inval("please provide a valid id"),
                already_added: (id: number) => _w(`#${id} is already in the immune list.`),
            },
        })),
        remove_immune: Tmpl.cmd({
            name: "removeimmune",
            params: fmt.params("id"),
            desc: "removes member from immune list",
        }, ({ _inval }) => ({
            removed: (id: number, new_length: number) => _s(`#${id} removed from immune list. The immune count is now ${new_length}`),
            err: {
                invalid_id: _inval("please provide a valid id"),
                not_in_list: (id: number) => _w(`#${id} is not in the immune list.`),
            },
        })),
        add_dom: Tmpl.cmd({
            name: "adddom",
            params: fmt.params("id"),
            desc: "adds member to dom list",
        }, ({ _inval }) => ({
            added: (id: number, new_length: number) => _s(`#${id} added to dom list. The dom count is now ${new_length}`),
            err: {
                invalid_id: _inval("please provide a valid id"),
                already_added: (id: number) => _w(`#${id} is already in the dom list.`),
            },
        })),
        remove_dom: Tmpl.cmd({
            name: "removedom",
            params: fmt.params("id"),
            desc: "removes member from dom list",
        }, ({ _inval }) => ({
            removed: (id: number, new_length: number) => _s(`#${id} removed from dom list. The dom count is now ${new_length}`),
            err: {
                invalid_id: _inval("please provide a valid id"),
                not_in_list: (id: number) => _w(`#${id} is not in the dom list.`),
            },
        })),
        add_favor: Tmpl.cmd({
            name: "addfavor",
            params: fmt.params("price", "name"),
            desc: "adds favor to store [quote name for spaces]",
        }, ({ _inval }) => ({
            added: (name: string, price: number) => _s(`Favor ${name} costing ${price} gold has been added to the store.`),
            err: {
                invalid_price: _inval("please provide a valid price"),
                invalid_name: _inval("please provide a valid name"),
                neg_or_zero_price: _inval("price should be a positive value"),
            },
        })),
        remove_favor: Tmpl.cmd({
            name: "removefavor",
            params: fmt.params("index"),
            desc: "removes favor from store at specified index",
        }, ({ _inval }) => ({
            removed: (name: string, price: number) => _s(`Favor ${name} costing ${price} gold has been removed from the store.`),
            err: {
                invalid_index: _inval("please provide a valid index"),
                index_out_of_range: _inval("index is not valid, check !displaystore"),
                failed: (reason: string) => _e(`Failed to remove favor from store because ${reason}`),
            },
        })),
        remove_owed: Tmpl.cmd({
            name: "removeOwed",
            params: fmt.params("index"),
            desc: "removes owed favor from owed list at specified index",
        }, ({ _inval }) => ({
            resolved: (name: string, id: number) => _s(`Favor ${name} for #${id} has been resolved.`),
            err: {
                invalid_index: _inval("please provide a valid index"),
                index_out_of_range: _inval("index is not valid, check !displayOwed"),
            },
        })),
        display_owed: Tmpl.cmd({
            name: "displayOwed",
            params: fmt.params(),
            desc: "displays the list of owed favors",
        }, () => ({
            title: (count: number) => _p(`${count} Owed Favors:`),
            entry: (index: number, id: number, name: string) => `[${index}]: ${name} owed to #${id}`,
        })),
        release: Tmpl.cmd({
            name: "release",
            params: fmt.params("id"),
            desc: "force releases player from prison term",
        }, ({ _inval }) => ({
            err: {
                invalid_id: _inval("please provide a valid id"),
                not_prisoner: (id: number) => _e(`#${id} isn't a prisoner in the system.`),
                not_present: (id: number) => _e(`Cannot release #${id} when they aren't here.`),
            },
        })),
        confirm: Tmpl.cmd({
            name: "confirm",
            params: fmt.params(),
            desc: "confirm a pending action",
        }, () => ({
            err: {
                no_action: _e(`Nothing to confirm.`),
            },
        })),
        respond: Tmpl.cmd({
            name: "respond",
            params: fmt.params("response"),
            desc: "respond to a prompt",
        }, () => ({
            err: {
                no_prompt: _e(`Nothing to respond to.`),
            },
        })),
        gold: Tmpl.cmd({
            name: "gold",
            params: fmt.params(),
            desc: "check your gold and rank",
        }, () => ({
            stat: (gold: number, level: number, rank: string) =>
                _g(`💰 Gold: ${gold} | Rank: ${rank} ${_b(level)}`),
        })),
        favors: Tmpl.cmd({
            name: "favors",
            params: fmt.params(),
            desc: "shows the list of bought favors you are owed",
        }, () => ({
            title: (count: number) => _p(`${count} Owed Favors:`),
            entry: (name: string) => `- ${name}`,
        })),
        rankup: Tmpl.cmd({
            name: "rankup",
            params: fmt.params(),
            desc: "see next rank cost",
        }, () => ({
            at_max_rank: (name: string) => _g(`🏆 You are already at max rank: ${name}!`),
            info: (
                rank_name: string, rank_level: number,
                max_rank_level: number,
                nxt_rank_name: string, nxt_rank_cost: number,
                gold: number,
            ) => _m(
                `📊 Current rank: ${rank_name} ${fmt.brkt(`${rank_level}/${max_rank_level}`)}`,
                `Next rank: ${nxt_rank_name} — costs ${nxt_rank_cost} gold`,
                `You have ${gold} gold.`,
                `Type !purchaserankup to buy it.`
            ),
        })),
        purchase_rankup: Tmpl.cmd({
            name: "purchaserankup",
            params: fmt.params(),
            desc: "buy next rank",
        }, () => ({
            at_max_rank: _g("🏆 You are already at max rank!"),
            prompt: (rank_name: string, rank_cost: number, gold: number) =>
                _w(`Rank up to ${rank_name} costs ${rank_cost} gold. You have ${gold} gold. Type !confirm to purchase.`),
            success: (rank_name: string, gold: number) => _g(`🏆 Rank up! You are now a ${rank_name}! Remaining gold: ${gold}.`),
            announce: (player: string, rank: string) => _g(`🏆 ${player} has ranked up to ${rank}!`),
            err: {
                not_enough_gold: (rank_name: string, rank_cost: number, gold: number) =>
                    _e(`Not enough gold! ${rank_name} costs ${rank_cost} gold. You have ${gold} gold.`),
                mismatch: _w("Your gold has changed. Please redo !purchaserankup again to confirm the changes."),
                failed: (reason: string) => _w(`Failed to rank up because ${reason}`),
            },
        })),
        display_store: Tmpl.cmd({
            name: "displaystore",
            params: fmt.params(),
            desc: "displays the list of favors for sale",
        }, () => ({
            title: (count: number) => _p(`${count} Store Favors:`),
            entry: (index: number, name: string, cost: number) => `[${index}]: ${name} ${_b(`${cost} gold`)}`,
        })),
        buy: Tmpl.cmd({
            name: "buy",
            params: fmt.params("index"),
            desc: "buys the favor at the specified index in the store",
        }, ({ _inval }) => ({
            bought: (favor: string) => _s(`Favor ${favor} has been bought.`),
            err: {
                invalid_index: _inval("please provide a valid index"),
                index_out_of_range: _inval("index is not valid, check !displaystore"),
                failed: (reason: string) => _e(`Failed to buy favor from store because ${reason}`),
            },
        })),
        bounty: Tmpl.cmd({
            name: "bounty",
            params: fmt.params("id"),
            desc: "check a bounty",
        }, ({ _inval }) => ({
            no_bounty: (id: number) => _s(`#${id} has no bounty.`),
            bounty: (id: number, gold: number) => _w(`#${id} has a bounty of ${gold} gold.`),
            err: {
                invalid_id: _inval("please provide a valid id"),
            },
        })),
        claim_bounty: Tmpl.cmd({
            name: "claimbounty",
            params: fmt.params(),
            desc: "capture a wanted target [stand at claim zone]",
        }, () => ({
            collected: (bounty: number, total: number) =>
                _s(`You have successfully collected the bounty! +${bounty} gold. Total: ${total} gold.`),
            been_collected: (sentence: string) =>
                _g(`🔒 Someone has collected your bounty! You have been taken to prison for a term of ${sentence}.`),
            announce: (claimer: string, target: string) => _g(`⚡ ${claimer} has claimed a bounty on ${target}!`),
            err: {
                not_in_zone: _e("You need to stand at the bounty claim area to use this."),
                no_targets: _e("No wanted targets found in the capture zone."),
                no_bounty: _e("Target in capture zone somehow has no bounty."),
                prison_full: _e("All prison cells are full! Try again later."),
                admit_failed: (reason: string) => _e(`Could not admit prisoner because ${reason}`),
                internal_error: _e("Internal error occured. while claiming! Try again later."),
            },
        })),
        clear_bounty: Tmpl.cmd({
            name: "clearbounty",
            params: fmt.params("id"),
            desc: "pay to clear a bounty [stand at claim zone]",
        }, ({ _inval }) => ({
            info_prefix: (id: number, gold: number, cost: number) =>
                fmt.warn(`#${id} has a bounty of ${gold} gold. Clearing it costs ${cost} gold (1.5x).`),
            prompt: (prefix: string, gold: number) => _g(`${prefix} You have ${gold} gold. Type !confirm to proceed.`),
            cleared: (id: number, cost: number, remainder: number) =>
                _s(`Bounty on #${id} cleared! You paid ${cost} gold. Remaining gold: ${remainder}.`),
            been_cleared: _g("🎉 Your bounty has been cleared by someone!"),
            err: {
                not_in_area: _e("You need to stand at the bounty area to use this."),
                invalid_id: _inval("please provide a valid id"),
                no_bounty: (id: number) => _e(`#${id} has no bounty.`),
                not_enough_gold: (prefix: string, gold: number) => _g(`${prefix} You only have ${gold} gold.`),
                mismatch: (id: number) =>
                    _w(`Either #${id}'s bounty has changed or your gold has changed. Please redo !clearbounty again to confirm the changes.`),
                failed: (reason: string) => _w(`Failed to clear bounty because ${reason}`),
            },
        })),
        place_bounty: Tmpl.cmd({
            name: "placebounty",
            params: fmt.params("id", "gold"),
            desc: "place a bounty [stand at claim zone, at least 20 gold]",
        }, ({ _inval }) => ({
            placed: (bounty: number, id: number, gold: number) => _s(`Placed a ${bounty} gold bounty on #${id}. Your gold: ${gold}.`),
            announce: (bounty: number, id: number) => _w(`A ${bounty} gold bounty has been placed on member #${id}!`),
            err: {
                not_in_area: _e("You need to stand at the bounty area to use this."),
                invalid_id: _inval("please provide a valid id"),
                invalid_gold: _inval("please provide a valid gold amount"),
                bounty_immunity: _inval((id: number, reason: string) => `#${id} ${reason}` as const),
                need_min_gold: _inval("gold amount must be at least 20"),
                not_enough_gold: (gold: number) => _e(`Not enough gold! You have ${gold} gold.`),
                failed: (reason: string) => _w(`Failed to place bounty because ${reason}`),
            }
        })),
    },
} as const);
//#endregion

export default strings;