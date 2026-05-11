//#region types
import { BountyRoomOptions } from "./bounty-room";
import { MapRoomOptions } from "./map-room";
import { SuggestionRoomOptions } from "./suggestion-room";
import { ConfessionRoomOptions } from "./confession-room";

export type RoomOptions =
    ({ type?: "room"       } & MapRoomOptions       ) |
    ({ type:  "suggestion" } & SuggestionRoomOptions) |
    ({ type:  "bounty"     } & BountyRoomOptions    ) |
    ({ type:  "confession" } & ConfessionRoomOptions)
;
//#endregion

//#region map
export { MapRoomLike } from "./map-room";
import { PartialMixinOptions } from "../mixins";

import { MapRoom, MapRoomLike } from "./map-room";
import { SuggestionRoom } from "./suggestion-room";
import { BountyRoom } from "./bounty-room";
import { ConfessionRoom } from "./confession-room";


type RoomClassInfo = {
    cls: MapRoomLike,
    reqMixins?: (keyof NonNullable<PartialMixinOptions["mixins"]>)[],
};
export const RoomClasses: Record<NonNullable<RoomOptions["type"]>, RoomClassInfo> = {
    room: { cls: MapRoom },
    suggestion: { cls: SuggestionRoom, reqMixins: ["cmd-handler"] },
    bounty: { cls: BountyRoom, reqMixins: ["cmd-handler"] },
    confession: { cls: ConfessionRoom, reqMixins: ["cmd-handler"] },
};
//#endregion