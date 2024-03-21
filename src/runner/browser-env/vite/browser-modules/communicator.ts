import { prepareError } from "./errors/index.js";
import { BrowserEventNames, BrowserMessage, WorkerEventNames, WorkerMessage } from "./types.js";

export class ViteBrowserCommunicator {
    static create<T extends ViteBrowserCommunicator>(this: new () => T): T {
        return new this();
    }

    subscribeOnMessage(event: WorkerEventNames, handler: (msg: WorkerMessage) => Promise<void>): void {
        import.meta.hot?.on(event, handler);
    }

    sendMessage(event: BrowserEventNames, msg?: Partial<BrowserMessage>): void {
        if (msg && msg.errors) {
            msg.errors = msg.errors.map(prepareError);
        }

        import.meta.hot?.send(event, {
            pid: window.__hermione__.pid,
            runUuid: window.__hermione__.runUuid,
            cmdUuid: window.__hermione__.cmdUuid,
            errors: [],
            ...msg,
        });
    }
}
