import { TestParser } from "./parser.js";
import { ViteBrowserCommunicator } from "../communicator.js";
import { findErrorsOnPageLoad, findErrorsOnRunRunnable, BrowserError } from "../errors/index.js";
import { BrowserEventNames, WorkerEventNames, type WorkerMessage } from "../types.js";

export class MochaWrapper {
    #communicator: ViteBrowserCommunicator = ViteBrowserCommunicator.create();
    #runnables: Map<string, Mocha.Runnable> = new Map();
    #parser: TestParser;

    static create<T extends MochaWrapper>(this: new () => T): T {
        return new this();
    }

    constructor() {
        this.#validate();

        this.#parser = TestParser.create();
    }

    async init(): Promise<void> {
        mocha.setup("bdd");

        this.#subscribeOnWorkerMessages();

        try {
            await this.#parser.loadFile(window.__hermione__.file, runnable => {
                this.#runnables.set(runnable.fullTitle(), runnable);
            });
        } catch (err) {
            window.__hermione__.errors.push(BrowserError.create(err as Error));
        }

        this.#communicator.sendMessage(BrowserEventNames.init, {
            errors: findErrorsOnPageLoad(),
        });
    }

    #validate(): never | void {
        if (!window.Mocha) {
            const error = BrowserError.create({
                message: "Can't find Mocha inside hermione dependencies. Try to reinstall hermione.",
            });
            this.#communicator.sendMessage(BrowserEventNames.init, { errors: [error] });

            throw error;
        }
    }

    #subscribeOnWorkerMessages(): void {
        this.#communicator.subscribeOnMessage(WorkerEventNames.runRunnable, async (msg: WorkerMessage) => {
            const runnableToRun = this.#runnables.get(msg.fullTitle);

            if (!runnableToRun) {
                const error = BrowserError.create({
                    message: `Can't find a runnable with the title "${msg.fullTitle}" to run`,
                });

                this.#communicator.sendMessage(BrowserEventNames.runnableResult, {
                    pid: msg.pid,
                    runUuid: msg.runUuid,
                    cmdUuid: msg.cmdUuid,
                    errors: [error],
                });

                throw error;
            }

            let error: Error | undefined = undefined;

            try {
                await (runnableToRun.fn as Mocha.AsyncFunc)?.call({} as unknown as Mocha.Context);
            } catch (err) {
                error = err as Error;
            }

            this.#communicator.sendMessage(BrowserEventNames.runnableResult, {
                pid: msg.pid,
                runUuid: msg.runUuid,
                cmdUuid: msg.cmdUuid,
                errors: findErrorsOnRunRunnable(error),
            });
        });
    }
}
