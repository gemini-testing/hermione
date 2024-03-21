import crypto from "node:crypto";
import _ from "lodash";
import NodejsEnvExecutionThread from "../../../runner/test-runner/execution-thread";
import RuntimeConfig from "../../../../config/runtime-config";

import { WorkerEventNames } from "../../types";

import type { ViteWorkerCommunicator } from "../../communicator";
import type { BrowserEnvRuntimeConfig } from "../../types";
import type { ExecutionThreadCtorOpts } from "../../../runner/test-runner/types";
import type { Test } from "../../../../test-reader/test-object/test";
import type { Hook } from "../../../../test-reader/test-object/hook";

export const wrapExecutionThread = (runUuid: string): typeof NodejsEnvExecutionThread => {
    return class ExecutionThread extends NodejsEnvExecutionThread {
        #communicator: ViteWorkerCommunicator;
        #runUuid: string = runUuid;

        constructor(opts: ExecutionThreadCtorOpts & { runUuid: string }) {
            super(opts);

            this.#communicator = (RuntimeConfig.getInstance() as BrowserEnvRuntimeConfig).viteWorkerCommunicator;
        }

        async _call(runnable: Test | Hook): Promise<void> {
            const cmdUuid = crypto.randomUUID();

            runnable.fn = async (): Promise<void> => {
                this.#communicator.sendMessage({
                    event: WorkerEventNames.runRunnable,
                    data: {
                        pid: process.pid,
                        runUuid: this.#runUuid,
                        cmdUuid: cmdUuid,
                        fullTitle: runnable.fullTitle(),
                    },
                });

                const runRunnableResult = await this.#communicator.waitMessage({ cmdUuid, timeout: runnable.timeout });

                if (!_.isEmpty(runRunnableResult.data.errors)) {
                    throw runRunnableResult.data.errors[0];
                }
            };

            return super._call(runnable);
        }
    };
};
