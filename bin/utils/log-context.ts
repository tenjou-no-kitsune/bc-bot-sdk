import fs from "node:fs";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";

const METHODS = ["log", "error", "warn", "info", "debug"] as const;

export type LogLevel = (typeof METHODS)[number];

export type LogLevels = Set<LogLevel>;

export const deriveLogLevels = (level: LogLevel) => new Set(METHODS.slice(0, METHODS.indexOf(level) + 1));

type LogContextStore = {
    path: string;
    prefix: string;
};

type LogContextProperties = {
    setLogLevel: (level: LogLevel) => void;
};

type LogContext = AsyncLocalStorage<LogContextStore> & LogContextProperties;

const LogFileManager = (() => {
    const MAX_LOG_SIZE = 10 * 1024 * 1024;
    /** @desc map of logical path to real paths sorted by latest last */
    const activeLogPaths: Record<string, string[]> = {};

    const initLogPath = (logicalPath: string) => {
        if (logicalPath in activeLogPaths) return;
        const { dir, name } = path.parse(logicalPath);
        if (!fs.existsSync(dir || ".")) fs.mkdirSync(dir, { recursive: true });

        const nameRE = new RegExp(`^${name}\\.\\d{4}-\\d{2}-\\d{2}\\.\\d{2}-\\d{2}-\\d{2}\\.log$`);
        activeLogPaths[logicalPath] =
            fs.readdirSync(dir || ".")
                .filter(f => nameRE.test(f))
                .map(f => path.join(dir, f))
                .sort();
    };

    const getTimestampSuffix = () => {
        let [date, time] = new Date().toISOString().split('T');
        time = time.slice(0, time.indexOf(".")).replaceAll(":", "-");
        return `${date}.${time}`;
    };

    const addNewLogPath = (logicalPath: string) => {
        const { dir, name } = path.parse(logicalPath);
        activeLogPaths[logicalPath].push(path.join(dir, `${name}.${getTimestampSuffix()}.log`));
    };

    return {
        getLogPath: (logicalPath: string) => {
            if (!(logicalPath in activeLogPaths)) initLogPath(logicalPath);
            const lastPath = activeLogPaths[logicalPath].at(-1);
            if ((lastPath && fs.statSync(lastPath).size > MAX_LOG_SIZE) || (!lastPath)) addNewLogPath(logicalPath);
            return activeLogPaths[logicalPath].at(-1);
        },
    };
})();

export default (() => {
    let context = new AsyncLocalStorage<LogContextStore>() as LogContext;

    let logLocks: Record<string, Promise<void>> = {};
    const log = (path: string, entry: string) => {
        logLocks[path] = (logLocks[path] ?? Promise.resolve()).then(() => {
            try {
                fs.appendFileSync(LogFileManager.getLogPath(path)!, entry);
            } catch (err) {
                process.stderr.write(`log error: ${(err as Error).message}\n`);
            }
        });
    };

    const getCircularReplacer = () => {
        const seen = new WeakSet();
        return (_key: string, value: any) => {
            if (typeof value === "object" && value !== null) {
                if (seen.has(value)) return;
                seen.add(value);
            }
            return value;
        };
    };

    let logLevel: LogLevel = "debug";
    let loggedMethods: Set<LogLevel> = new Set();
    context = Object.assign<LogContext, LogContextProperties>(context, {
        setLogLevel: (level) => {
            logLevel = level;
            loggedMethods = deriveLogLevels(logLevel);
        }
    });
    context.setLogLevel("debug");

    METHODS.forEach(method => {
        const original = console[method];
        
        console[method] = (...args: Parameters<typeof console.log>[number][]) => {
            if (!loggedMethods.has(method)) return;
            const store = context.getStore();
    
            args.unshift(`${method.toUpperCase()}${store && `(${store.prefix})` || ""}:`); // prefix
            args.unshift(`[${new Date().toISOString()}]`); // timestamp
    
            if (store) {
                const message = args.map(arg =>
                    typeof arg === 'object'
                        ? JSON.stringify(arg, getCircularReplacer())
                        : arg
                ).join(' ');

                log(store.path, `${message}\n`);
                if (method === "log") return;
            }
    
            args = args.map(a => JSON.parse(JSON.stringify(a, getCircularReplacer())));
            original.apply(console, args);
        };
    });

    return context;
})();