import { CommandsMixin, WithCommands } from "./command-handler";
import { UWallMixin, WithUWall } from "./uwall";

export * from "./types";
export * from "./command-handler";

type AggregatedMixinOptions = CommandsMixin.Options & UWallMixin.Options;
export type PartialMixinOptions = {
    mixins?: Partial<AggregatedMixinOptions["mixins"]>;
};

export const ProviderMixins = {
    [CommandsMixin.Id]: WithCommands,
    [UWallMixin.Id]: WithUWall,
};