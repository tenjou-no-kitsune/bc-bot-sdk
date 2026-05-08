
export const isValidNumber = (str: string) =>
    parseInt(str, 10) === Number(str);

export const as = <T>(val: unknown): T => val as T;

export const withReason = <T = false>(reason: string, obj?: T) => Object.assign(obj ?? false, { reason });

export type Satisfies<T> = T & Record<string, unknown>;

// obj utility helpers
namespace DeepUtils {
    type OnProperty<T> = (key: string, val: unknown, obj: Obj) => T;
    type Walk = {
        (src: Obj, dst: Obj, onProperty: OnProperty<void>): void;
        <T>(src: Obj, dst: Obj, onProperty: OnProperty<T>, reducer: (acc: T, next: T) => T, initial: T): T;
    };

    export const deep = (() => {
        const walk: Walk = <T = void>(
            src: Obj, dst: Obj,
            onProperty: OnProperty<T>,
            reducer?: (acc: T, next: T) => T,
            initial?: T
        ): T | void => {
            let result = initial;
            for (const [key, val] of Object.entries(src)) {
                const ret = onProperty(key, val, dst);
                if (reducer && result !== undefined)
                    result = reducer(result, ret);
            }
            return result;
        };

        const fill = <T extends Obj>(defaults: T, target: T): number => walk(
            defaults, target,
            (inKey, inVal, outObj) => {
                const inIsObj = obj.is(inVal);
                if (inKey in outObj) {
                    if (inIsObj) return fill(inVal, outObj[inKey]);
                    return 0;
                }
                if (inIsObj) {
                    outObj[inKey] = {};
                    return 1 + fill(inVal, outObj[inKey]);
                }
                outObj[inKey] = inVal;
                return 1;
            },
            (acc, fillCount) => acc + fillCount,
            0,
        );

        const apply = <T extends Obj>(patch: DeepPartial<T>, target: T): T => {
            walk(patch, target, (inKey, inVal, outObj) => {
                const outVal = outObj[inKey];
                if (obj.is(inVal) && obj.is(outVal)) {
                    apply(inVal, outVal);
                } else {
                    outObj[inKey] = inVal;
                }
            });
            return target;
        };
        
        return { fill, apply };
    })();
}

type Obj = Record<string, any>;
export const obj = Object.assign(
    <T extends object>(obj: T) => ({
        keys: () => Object.keys(obj) as (keyof T)[],
    }), {
        is: (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v),
        deep: DeepUtils.deep,
    },
);

export type StringLiteral<T> = T extends `${string & T}` ? T : never;
export const str = Object.assign(
    (val: unknown): string => {
        switch (typeof val) {
            case "string": return val;
            case "number": return val.toString();
            default: return JSON.stringify(val).replaceAll('"', '');
        }
    }, {
        parse: (str: string | null | undefined, fallback: string = "") => {
            if (typeof str === "string" && str === "") str = null;
            return (str ?? fallback);
        },
        truncate: (data: unknown, limit: number = 4096): string => {
            const str = typeof data === 'string' ? data : JSON.stringify(data);
            const buf = Buffer.from(str, 'utf8');
            
            if (buf.length <= limit) return str;
            return buf.subarray(0, limit).toString('utf8') + `... [TRUNCATED AT ${limit}B]`;
        },
    }
);

export const areArraysEqual = <T>(arr1: T[], arr2: T[]) => {
    return JSON.stringify(arr1) === JSON.stringify(arr2);
};

export const pickRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export type DeepPartial<T> = T extends Function 
    ? T : T extends object 
        ? { [P in keyof T]?: DeepPartial<T[P]> } 
        : T;

export const time = {
    unix: () => Math.floor(Date.now() / 1000),
    formatSecs: (seconds: number) => {
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);

        const parts = [d, h, m, s] as const;
        const partUnits = ["d", "h", "m", "s"] as const;
        const strParts = parts.map(part => String(part).padStart(2, "0"));

        let str = "";
        let include = false;
        parts.forEach((part, idx) => {
            if (!part && !include) return;
            if (part && !include) include = true;
            str += `${strParts[idx]}${partUnits[idx]}`;
        });
        return str;
    },
};
