import { StringLiteral } from "../utils";

export type MixinConstructor<TConstraints = {}, TArgs extends any[] = any[]> = new (...args: TArgs) => TConstraints;

export type MixinOptions<TKey extends string, TOptions = {}> = {
    mixins: {
        [K in StringLiteral<TKey>]: TOptions
    },
};