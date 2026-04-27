import { MapRoomLike } from "../rooms/map-room";
import { Satisfies, as } from "../utils";
import { MixinConstructor, MixinOptions } from "./types";

interface UWallSettings {
    Uwall: boolean;
}

//#region mixin
export namespace UWallMixin {
    export const Id = "uwall" as const;
    export type Id = typeof Id;
    export type Options = MixinOptions<Id, WithUWallOptions>;
}

abstract class WithUWallShape {
}

type WithUWallOptions = {};

export type WithUWallLike = MapRoomLike & MixinConstructor<WithUWallShape>;

export const WithUWall = <TRoomClass extends MapRoomLike>(RoomClass: TRoomClass) => {
    return class extends RoomClass {
        #opts: WithUWallOptions;

        constructor(...args: any[]) {
            super(...args);
            this.#opts = (args[0] as Satisfies<UWallMixin.Options>).mixins[UWallMixin.Id];
            as<UWallSettings>(this._conn.Player.OnlineSharedSettings).Uwall = true;
            this._conn.accountUpdate({ OnlineSharedSettings: this._conn.Player.OnlineSharedSettings });
        }
    };
};
//#endregion