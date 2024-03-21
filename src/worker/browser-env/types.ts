import { HERMIONE_WORKER_EVENT_SUFFIX } from "./constants";
import type { CustomPayload } from "vite";
import type { ViteWorkerCommunicator } from "./communicator";
import type { RuntimeConfig } from "../../config/types";

export enum WorkerEventNames {
    init = `${HERMIONE_WORKER_EVENT_SUFFIX}:init`,
    runRunnable = `${HERMIONE_WORKER_EVENT_SUFFIX}:runRunnable`,
}

export interface WorkerInitPayload extends CustomPayload {
    event: WorkerEventNames.init;
    data: {
        pid: number;
    };
}

export interface WorkerRunRunnablePayload extends CustomPayload {
    event: WorkerEventNames.runRunnable;
    data: {
        pid: number;
        runUuid: string;
        cmdUuid: string;
        fullTitle: string;
    };
}

export type WorkerPayload = WorkerInitPayload | WorkerRunRunnablePayload;

export interface BrowserEnvRuntimeConfig extends RuntimeConfig {
    viteWorkerCommunicator: ViteWorkerCommunicator;
}
