
import { RoomDefinition } from "bc-bot";
import { PartialMixinOptions } from "./mixins";
import { RoomClasses, RoomOptions } from "./rooms";

export type BotConfig = {
    name: string,
    account: {
        username: string,
        password: string,
    },
    room: {
        definition: Partial<RoomDefinition>,
        options: RoomOptions,
    },
} & PartialMixinOptions;

import { MapRoomLike } from "./rooms";
import { ProviderMixins } from "./mixins";
import { obj } from "./utils";

export const configureClass = (config: BotConfig): MapRoomLike | null => {
    let { cls, reqMixins } = RoomClasses[config.room.options.type ?? "room"] ?? RoomClasses.room;

    if (reqMixins && (!config.mixins || !reqMixins.every(m => m in config.mixins!))) {
        console.error(`bot [${config.name}] failed to create, check every required mixin is added!`);
        return null;
    }

    let providerMixinKeys = obj(ProviderMixins).keys();
    if (reqMixins) providerMixinKeys = providerMixinKeys.filter(k => !reqMixins.includes(k));
    providerMixinKeys.forEach(k => {
        if (config.mixins && config.mixins[k]) cls = ProviderMixins[k](cls);
    });

    return cls;
};
