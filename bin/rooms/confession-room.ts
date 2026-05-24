import type { TellType } from "bc-bot";
import _shared from "../features/_shared";
import { CommandContext, WithCommands } from "../mixins";
import { ret, ObjStore, obj, ensure, str, time, as, isValidNumber, DeepPartial } from "../utils";
import { GenericMapRoomOptions, MapRoom, MapRoomArguments } from "./map-room";

namespace Confessions {

    //#region entry def
    export type Entry = {
        content: string,
        time: {
            entry: number,
            expiry: number,
        },
    };

    export namespace Entry {
        export type Type = typeof types[number];
        const types = ["sin", "confession"] as const;

        type Entries<T> = Record<Type, T>;
        export const Types = Object.assign(types, {
            expiryMapper: ensure<Entries<(now: Date) => number>>({
                // next day
                confession: (now) => Date.UTC(
                    now.getUTCFullYear(),
                    now.getUTCMonth(),
                    now.getUTCDate() + 1,
                ) / 1000,
                // next Monday
                sin: (now) => {
                    const today = now.getUTCDay(); // returns: [Sun(0)...Sat(6)]
                    const weekBeginDay = 1; // Monday
                    const daysUntilNextWeek =
                        today === weekBeginDay
                            ? 7
                            : (weekBeginDay - today + 7) % 7;
                    return Date.UTC(
                        now.getUTCFullYear(),
                        now.getUTCMonth(),
                        now.getUTCDate() + daysUntilNextWeek,
                    ) / 1000;
                },
            }),
            getTime: (type: Entry.Type): Entry["time"] => {
                const now = time.unix();
                return {
                    entry: now,
                    expiry: Entry.Types.expiryMapper[type](new Date(now * 1000)),
                };
            },
            retentions: ensure<Entries<string>>({
                confession: "day",
                sin: "Monday",
            }),
            of: (
                <V>(mapper: V | ((type: Type) => V)) =>
                    types.reduce((acc, type) => {
                        acc[type] =
                            typeof mapper === 'function'
                                ? as<(type: Type) => V>(mapper)(type)
                                : structuredClone(mapper);
                        return acc
                    }, <Entries<V>>{})
            ) as {
                <V>(mapper: (type: Type) => V): Entries<V>;
                <V>(value: V): Entries<V>;
            },
        });
    }
    //#endregion

    export type Text = string | { type: TellType, contents: string };
    export type Texts = {
        submitted: (type: Entry.Type) => Text;
    };

    type Player = {
        id: number,
        entries: { [Type in Entry.Type]: Entry | null },
    };

    export type Store = ReturnType<typeof Store.create>;
    export namespace Store {

        //#region timed event
        type TimedEventManager = ReturnType<typeof TimedEventManager.create>;
        namespace TimedEventManager {
            type Event = ReturnType<typeof Event.create>;
            namespace Event {
                export const create = (at: number, action: () => void) => {
                    const handle = setTimeout(
                        () => action(),
                        (at - time.unix()) * 1000
                    );

                    return {
                        at,
                        cancel() { clearTimeout(handle) }
                    };
                };
            }

            export const create = () => {
                /** @desc ~ map of timestamp to event */
                const timers = <Record<number, Event>>{};

                return {
                    get times() { return Object.keys(timers).map(Number) },
                    schedule: (at: number, action: () => void) => {
                        console.info("Confessions.TimedEventManager(schedule):", `timed event at [${at}]`);
                        if (at in timers) timers[at].cancel();
                        timers[at] = Event.create(at, () => {
                            action();
                            delete timers[at];
                        });
                    },
                    cancel: (at: number) => {
                        if (!(at in timers)) return;
                        console.info("Confessions.TimedEventManager(cancel):", `timed event at [${at}]`);
                        timers[at].cancel();
                        delete timers[at];
                    },
                };
            };
        }
        //#endregion

        //#region store
        namespace Registry {
            export type Definition = {
                hooks: {
                    refreshDescription: () => void,
                },
            };
        }

