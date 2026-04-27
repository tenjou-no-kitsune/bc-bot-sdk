// @ts-ignore
import { API_Character } from "bc-bot";
import { parseString } from "./common";

export const parseApiCharObj = (obj: API_Character) => {
    const { Name, NickName, MemberNumber } = obj;
    const name = parseString(NickName, Name);
    return {
        name: name,
        number: MemberNumber,
        username: Name,
        nickname: NickName,
    };
};