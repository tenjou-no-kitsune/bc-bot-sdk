
//#region Shared
/** @desc ~ module containing globally shared symbols */
export namespace Shared {
    export type Config = {
        namespace: string,
    };

    export const log = (ctx: [module?: string, scope?: string], ...args: Parameters<typeof console.log>[number][]) => {
        const [module, scope] = ctx;
        console.info(`${
            // namespace
            "Bounty" + (module ? `.${module}` : ``)
            }${ // scope
            scope ? `(${scope})` : ``
            }${ // if needed :
            args.length ? `:` : ``
            }`,
            ...args
        );
    };
}
//#endregion

//#region Util
import { ObjStore, ObjStoreOptions } from "../../utils";

export type Util = ReturnType<typeof Util.create>;

/** @desc ~ module containing shared utils (i.e., db) */
export namespace Util {

    type DB = ReturnType <typeof DB.create>;
    namespace DB {
        const getStoreIdentifiers = (namespace: string, name: string): Pick<ObjStoreOptions<never>, "name" | "file"> => ({
            name: `${namespace}/bcb<${name}>`,
            file: { path: `${namespace}/bcb/${name}.json` },
        });

        export const create = () => {
            const stores = new Set<ObjStore<any>>();;

            return {
                flush: () => {
                    for (const store of stores) {
                        store.flush();
                    }
                },
                getStoreIdentifiers,
                createStore: <T extends object>(opts: ObjStoreOptions<T>) => {
                    const store = ObjStore.create(opts);
                    stores.add(store);
                    return store;
                },
                createKeyedCollection: <T extends object>(namespace: string, name: string) => {
                    const store = ObjStore.KeyedCollection.create<T>({
                        ...getStoreIdentifiers(namespace, name),
                        options: {
                            queueUpdateMs: 500,
                        },
                    });
                    stores.add(store);

                    return ObjStore.KeyedCollection.wrap(store);
                },
            };
        };
    }

    export const create = () => ({
        db: DB.create(),
    });
}
//#endregion

//#region Common
import { map } from "../../utils";

export type Common = ReturnType<typeof Common.create>;

/** @desc ~ module containing common config (i.e., areas/tiles) */
export namespace Common {
    type Areas = {
        Shop: ReturnType<typeof map.createArea>,
        Claim: ReturnType<typeof map.createArea>,
        BountyTarget: ReturnType<typeof map.createArea>,
        Prison: ReturnType<typeof map.createTileList>,
        Lobby: ReturnType<typeof map.createArea>,
    };
    export type Config = {
        defAreas: (helpers: {
            defArea: typeof map.createArea,
            defTileList: typeof map.createTileList
        }) => Areas,
    };

    export const create = ({ defAreas }: Config) => ({
        areas: Object.freeze(
            defAreas({
                defArea: map.createArea,
                defTileList: map.createTileList
            })  
        ),
    });
}
//#endregion