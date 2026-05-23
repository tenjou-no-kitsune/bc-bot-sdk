import { as, ensure } from "../../utils";

import __ from "./strings";
import { Shared, Util } from "./_shared";

type Roles = ReturnType<typeof Roles.create>;

/** @desc ~ module containing role management helpers with dynamically modifiable lists */
namespace Roles {

    //#region lists
    namespace Lists {
        type Title = Fixed.Title | Dynamic.Title;
        type MappedIds = (number[] | (() => number[])) & { _name: string };

        export namespace Fixed {
            export type Title = typeof titles[number];
            const titles = ["SuperAdmin", "GoldManager", "BountyManager"] as const;

            const makeIds = (name: string, ids: number[]) => Object.assign(ids, {
                _name: name,
            });

            type Entries<T> = Record<Title, T>;
            export type Registry = Entries<number[]>;
            export namespace Registry {
                export type Mapped = Entries<MappedIds>;
            }
            export const create = (membersOf: Registry): Entries<MappedIds> =>
                Object.freeze({
                    SuperAdmin: makeIds(__.roles.names.super_admin, membersOf.SuperAdmin),
                    GoldManager: makeIds(__.roles.names.gold_manager, membersOf.GoldManager),
                    BountyManager: makeIds(__.roles.names.bounty_manager, membersOf.BountyManager),
                });
        }

        export namespace Dynamic {
            export type Key = typeof keys[number];
            export type Title = typeof titles[Key];
            const keys = ["immunity", "admin", "dom"] as const;
            const titles = {
                admin: "Admin",
                dom: "Dom",
                immunity: "Immune",
            } as const satisfies Entries<string>;

            type Entries<T> = Record<Key, T>;
            export type Registry = Entries<number[]>;
            export const createInitial = (scaffold: Partial<Registry>) =>
                keys.reduce(
                    (acc, name) => {
                        acc[name] = [...(scaffold[name] ?? [])];
                        return acc;
                    },
                    <Registry>{}
                );
        }

        export namespace Mapping {
            type Config = {
                registry: {
                    fixed: Fixed.Registry.Mapped,
                    dynamic: Dynamic.Registry,
                },
            };

            export const create = ({ registry }: Config) => {
                const createRoleList = (name: string, key: Lists.Dynamic.Key): MappedIds =>
                    Object.assign(() => registry.dynamic[key], { _name: name });

                const reference: Record<Title, MappedIds> = {
                    ...registry.fixed,
                    Admin: createRoleList(__.roles.names.admin, "admin"),
                    Dom: createRoleList(__.roles.names.dom, "dom"),
                    Immune: createRoleList(__.roles.names.immune, "immunity"),
                };
                const entries = as<[Title, MappedIds][]>(Object.entries(reference));

                return Object.assign(
                    <Record<Title, string>>Object.fromEntries(entries.map(([key, list]) => [key, list._name])), {
                        mapping: Object.fromEntries(entries.map(([, list]) => [list._name, list])),
                    },
                );
            };
        }
    }
    //#endregion

    //#region store
    type Store = ReturnType<typeof Store.create>;
    namespace Store {
        type Config = Shared.Config & {
            util: Util,
            data: {
                initial: Lists.Dynamic.Registry,
            },
        };

        type List = ReturnType<typeof createListWrapper>;
        const createListWrapper = (
            store: {
                registry: Lists.Dynamic.Registry,
                sync: () => void
            },
            key: Lists.Dynamic.Key
        ) => ({
            get() { return store.registry[key]; },
            add(id: number): readonly number[] {
                if (store.registry[key].includes(id)) return [];
                store.registry[key].push(id);
                store.registry[key].sort();
                store.sync();
                return store.registry[key];
            },
            has(id: number) { return store.registry[key].includes(id)},
            remove(id: number): readonly number[] {
                store.registry[key] = store.registry[key].filter(i => i !== id);
                store.sync();
                return store.registry[key];
            },
        });

        export const create = ({ namespace, util, data }: Config) => {
            const handle = util.db.createStore({
                ...util.db.getStoreIdentifiers(namespace, "roles"),
                data: { default: data.initial },
                options: {
                    queueUpdateMs: 500,
                },
            });

            const store = {
                handle,
                registry: handle.load(),
                sync: () => handle.update(store.registry),
            };

            return Object.assign(store, {
                lists:
                    as<Lists.Dynamic.Key[]>(Object.keys(store.registry))
                        .reduce(
                            (acc, key) => {
                                acc[key] = createListWrapper(store, key);
                                return acc;
                            },
                            <Record<Lists.Dynamic.Key, List>>{}
                        ),
            });
        };
    }
    //#endregion

    //#region api
    export namespace Config {
        export type Additions = {
            membersOf: Lists.Fixed.Registry,
        };
    }
    export type Config = Shared.Config & Config.Additions & { util: Util };

    export const create = ({ namespace, membersOf, util }: Config) => {
        const registry = {
            fixed: Lists.Fixed.create(membersOf),
            dynamic: Lists.Dynamic.createInitial({ admin: [...membersOf.SuperAdmin] })
        };

        const store = Store.create({
            namespace, util,
            data: { initial: registry.dynamic }}
        );
    
        return {
            ...Lists.Mapping.create({
                registry: {
                    fixed: registry.fixed,
                    dynamic: store.registry,
                },
            }),
            lists: store.lists,
        };
    };
    //#endregion
}

export default Roles;