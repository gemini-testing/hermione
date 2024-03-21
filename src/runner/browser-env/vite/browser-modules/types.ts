import { HERMIONE_BROWSER_EVENT_SUFFIX, HERMIONE_WORKER_EVENT_SUFFIX } from "./constants.js";
import { BrowserError, type AvailableError } from "./errors/index.js";

declare global {
    interface Window {
        Mocha: Mocha;
        __hermione__: {
            pid: number;
            file: string;
            runUuid: string;
            cmdUuid: string;
            errors: BrowserError[];
        };
        hermione: typeof Proxy;
    }
}

export enum BrowserEventNames {
    init = `${HERMIONE_BROWSER_EVENT_SUFFIX}:init`,
    runnableResult = `${HERMIONE_BROWSER_EVENT_SUFFIX}:runnableResult`,
}

export interface BrowserMessage {
    pid: number;
    runUuid: string;
    cmdUuid: string;
    errors: AvailableError[];
}

// TODO: use from nodejs code when migrate to esm
export enum WorkerEventNames {
    init = `${HERMIONE_WORKER_EVENT_SUFFIX}:init`,
    runRunnable = `${HERMIONE_WORKER_EVENT_SUFFIX}:runRunnable`,
}

export interface WorkerMessage {
    pid: number;
    runUuid: string;
    cmdUuid: string;
    fullTitle: string;
}

export interface WorkerRunRunnablePayload {
    type: "custom";
    event: WorkerEventNames.runRunnable;
    data: {
        pid: number;
        uuid: string;
        fullTitle: string;
    };
}
