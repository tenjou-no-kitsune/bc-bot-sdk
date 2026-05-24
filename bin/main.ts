import path from "node:path";
import { API_Connector, RoomDefinition } from "bc-bot";
import { MapRoom, MapRoomStore } from "./rooms/map-room";
import { LogContext, ObjStore } from "./utils";
import { configureClass, type BotConfig } from "./config";
import bot from "./bot";

type Bot = {
    name: string;
    connector: API_Connector,
    instance: MapRoom,
};

const createBot = async ({ name, account, room, mixins }: BotConfig): Promise<Bot | string> => {
    const SERVER_URL = "https://bondage-club-server.herokuapp.com/";

    //#region store
    const store = ObjStore.create<MapRoomStore>({
        name,
        file: { path: `store.${name}.json` },
        data: {
            default: {
                defs: {
                    name: room.options.defs.name,
                    description: room.options.defs.description,
                    background: room.options.defs.background,
                    lists: {
                        admin: room.options.defs.lists.admin,
                        ban: room.options.defs.lists.ban,
                        whitelist: room.options.defs.lists.whitelist,
                    },
                    privacy: {
                        access: room.options.defs.privacy.access,
                        visibility: room.options.defs.privacy.visibility,
                    },
                },
                map: room.options.map
                    ? {
                        code: room.options.map.code,
                        position: room.options.map.position,
                    }
                    : null,
                bot: { description: room.options.bot.description },
            },
        },
    });
    const loaded = store.load();
    room.options.map = loaded.map
        ? {
            code: loaded.map.code,
            position: loaded.map.position,
        }
        : null;
    room.options.bot.description = loaded.bot.description;
    room.options.defs.name = loaded.defs.name;
    room.options.defs.description = loaded.defs.description;
    room.options.defs.background = loaded.defs.background;
    room.options.defs.lists.admin = loaded.defs.lists.admin;
    room.options.defs.lists.ban = loaded.defs.lists.ban;
    room.options.defs.lists.whitelist = loaded.defs.lists.whitelist;
    room.options.defs.privacy.access = loaded.defs.privacy.access;
    room.options.defs.privacy.visibility = loaded.defs.privacy.visibility;
    //#endregion

    const defn = room.definition as RoomDefinition;
    defn.Name = room.options.defs.name;
    defn.Description = room.options.defs.description;
    defn.Background = room.options.defs.background;
    defn.Admin = room.options.defs.lists.admin;
    defn.Ban = room.options.defs.lists.ban;
    (defn as unknown as { Whitelist: number[] })["Whitelist"] = room.options.defs.lists.whitelist;

    delete defn.Private;
    delete defn.Locked;
    defn.Access = room.options.defs.privacy.access;
    defn.Visibility = room.options.defs.privacy.visibility;

    const connector = new API_Connector(SERVER_URL, account.username, account.password, "live");
    await connector.joinOrCreateRoom(defn);

    let RoomClass = configureClass({ name, account, room, mixins });
    if (!RoomClass) return name;

    const instance = new RoomClass({ conn: connector, opts: room.options, store, mixins });
    await instance.init();

    return { name, connector, instance };
}

let bots: (string | Bot)[] | null = null;
const originalExit = process.exit;
process.exit = (code) => {
  console.trace(`Process.exit(${code}) was called by:`);
  return originalExit(code);
};
const cleanup = async () => {
    if (bots) await Promise.all(bots.flatMap(b => typeof b !== "string" ? [b] : []).map(b =>
        b.instance.exit(),
    ));
}
const exit = async (...params: Parameters<typeof process.exit>) => {
    await cleanup();
    process.exit(...params);
};

async function main() {

    //#region register signal handlers
    process.on("SIGINT", async () => {
        console.warn("SIGINT received, exiting");
        exit(0);
    });

    process.on("SIGTERM", () => {
        console.warn("SIGTERM received, exiting");
        exit(0);
    });

    process.on("beforeExit", (code) => {
        console.warn(`beforeExit received, exiting with code ${code}`);
        cleanup().then(() => {
            console.info("beforeExit cleanup completed!")
        });
    });
    //#endregion

    LogContext.setLogLevel("info");
    bots = await Promise.all(bot.configs.map(cfg =>
        LogContext.run<ReturnType<typeof createBot>>(
            { path: path.join("logs", `${cfg.name}.log`), prefix: cfg.name },
            async () => await createBot(cfg),
        )
    ));
    bots.forEach((bot) => {
        if (typeof bot === "string")
            return console.warn(`bot [${bot}] failed to create!`);
        console.log(`bot [${bot.name}] created!`);
    });
    if (!bots.filter(b => typeof b !== "string").length) {
        console.log("no bots running, quitting!");
        exit(0);
    }
    console.log(`all up and running!`);
}

main().catch((e) => {
    console.error(e);
    exit(1);
});
