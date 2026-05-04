
export const parseString = (str: string | null | undefined, fallback: string = "") => {
    if (typeof str === "string" && str === "") str = null;
    return (str ?? fallback);
}

export const isValidNumber = (str: string) =>
    parseInt(str, 10) === Number(str);

export const as = <T>(val: unknown): T => val as T;

export const withReason = <T = false>(reason: string, obj?: T) => Object.assign(obj ?? false, { reason });

export type Satisfies<T> = T & Record<string, unknown>;
export type StringLiteral<T> = T extends `${string & T}` ? T : never;

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

export const truncate = (data: any): string => {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    const buf = Buffer.from(str, 'utf8');
    
    if (buf.length <= 4096) {
        return str;
    }
    return buf.subarray(0, 4096).toString('utf8') + "... [TRUNCATED AT 4KB]";
}

export const areArraysEqual = <T>(arr1: T[], arr2: T[]) => {
    return JSON.stringify(arr1) === JSON.stringify(arr2);
};

export const pickRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export type DeepPartial<T> = T extends Function 
    ? T : T extends object 
        ? { [P in keyof T]?: DeepPartial<T[P]> } 
        : T;