        export const create = (cfg: { path: string }) => {
            const registry = as<Registry.Definition>({});
            const store = ObjStore.KeyedCollection.create<Player>({
                name: "confessions",
                file: { path: cfg.path },
                options: { queueUpdateMs: 500 },
            });
    
            const collection = Object.assign(ObjStore.KeyedCollection.wrap(store), {
                requirePlayer: (id: number) => {
                    let player = collection.get(str(id));
                    if (!player) {
                        player = collection.set(str(id), {
                            id,
                            entries: Entry.Types.of(null),
                        });
                    }
                    return player;
                },
                index: () => {
                    return collection.values.reduce((acc, player) => {
                        obj(player.entries).keys().forEach(type => {
                            if (!(player.entries[type])) return;
                            acc.push({
                                type, by: player.id,
                                content: player.entries[type]!.content,
                                expiry: player.entries[type]!.time.expiry,
                            });
                        });
                        return acc;
                    }, <{ type: Entry.Type, by: number, content: string, expiry: number }[]>[]);
                },
                prune: () => {
                    const currTime = time.unix();
                    let pruned = Entry.Types.of(0);
                    collection.keys.forEach(id => {
                        const player = collection.get(id);
                        if (!player) return; // shouldn't be possible in all honesty =w=
                        obj(player.entries).keys().forEach(type => {
                            const entry = player.entries[type];
                            if (!entry || currTime < entry.time.expiry) return;
                            player.entries[type] = null;
                            pruned[type]++;
                        });
                        if (Object.values(player.entries).every(e => !e))
                            collection.delete(id, false);
                    });
        
                    if (Object.values(pruned).some(c => c)) {
                        console.info("Confessions.Store(prune):", `pruned(${str(pruned)})`);
                        collection.queueUpdate();
                    }
                },
            });

            const TEM = Object.assign(TimedEventManager.create(), {
                sync: () => {
                    console.info("Confessions.Store.TEM(sync)");

                    // remove timed events that would now expire nothing
                    const index = collection.index();
                    const expiries = [...new Set(index.map(e => e.expiry))];
                    TEM.times.forEach(time => {
                        if (!expiries.includes(time))
                            TEM.cancel(time);
                    });

                    // ensure needed timed events are scheduled
                    const times = TEM.times;
                    expiries.filter(e => !times.includes(e)).forEach(time => {
                        TEM.schedule(time, () => {
                            collection.prune();
                            registry.hooks.refreshDescription();
                        });
                    });
                },
            });

    
            // prune on creation
            collection.prune();

            return {
                flush: store.flush,
                retentions: Entry.Types.retentions,
                insert: (entry: { by: number, type: Entry.Type, content: string }) => {
                    const player = collection.requirePlayer(entry.by);
                    if (player.entries[entry.type])
                        return ret.err(
                            `You already have an existing ${entry.type} submitted!` + " " +
                            `Try again the next ${Entry.Types.retentions[entry.type]} on 00:00 UTC!`
                        );
                    return ret.ok(ret.and(
                        collection.update(str(player.id), () => ({
                            entries: {
                                [entry.type]: ensure<Entry>({
                                    content: entry.content,
                                    time: Entry.Types.getTime(entry.type),
                                }),
                            },
                        })),
                        () => TEM.sync(),
                    ));
                },
                index: collection.index,
                get entries() {
                    return collection.values.map(p => p.entries).reduce((acc, entries) => {
                        obj(entries).keys().forEach(type => {
                            if (!(entries[type])) return;
                            acc[type].push(entries[type]!.content);
                        });
                        return acc;
                    }, Entry.Types.of(<string[]>[]));
                },
                delete: (idx: number) => {
                    const index = collection.index();
                    if (idx < 0 || idx >= index.length) return ret.err("index out of range");
                    const { by, type } = index[idx];
                    const player = collection.update(str(by), () => ({
                        entries: { [type]: null },
                    }));
                    if (Object.values(player.entries).every(e => !e))
                        collection.delete(str(by));
                    TEM.sync();
                    return ret.ok();
                },
                register: (defn: Registry.Definition) => {
                    Object.assign(registry, defn);
                    TEM.sync();
                },
            };
        };
    }
    //#endregion
}

export type ConfessionRoomOptions = GenericMapRoomOptions<{
    confessional: {
        store: string,
        admins: number[],
        texts: DeepPartial<Confessions.Texts>,
    },
}>;

const MixedMapRoomClass = WithCommands(MapRoom);

export class ConfessionRoom extends MixedMapRoomClass {
    #opts: ConfessionRoomOptions;
    #store: Confessions.Store;
    #texts: Confessions.Texts;

    #description: { header: string };

