
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

export const obj = <T extends object>(obj: T) => ({
    keys: () => Object.keys(obj) as (keyof T)[],
});

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
