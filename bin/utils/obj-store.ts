import fs from "node:fs";
import path from "node:path";
import { str, obj as _obj, DeepPartial } from "./common";

type ObjStoreOptions<T extends object> = {
    name: string,
    file: {
        path: string,
    },
    data: {
        default: T,
    },
    options?: Partial<{
        queueUpdateMs: number,
    }>
};

type ObjStore<T extends object> = ReturnType<typeof ObjStore.create<T>>;

const ObjStore = {
    create: <T extends object>({
        name, file, data,
        options = {
            queueUpdateMs: 0,
        },
    }: ObjStoreOptions<T>) => {
        //#region defaults
        options ??= {};
        options.queueUpdateMs ??= 0;
        //#endregion

        const prefix = `[ObjStore(${name})]:`;
        
        //#region rw
        const writeObj = (obj: T): T => {
            const tmpPath = `${Math.random().toString(36)}.tmp`;
            try {
                fs.writeFileSync(tmpPath, JSON.stringify(obj, null, 4), 'utf8');
                fs.renameSync(tmpPath, file.path);
            } catch (e) {
                console.error(prefix, "FUNC(writeObj):", "failed to write object", e);
                try {
                    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
                } catch (e) {
                    console.error(prefix, "FUNC(writeObj):", "failed to remove tmp file", e);
                }
            }
            return obj;
        };

        const readObj = (): T => {
            const string = fs.readFileSync(file.path, 'utf8');
            return JSON.parse(string);
        };
        //#endregion

        //#region update
        const pushUpdate = (obj: T) => {
            console.info(prefix, "FUNC(update<push>):", str.truncate(obj));
            writeObj(obj);
        }

        let updateRequest: ReturnType<typeof createUpdateRequest> | null = null;
        const createUpdateRequest = (obj: T) => {
            console.info(prefix, "FUNC(update<queue>)");
            if (updateRequest) updateRequest.cancel();

            const runUpdate = () => pushUpdate(obj);
            const timer = setTimeout(runUpdate, options.queueUpdateMs);

            const cancel = () => {
                clearTimeout(timer);
                updateRequest = null;
            };
            return {
                cancel: () => cancel,
                flush: () => {
                    console.info(prefix, "FUNC(update<flush>)");
                    cancel();
                    runUpdate();
                },
            };
        };
        const queueUpdate = (obj: T) => {
            if (options.queueUpdateMs === 0) return pushUpdate(obj);
            updateRequest = createUpdateRequest(obj);
        };
        //#endregion

        //#region (sanity check)
        (() => {
            const { dir } = path.parse(file.path);
            if (!fs.existsSync(dir || ".")) {
                console.info(prefix, "FUNC(create):", "store directory not found, creating recursively");
                fs.mkdirSync(dir, { recursive: true });
            }
            if (!fs.existsSync(file.path)) {
                console.info(prefix, "FUNC(create):", "store not found, creating with default");
                writeObj(data.default);
            }
            const obj = readObj();
            const numMissingProperties =_obj.deep.fill(data.default, obj);
            if (numMissingProperties) {
                console.info(prefix, "FUNC(create):", `found ${numMissingProperties} missing keys, updating missing keys with defaults`);
                writeObj(obj);
            }
        })();
        //#endregion

        return {
            load: readObj,
            update: queueUpdate,
            flush: () => {
                updateRequest?.flush();
            },
        };
    },
};

export default ObjStore;