import { CommandContext } from "../../mixins";

type Pending = ReturnType<typeof Pending.create>;

/** @desc ~ module handling pending commands (i.e., confirm/respond) */
namespace Pending {

    namespace Registry {

        type Action = {
            run: (ctx: CommandContext, ...params: any[]) => void,
            cancel: () => void,
        };
        namespace Action {
            export namespace Factory {
                export const make = (opts: { onCancel: (caller: number) => void }) => {
                    return {
                        create: <TActionArgs extends any[]>(
                            caller: number,
                            callback: (ctx: CommandContext, ...args: TActionArgs) => void,
                            onTimeout: (run: typeof callback) => void = () => {},
                        ): Action => {
            
                            const cancel = () => {
                                clearTimeout(expiry)
                                opts.onCancel(caller);
                            };

                            const expiry: NodeJS.Timeout = setTimeout(() => {
                                onTimeout(callback);
                                cancel();
                            }, 10 * 1000);
                
                            return {
                                run: (...params: Parameters<typeof callback>) => {
                                    callback(...params);
                                    cancel();
                                },
                                cancel,
                            };
                        }
                    };
                };
            }
        }

        export const create = () => {
            const actions = new Map<number, Action>();
            const factory = Action.Factory.make({
                onCancel: (caller) => {
                    actions.delete(caller);
                },
            });

            return {
                get: (caller: number) => actions.get(caller) ?? null,
                queue: <TActionArgs extends any[]>(...params: Parameters<typeof factory.create<TActionArgs>>) => {
                    actions.set(params[0], factory.create<TActionArgs>(...params));
                },
                purge: () => {
                    actions.forEach((action) => {
                        action.cancel();
                    });
                },
            };
        };
    }

    export const create = () => {
        const registries = {
            confirm: Registry.create(),
            response: Registry.create(),
        };

        const purge = () => {
            Object.values(registries).forEach(reg => {
                reg.purge();
            });
        };
    
        return {
            ...registries,
            purge,
        };
    };
}

export default Pending;