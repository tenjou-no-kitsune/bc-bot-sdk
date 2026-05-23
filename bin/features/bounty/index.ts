export { default as __ } from "./strings";

import {
    Shared as _Shared,
    Util as _Util,
    Common as _Common,
} from "./_shared";
import _Pending from "./pending";
import _Roles from "./roles";
import _Prison from "./prison";
import _Shop from "./shop";
import _Core from "./core";
import _StayTime from "./stay-time";

/** @desc ~ modules in relation to bounty features */
namespace BCB {
    // _shared.ts
    export import Shared = _Shared;
    export import Util = _Util;
    export import Common = _Common;

    // pending.ts
    export import Pending = _Pending;

    // roles.ts
    export import Roles = _Roles;

    // prison.ts
    export import Prison = _Prison;

    // shop.ts
    export import Shop = _Shop;

    // core.ts
    export import Core = _Core;

    // stay-time.ts
    export import StayTime = _StayTime;
};

export default BCB;