import {
    API_Character,
    API_Connector,
    API_Message
// @ts-ignore
} from "bc-bot";
import { DeepPartial, Satisfies, obj } from "../utils";

//#region handler
type CommandHandlerTexts = {
    help: {
        name: string,
        desc: string,
        getHelpText: (ctx: CommandContext, cmds: ReadonlyArray<CommandFullInfo>) => string[],
    },
    unknown: string;
};

type CommandRoleMemberList = number[] | (() => number[])
type CommandRoleMapping = Record<string, CommandRoleMemberList>;

type CommandHandlerOptions = {
    prefix?: string,
    showHelp?: boolean,
    triggerOnChat?: boolean,
    texts?: DeepPartial<CommandHandlerTexts>,
    roles?: CommandRoleMapping,
};

export type CommandContext = {
    sender: API_Character,
    msg: ServerChatRoomMessage,
    roles: string[],
    cmd: {
        prefix: string,
        raw: string,
        args: string[],
    },
    reply: (...msgs: string[]) => void,
    new: (args: string[]) => CommandContext,
};

type CommandInfo = {
    name: string,
    desc: string,
    roles?: string[];
    callback: (ctx: CommandContext) => void | Promise<void>,
};

type CommandFullInfo = {
    name: string,
    desc: string,
    roles: Set<string> & { main: string | null };
    callback: (ctx: CommandContext) => void | Promise<void>,
};

type CommandHandlerArguments = {
    conn: API_Connector,
    opts: CommandHandlerOptions,
};

class CommandHandler {
    #SLASH_BOT_PREFIX = "ChatRoomBot" as const; // this is a BC thing, @see /bot
    #conn: API_Connector;
    #opts: CommandHandlerOptions;
    #texts: CommandHandlerTexts;
    #roles = (() => {
        let mappings: Map<string, ReturnType<typeof createRoleList>>;

        const createRoleList = (list: CommandRoleMemberList) => {
            if (Array.isArray(list)) return new Set(list);
            return { has: (id: number) => list().includes(id) };
        };
        
        const init = (map: CommandRoleMapping) => {
            mappings = new Map();
            Object.entries(map).forEach(([name, memberIds]) =>
                mappings.set(name, createRoleList(memberIds))
            )
        };