    //#region lifecycle
    constructor(arg: MapRoomArguments<ConfessionRoomOptions>) {
        const store = Confessions.Store.create({
            path: `store.${arg.opts.confessional.store}.json`,
        });

        super({
            ...arg, mixins: {
                ...(arg.mixins ?? {}), "cmd-handler": {
                    ...(arg.mixins?.["cmd-handler"] ?? {}),
                    texts: {
                        help: {
                            getHelpText: _shared.cmd.help.createTextFormatter({
                                texts: {
                                    help_title: "=< Commands >=",
                                    public_role_name: "Public",
                                },
                                templates: {
                                    cmd_to_text: (prefix, name, desc) => `${prefix}${name} ~ ${desc}`,
                                    role_title: (role) => `== [${role}]`,
                                },
                            }),
                        },
                        unknown: "Unknown command, try `/bot` for help!"
                    },
                    roles: {
                        Admin: [...arg.opts.confessional.admins],
                    },
                },
            },
        });
        this.#opts = arg.opts;
        this.#store = store;
        // @ts-expect-error ~ texts is a deep partial that will be populated
        this.#texts = this.#opts.confessional.texts;
        obj.deep.fill({
            submitted: (type) => ({
                type: "Whisper",
                contents: (
                    `Your ${type} has been submitted and will remain until the next ${this.#store.retentions[type]} @ 00:00 UTC!` + " " +
                    `Another ${type} from you won't be accepted until then.` + " " +
                    `Feel free to come again after that to submit another ${type}!`
                ),
            }),
        }, this.#texts);
        
        this.#description = { header: this.#opts.bot.description };
        this.#registerCommands();
        this.#registerEvents();
    }

    public override init = async () => {
        await super.init();
        this._conn.Player.SetActivePose(["BackBoxTie"]);
        this.#refreshDescription();
        this.#store.register({
            hooks: {
                refreshDescription: this.#refreshDescription,
            },
        });
    }

    public override exit = async () => {
        this.#store.flush();
        await super.exit();
    }
    //#endregion

    //#region description
    #refreshDescription = () => {
        console.info(`FUNC(#refreshDescription)`);
        const entries = this.#store.entries;
        const parts = [
            this.#description.header,
            "=< Confession Entries >=",
            "> [Sins] ~ refreshes weekly on Monday @ 00:00 UTC", (
                entries.sin.length === 0
                    ? "(none)"
                    : entries.sin.map(ent => `- ${ent}`).join("\n")
            ), "",
            "> [Confessions] ~ refreshes daily @ 00:00 UTC", (
                entries.confession.length === 0
                    ? "(none)"
                    : entries.confession.map(ent => `- ${ent}`).join("\n")
            ),
        ];
        this._conn.setBotDescription(parts.join("\n"));
    }
    //#endregion

    //#region events
    #registerEvents = () => {
        this._conn.on("RoomJoin", this.#onBotRoomConnect);
        this._conn.on("RoomCreate", this.#onBotRoomConnect);
    }

    #onBotRoomConnect = () => {
        console.info("FUNC(#onBotRoomConnect)");
        this.#refreshDescription();
    }
    //#endregion

    //#region cmds
    #registerCommands = () => {

        // !confess (confession)
        this._cmd.register({
            name: "confess",
            desc: "confess something [daily refresh @ 00:00 UTC]",
            callback: (ctx) => this.#onConfess("confession", "confess", ctx),
        });

        // !sin (sin)
        this._cmd.register({
            name: "sin",
            desc: "confess a sin [weekly Monday refresh @ 00:00 UTC]",
            callback: (ctx) => this.#onConfess("sin", "sin", ctx),
        });

        // !index
        this._cmd.register({
            name: "index",
            desc: "shows index of all entries",
            roles: ["Admin"],
            callback: (ctx) => {
                const index = this.#store.index();
                ctx.reply(
                    "=< Confessions Index >=",
                    index.length
                        ? index.map((e, idx) => `[${idx}]: ${e.content}`).join(`\n`)
                        : `(none)`,
                );
            },
        });

        // !delete (index)
        this._cmd.register({
            name: "delete",
            desc: "removes an entry by index",
            roles: ["Admin"],
            callback: (ctx) => {
                const [strIdx] = ctx.cmd.args;
                if (!strIdx || !isValidNumber(strIdx)) return;
                if (!this.#store.delete(parseInt(strIdx))) return;
                ctx.reply("Successfully removed entry!");
                this.#refreshDescription();
            },
        })

    }

    #onConfess = (type: Confessions.Entry.Type, command: string, ctx: CommandContext) => {
        console.info(`EVENT(#onConfess)`, ctx.cmd);
        const text = ctx.cmd.raw.substring(command.length).trim();
        if (text === "")
            return ctx.reply(`Your ${type} cannot be empty, try again!`);
        if (text.includes("\n"))
            return ctx.reply(`Your ${type} cannot contain new lines, try again!`);

        const result = this.#store.insert({
            by: ctx.sender.MemberNumber,
            content: text,
            type,
        });
        if (!result.ok) return ctx.reply(result.err);

        this.#sendText(this.#texts.submitted(type));
        this.#refreshDescription();
    }
    //#endregion

    //#region helper
    #sendText = (text: Confessions.Text, ctx?: CommandContext) => {
        const contents =
            typeof text === "string"
                ? text
                : text.contents;

        if (ctx && (typeof text === "string" || text.type === "Whisper"))
            return ctx.reply(contents);
        this._conn.SendMessage(
            typeof text === "string"
                ? "Whisper"
                : text.type,
            contents,
        );
    };
    //#endregion
}