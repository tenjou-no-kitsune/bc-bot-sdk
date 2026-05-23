import { API_Character, API_Connector } from "bc-bot";
import { time } from "../../utils";

import __ from "./strings";
import { Shared } from "./_shared";
import Core from "./core";

type StayTime = ReturnType<typeof StayTime.create>;

/** @desc ~ module managing stay time tracking */
namespace StayTime {

    //#region tracker
    type Tracker = ReturnType<typeof Tracker.create>;
    namespace Tracker {
        type PlayerRecord = ReturnType<typeof PlayerRecord.create>;
        namespace PlayerRecord {
            export const create = (id: number) => ({
                id,
                joinedAt: time.unix(),
                seal() {
                    const leftAt = time.unix();
                    return Object.freeze({
                        id: this.id,
                        joinedAt: this.joinedAt,
                        leftAt,
                        stayTime: leftAt - this.joinedAt,
                    });
                }
            });
        }

        export const create = () => {
            const players = new Map<number, PlayerRecord>();

            return {
                reset: () => players.clear(),
                track: (id: number) => {
                    players.set(id, PlayerRecord.create(id));
                },
                untrack: (id: number) => {
                    const record = players.get(id)?.seal() ?? null;
                    players.delete(id);
                    return record;
                },
            };
        }
    }
    //#endregion

    //#region stay-time
    type Config = {
        conn: API_Connector,
        core: Core,
    };

    export const create = ({ conn, core }: Config) => {
        const tracker = Tracker.create();

        return {
            reset: () => {
                Shared.log(["StayTime", "reset"]);
                tracker.reset();
            },
            begin: (char: API_Character) => {
                if (!core.players.canHaveBounty(char.MemberNumber).ok)
                    return;

                tracker.track(char.MemberNumber);
                const bounty = core.bounties.get(char.MemberNumber);
                if ((!bounty || !bounty.reasons.find(r => r.kind === "Room Hop"))) {
                    conn.SendMessage(
                        "Whisper",
                        __.events.room_hop.warning,
                        char.MemberNumber,
                    );
                }
            },
            end: (char: API_Character, intentional: boolean) => {
                const record = tracker.untrack(char.MemberNumber);
                if (!intentional || !record) return;
                if (record.stayTime < 10) {
                    const bounty = core.bounties.punishments.place(char.MemberNumber, "Room Hop");
                    if (bounty)
                        conn.SendMessage(
                            "Chat",
                            __.events.room_hop.bounty(core.bounties.punishments["Room Hop"].gold, char.MemberNumber),
                        );
                }
            },
        };
    };
    //#endregion
}

export default StayTime;