        return {
            init,
            of: (id: number) => {
                const roles: string[] = [];
                mappings.forEach((ids, role) => {
                    if (ids.has(id)) roles.push(role);
                });
                return roles;
            },
        };
    })();
    #cmds = (() => {
        const list: CommandFullInfo[] = [];
        const map = new Map<CommandFullInfo["name"], CommandFullInfo>();

        const updateList = (updateFunc: () => void) => {
            updateFunc();
            list.sort((a, b) => a.name.localeCompare(b.name));
        };

        return {
            add: (cmd: CommandInfo) => {
                if (map.has(cmd.name)) return;

                let fullCmd: CommandFullInfo = Object.assign(cmd, {
                    roles: Object.assign(new Set(cmd.roles ?? []), { main: cmd.roles?.[0] ?? null }),
                });
                map.set(cmd.name, fullCmd);
                updateList(() => list.push(map.get(cmd.name)!));
            },
            get: map.get.bind(map) as typeof map.get,
            get list(): ReadonlyArray<CommandFullInfo> { return list; },
        };
    })();

    public constructor({ conn, opts }: CommandHandlerArguments) {
        this.#conn = conn;
        this.#opts = opts;
        this.#opts.prefix ??= "!";
        this.#opts.roles ??= {}
        this.#opts.texts ??= {};
        this.#roles.init(this.#opts.roles);

        // @ts-expect-error ~ texts is a deep partial that will be populated
        this.#texts = this.#opts.texts;
        obj.deep.fill({
            help: {
                name: "help",
                desc: "shows the message listing available commands",
                getHelpText: (ctx, cmds) => [
                    "([bot commands]",
                    ...cmds.map(cmd => `${ctx.cmd.prefix}${cmd.name} ~ ${cmd.desc}`),
                ],
            },
            unknown: "(unknown command, try `/bot` to view available commands)",
        }, this.#texts)

        this.#conn.on("Message", this.#onMsg);
        if (this.#opts.showHelp) this.register({
            name: this.#texts.help.name,
            desc: this.#texts.help.desc,
            callback: this.#showHelp,
        });
    }

    //#region management
    register = (cmd: CommandInfo) => this.#cmds.add(cmd);
    //#endregion

    //#region misc info
    #showHelp = (ctx: CommandContext) => {
        ctx.reply(...this.#texts.help.getHelpText(ctx, this.#cmds.list));
    }
    //#endregion

    //#region context
    #createCmdCtx = (prefix: string, raw: string, ev: API_Message): CommandContext => {
        return {
            sender: ev.sender,
            msg: ev.message,
            roles: this.#roles.of(ev.sender.MemberNumber),
            cmd: {
                prefix,
                raw,
                args: [],
            },
            reply: (...msgs) => this.#conn.SendMessage("Whisper", msgs.join("\n"), ev.sender.MemberNumber),
            new: (args) => {
                const ctx = this.#createCmdCtx(prefix, args.join(" "), ev);
                ctx.cmd.args = args;
                return ctx;
            },
        };
    };
    //#endregion

    //#region handle msg
    #onMsg = (ev: API_Message) => {
        this.#onBotMsg(ev);
        if (this.#opts.triggerOnChat) this.#onNormalMsg(ev);
    };

    #onBotMsg = (ev: API_Message) => {
        const { message: { Type, Content: msg } } = ev;
        if (Type !== "Hidden" || !msg.startsWith(this.#SLASH_BOT_PREFIX)) return;
        console.info("EVENT(CommandHandler/#onBotMsg)", ev.message);
        this.#processCmd(this.#createCmdCtx(
            `/bot `,
            msg.substring(this.#SLASH_BOT_PREFIX.length).trimStart(),
            ev
        ));
    };

    #onNormalMsg = (ev: API_Message) => {
        const { message: { Type, Content: msg } } = ev;
        if ((Type !== "Whisper" && Type !== "Chat") || !msg.startsWith(this.#opts.prefix!) || msg.length < 1) return;
        console.info("EVENT(CommandHandler/#onNormalMsg)", ev.message);
        this.#processCmd(this.#createCmdCtx(this.#opts.prefix!, msg.substring(1), ev));
    };

    #processCmd(ctx: CommandContext): void {
        ctx.cmd.args = ctx.cmd.raw.split(" ");
        if (this.#opts.showHelp && ctx.cmd.args.length === 1 && ctx.cmd.args[0].trim() === "") return this.#showHelp(ctx);
        let cmd = [];

        // try more words of the command until we run out of parts, so
        // we can support multi-word commands
        while (ctx.cmd.args.length > 0) {
            cmd.push(ctx.cmd.args.shift());
            const info = this.#cmds.get(cmd.join(" "));
            if (!info || (info.roles.size && !ctx.roles.some(role => info.roles.has(role)))) continue;

            const { callback } = info;
            try {
                const ret = callback(ctx);
                const promiseRet = ret as Promise<void>;
                if (promiseRet && promiseRet.catch) {
                    // I am not sure if a check for promiseRet makes sense but if the return of the command is no promise it would error otherwise
                    promiseRet.catch((e) => {
                        console.error("FUNC(CommandHandler/#processCmd) threw async exception", e);
                    });
                }
            } catch (e) {
                console.error("FUNC(CommandHandler/#processCmd) threw exception", e);
            }
            return;
        }
        if (this.#opts.showHelp) ctx.reply(this.#texts.unknown);
    }
    //#endregion
}
//#endregion

//#region mixin
import { MapRoomLike } from "../rooms/map-room";
import { MixinConstructor, MixinOptions } from "./types";

export namespace CommandsMixin {
    export const Id = "cmd-handler" as const;
    export type Id = typeof Id;
    export type Options = MixinOptions<Id, WithCommandsOptions>;
}

abstract class WithCommandsShape {
    protected abstract _cmd: CommandHandler;
}

type WithCommandsOptions = CommandHandlerOptions

export type WithCommandsLike = MapRoomLike & MixinConstructor<WithCommandsShape>;

export const WithCommands = <TRoomClass extends MapRoomLike>(RoomClass: TRoomClass) => {
    return class extends RoomClass {
        protected _cmd: CommandHandler;
        #opts: WithCommandsOptions;

        constructor(...args: any[]) {
            super(...args);
            this.#opts = (args[0] as Satisfies<CommandsMixin.Options>).mixins[CommandsMixin.Id];
            this._cmd = new CommandHandler({ conn: this._conn, opts: this.#opts });
        }
    };
};
//#endregion