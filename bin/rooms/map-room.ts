/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    API_Character,
    API_Connector,
    API_Message,
//@ts-ignore
} from "bc-bot";
import { ChatRoomMapManager } from "../vendor/bc/chat-room-map-view";
import { ObjStore, areArraysEqual, parseApiCharObj } from "../utils";
import { MixinConstructor, PartialMixinOptions } from "../mixins";

type RoomDefinitionOptions = {
    name: string,
    description: string,
    background: string,
    lists: {
        admin: number[],
        ban: number[],
        whitelist: number[],
    },
    privacy: {
        visibility: ServerChatRoomRole[],
        access: ServerChatRoomRole[],
    },
}

export type GenericMapRoomOptions<T = {}> = {
    defs: RoomDefinitionOptions,
    map: {
        code: string,
    },
    bot: {
        position: { X: number, Y: number },
        description: string,
        getAnnounceMsg?: (name: string) => string,
        getGreeting?: (name: string) => string,
    },    
} & T;

export type MapRoomOptions = GenericMapRoomOptions;

export type MapRoomStore = {
    defs: RoomDefinitionOptions,
    map: MapRoomOptions["map"],
    bot: Pick<MapRoomOptions["bot"], "description">,
};

export type MapRoomArguments<T = MapRoomOptions> = {
    conn: API_Connector,
    opts: T,
    store: ObjStore<MapRoomStore>,
} & PartialMixinOptions;

export type MapRoomLike = MixinConstructor<MapRoom>;

export class MapRoom {
    protected _conn: API_Connector;
    #opts: MapRoomOptions;
    #store: ObjStore<MapRoomStore>

    public constructor({ conn, opts, store }: MapRoomArguments) {
        this._conn = conn;
        this.#opts = opts;
        this.#store = store;

        this._conn.on("Message", this.#onGenericMsg);
        this._conn.on("CharacterEntered", this.#onCharEnter);
        this._conn.on("CharacterLeft", this.#onCharLeft as never);
        this._conn.on("RoomCreate", this.#onChatRoomCreated);
        this._conn.on("RoomUpdate", this.#onChatRoomUpdated);
        this._conn.on("RoomJoin", this.#onChatRoomJoined);
    }

    public init = async () => {
        await this.#setupRoom();
        await this.#setupCharacter();
    }

    public async exit() {
        console.info("[Exit]");
    }

    //#region Msg Events
    #onGenericMsg = async ({ message, sender }: API_Message) => {
        console.debug("EVENT(#onGenericMsg): ", message);
        if (message.Type === "Action") {
            if (message.Content === "ServerUpdateRoom") this.#onCharUpdateRoom(sender);
        }
    }
    //#endregion

    //#region Char Events
    #onCharUpdateRoom = async (charObj: API_Character) => {
        const char = parseApiCharObj(charObj);

        console.debug("EVENT(#onCharUpdateRoom)");
        console.info("[Room Updated]:", char);
    }

    #onCharEnter = async (charObj: API_Character) => {
        const char = parseApiCharObj(charObj);

        console.debug("EVENT(#onCharEnter)");
        console.info("[Character Entered]:", char);
        
        const { getAnnounceMsg, getGreeting } = this.#opts.bot;
        if (getAnnounceMsg) this._conn.SendMessage("Chat", `(${getAnnounceMsg(char.name)})`);
        if (getGreeting) charObj.Tell("Whisper", `(${getGreeting(char.name)})`);
    }

    #onCharLeft = async (_srcMemberNumber: number, charObj: API_Character, _leaveMsg: string, _intentional: boolean) => {
        const char = parseApiCharObj(charObj);

        console.debug("EVENT(#onCharLeft)");
        console.info("[Character Left]:", char);
    }
    //#endregion

    //#region Room Events
    #onChatRoomUpdated = async (obj: ServerChatRoomSyncPropertiesMessage) => {
        console.debug("EVENT(#onChatRoomUpdated)", obj);

        const { MapData } = obj;
        let hasChanges = false;

        hasChanges ||= this.#syncRoomDetails(obj);
        if (MapData) hasChanges ||= this.#syncMapCode(obj.MapData!);
        if (hasChanges) this.#syncStore();
    };

    #onChatRoomCreated = async () => {
        console.debug("EVENT(#onChatRoomCreated)");
        await this.#setupRoom();
        await this.#setupCharacter();
    };

