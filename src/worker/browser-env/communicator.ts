import WebSocket from "ws";
import URI from "urijs";
import { WorkerEventNames } from "./types";
import logger from "../../utils/logger";

import type { SetOptional } from "type-fest";
import type { Config } from "../../config";
import type { WorkerPayload } from "./types";

import type { BrowserPayload } from "../../runner/browser-env/vite/types";

interface WaitMessageOpts {
    cmdUuid: string;
    timeout?: number;
    interval?: number;
}

const WS_CONNECTION_TIMEOUT = 5000;
const WAIT_MESSAGE_TIMEOUT = 5000;
const WAIT_MESSAGE_INTERVAL = 100;

export class ViteWorkerCommunicator {
    readonly #config: Config;
    #workerWs: WebSocket;
    #recievedMsgs: Map<string, BrowserPayload>;

    static create<T extends ViteWorkerCommunicator>(this: new (config: Config) => T, config: Config): T {
        return new this(config);
    }

    constructor(config: Config) {
        this.#config = config;
        this.#recievedMsgs = new Map();

        const viteWsUrl = new URI(this.#config.baseUrl).protocol("ws").toString();
        this.#workerWs = new WebSocket(viteWsUrl, "vite-hmr");

        this.#handleMessages();
    }

    #handleMessages(): void {
        const timerId = setTimeout(() => {
            throw new Error(`Could't open ws connection to Vite for ${WS_CONNECTION_TIMEOUT} seconds`);
        }, WS_CONNECTION_TIMEOUT);

        this.#workerWs.on("error", err => {
            throw err;
        });

        this.#workerWs.on("close", (code, reason) => {
            throw new Error(`Websocket connection to Vite is closed with code: ${code} and reason: ${reason}`);
        });

        this.#workerWs.on("open", () => {
            clearTimeout(timerId);

            this.sendMessage({ event: WorkerEventNames.init, data: { pid: process.pid } });
        });

        this.#workerWs.on("message", buff => {
            let msg: BrowserPayload | undefined;

            try {
                msg = JSON.parse(buff.toString()) as BrowserPayload;
            } catch (err) {
                logger.warn(`Cannot parse message: ${buff.toString()}`);
                return;
            }

            if (msg?.data?.cmdUuid) {
                this.#recievedMsgs.set(msg.data.cmdUuid, msg);
            }
        });
    }

    sendMessage(payload: SetOptional<WorkerPayload, "type">): void {
        this.#workerWs.send(JSON.stringify({ type: "custom", ...payload }));
    }

    async waitMessage({
        cmdUuid,
        timeout = WAIT_MESSAGE_TIMEOUT,
        interval = WAIT_MESSAGE_INTERVAL,
    }: WaitMessageOpts): Promise<BrowserPayload> {
        return new Promise((resolve, reject) => {
            const timerId =
                timeout > 0
                    ? setTimeout(() => {
                          reject(new Error(`Didn't wait for message from browser in ${timeout} seconds`));
                      }, timeout)
                    : 0;

            const intervalId = setInterval(() => {
                const msg = this.#recievedMsgs.get(cmdUuid);

                if (!msg) {
                    return;
                }

                clearTimeout(timerId);
                clearInterval(intervalId);

                this.#recievedMsgs.delete(cmdUuid);

                resolve(msg);
            }, interval);
        });
    }
}
