import logger from "../../../utils/logger";
import { isBrowserMessage, isWorkerMessage } from "./utils";
import { WorkerEventNames } from "../../../worker/browser-env/types";
import { BrowserEventNames, type BrowserPayload } from "./types";
import type { WebSocketServer, WebSocket } from "vite";
import type { WorkerPayload, WorkerRunRunnablePayload } from "../../../worker/browser-env/types";

export class BrowserWorkerCommunicator {
    #viteWs: WebSocketServer;
    #browserWsByRunUuid: Map<string, WebSocket>;
    #workerWsByPid: Map<number, WebSocket>;

    static create<T extends BrowserWorkerCommunicator>(
        this: new (viteWs: WebSocketServer) => T,
        viteWs: WebSocketServer,
    ): T {
        return new this(viteWs);
    }

    constructor(viteWs: WebSocketServer) {
        this.#viteWs = viteWs;
        this.#browserWsByRunUuid = new Map();
        this.#workerWsByPid = new Map();
    }

    handleMessages(): void {
        this.#viteWs.on("connection", ws => {
            ws.on("message", rawMsg => {
                const msg = JSON.parse(rawMsg.toString()) as BrowserPayload | WorkerPayload;

                if (isBrowserMessage(msg)) {
                    this.#handleBrowserMessages(msg, ws);
                    return;
                }

                if (isWorkerMessage(msg)) {
                    this.#handleWorkerMessages(msg, ws);
                    return;
                }
            });
        });
    }

    #handleBrowserMessages(msg: BrowserPayload, ws: WebSocket): void {
        if (msg.event === BrowserEventNames.init) {
            this.#registerBrowserWsConnection(msg, ws);
            return;
        }

        if (msg.event === BrowserEventNames.runnableResult) {
            this.#sendMsgToWorker(msg);
            return;
        }
    }

    #handleWorkerMessages(msg: WorkerPayload, ws: WebSocket): void {
        if (msg.event === WorkerEventNames.init) {
            this.#registerWorkerWsConnection(msg.data.pid, ws);
            return;
        }

        if (msg.event === WorkerEventNames.runRunnable) {
            this.#sendMsgToBrowser(msg);
            return;
        }
    }

    #registerBrowserWsConnection(msg: BrowserPayload, ws: WebSocket): void {
        if (this.#browserWsByRunUuid.has(msg.data.runUuid)) {
            return;
        }

        this.#browserWsByRunUuid.set(msg.data.runUuid, ws);
        this.#sendMsgToWorker(msg);
    }

    #registerWorkerWsConnection(pid: number, ws: WebSocket): void {
        if (this.#workerWsByPid.has(pid)) {
            return;
        }

        this.#workerWsByPid.set(pid, ws);
    }

    #sendMsgToWorker(msg: BrowserPayload): void {
        const wsConnection = this.#workerWsByPid.get(msg.data.pid);

        if (!wsConnection) {
            logger.warn(`Cannot find worker websocket connection by pid: ${msg.data.pid}`);
            return;
        }

        wsConnection.send(JSON.stringify(msg));
    }

    #sendMsgToBrowser(msg: WorkerRunRunnablePayload): void {
        const wsConnection = this.#browserWsByRunUuid.get(msg.data.runUuid);

        if (!wsConnection) {
            logger.warn(`Cannot find browser websocket connection by runUuid: ${msg.data.runUuid}`);
            return;
        }

        wsConnection.send(JSON.stringify(msg));
    }
}