    #onChatRoomJoined = async () => {
        console.debug("EVENT(#onChatRoomJoined)");
        await this.#setupCharacter();
    };
    //#endregion

    //#region Sync Methods
    #syncMapCode = (mapData: ServerChatRoomMapData): boolean => {
        try {
            const mapCode = ChatRoomMapManager.Map.exportString(mapData);
            if (mapCode !== this.#opts.map.code) {
                this.#opts.map.code = mapCode!;
                console.info("FUNC(#syncMapCode):", "updated with new map code detected");
                return true;
            }
        } catch (e) {
            console.error("FUNC(#syncMapCode):", "failed to set map data", e);
        }
        return false;
    }

    #syncRoomDetails = ({
        Name, Description, Background,
        Admin, Ban, Whitelist,
        Access, Visibility,
    }: ServerChatRoomSyncPropertiesMessage) => {
        let hasChanges = false;
        if (Name !== this.#opts.defs.name) {
            this.#opts.defs.name = Name;
            console.info("FUNC(#syncRoomDetails):", "updated with new room name");
            hasChanges = true;
        }
        if (Description !== this.#opts.defs.description) {
            this.#opts.defs.description = Description;
            console.info("FUNC(#syncRoomDetails):", "updated with new room description");
            hasChanges = true;
        }
        if (Background !== this.#opts.defs.background) {
            this.#opts.defs.background = Background;
            console.info("FUNC(#syncRoomDetails):", "updated with new room background");
            hasChanges = true;
        }
        if (!areArraysEqual(Admin, this.#opts.defs.lists.admin)) {
            this.#opts.defs.lists.admin = Admin;
            console.info("FUNC(#syncRoomDetails):", "updated with new room admin list");
            hasChanges = true;
        }
        if (!areArraysEqual(Ban, this.#opts.defs.lists.ban)) {
            this.#opts.defs.lists.ban = Ban;
            console.info("FUNC(#syncRoomDetails):", "updated with new room ban list");
            hasChanges = true;
        }
        if (!areArraysEqual(Whitelist, this.#opts.defs.lists.whitelist)) {
            this.#opts.defs.lists.whitelist = Whitelist;
            console.info("FUNC(#syncRoomDetails):", "updated with new room whitelist");
            hasChanges = true;
        }
        if (!areArraysEqual(Access, this.#opts.defs.privacy.access)) {
            this.#opts.defs.privacy.access = Access;
            console.info("FUNC(#syncRoomDetails):", "updated with new room access");
            hasChanges = true;
        }
        if (!areArraysEqual(Visibility, this.#opts.defs.privacy.visibility)) {
            this.#opts.defs.privacy.visibility = Visibility;
            console.info("FUNC(#syncRoomDetails):", "updated with new room visibility");
            hasChanges = true;
        }
        return hasChanges;
    }

    #syncStore = () => {
        const { map, bot, defs } = this.#opts;
        this.#store.update({
            defs: {
                name: defs.name,
                description: defs.description,
                background: defs.background,
                lists: {
                    admin: defs.lists.admin,
                    ban: defs.lists.ban,
                    whitelist: defs.lists.whitelist,
                },
                privacy: {
                    access: defs.privacy.access,
                    visibility: defs.privacy.visibility
                },
            },
            map: {
                code: map.code,
            },
            bot: { description: bot.description },
        });
    }
    //#endregion

    //#region Init Methods
    #setupRoom = async () => {
        try {
            const data = ChatRoomMapManager.Map.importString(this.#opts.map.code);
            this._conn.chatRoom!.map.setMapFromData(data!);
        } catch (e) {
            console.error("FUNC(#setupRoomMap):", "failed to set map data", e);
        }
    };

    #setupCharacter = async () => {
        const { position, description } = this.#opts.bot;

        this._conn.moveOnMap(position.X, position.Y);
        if (description) this._conn.setBotDescription(description);
        // this.conn.Player.SetActivePose(["Kneel"]);
    };
    //#endregion
}
