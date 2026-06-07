import { API_Connector } from "bc-bot";

namespace API {
    export type ConnectorEvents = {
        RoomJoin: [];
        RoomCreate: [];
        // PoseChange: [character: API_Character];
        // Message: [message: API_Message];
        // Beep: [beep: ServerAccountBeepResponse];
        // CharacterEntered: [character: API_Character];
        // CharacterSync: [character: API_Character];
        // CharacterLeft: [
        //     sourceMemberNumber: number,
        //     character: API_Character,
        //     leaveMessage: string | null,
        //     intentional: boolean
        // ];
        // RoomUpdate: [obj: ServerChatRoomSyncPropertiesMessage];
        // CharacterMapUpdate: [character: API_Character];
    }
}

type Connector = ReturnType<typeof Connector.create>;

namespace Connector {

    namespace Handlers {
        export namespace Manager {
            export const create = (_conn: API_Connector) => {
                const handlers = new Map<
                    keyof API.ConnectorEvents,
                    ((...args: unknown[]) => Promise<void>)[]
                >();

                return {
                    register: <Event extends keyof API.ConnectorEvents>(
                        event: Event,
                        handler: (...args: API.ConnectorEvents[Event]) => Promise<void>
                    ) => {
                        if (!handlers.has(event)) {
                            handlers.set(event, []);
                            _conn.on(event, <never>(async (...args: unknown[]) => {
                                for (const handler of handlers.get(event) ?? []) {
                                    await handler(args);
                                }
                            }));
                        }
                        handlers.get(event)?.push(<(...args: unknown[]) => Promise<void>>handler);
                    },
                };
            };
        }
    }

    export const create = (_conn: API_Connector) => {

        return Object.assign(_conn, {
            handlers: Handlers.Manager.create(_conn),
        });
    };
}

export default Connector;