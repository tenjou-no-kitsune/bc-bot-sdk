import { ret } from "../../utils";

import __ from "./strings";
import { Shared, Util } from "./_shared";


type Shop = ReturnType<typeof Shop.create>;

/** @desc ~ module containing shop storage and management */
namespace Shop {
    export type Favor = { name: string, cost: number };

    export type Config = Shared.Config & { util: Util };

    export const create = ({ namespace, util }: Config) => {
        let catalogue = {
            favors: [] as Favor[],
        };
    
        const store = {
            handle: util.db.createStore({
                ...util.db.getStoreIdentifiers(namespace, "shop"),
                data: { default: catalogue },
                options: {
                    queueUpdateMs: 500,
                },
            }),
            favors: {
                update: (updateFunc: (favors: Favor[]) => void) => {
                    updateFunc(catalogue.favors);
                    catalogue.favors.sort((f1, f2) => f1.cost - f2.cost);
                    store.handle.update(catalogue);
                },
            },
        };
        catalogue = store.handle.load();
    
        return {
            favors: {
                add: (favor: Favor) => {
                    if (catalogue.favors.find(f => f.name === favor.name)) return ret.err("already exists in store");
                    store.favors.update((favors) => favors.push(favor));
                    return ret.ok();
                },
                remove: (index: number) => {
                    if (!catalogue.favors[index]) return ret.err(__.shop.err.non_existent_index);
                    const favor = catalogue.favors[index];
                    store.favors.update((favors) => favors.splice(index, 1));
                    return ret.ok(favor);
                },
                get list() { return catalogue.favors; }
            },
        };
    };
}

export default Shop;