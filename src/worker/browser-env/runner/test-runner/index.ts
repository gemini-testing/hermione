import crypto from "node:crypto";
import URI from "urijs";
import _ from "lodash";
import NodejsEnvTestRunner from "../../../runner/test-runner";
import RuntimeConfig from "../../../../config/runtime-config";
import { wrapExecutionThread } from "./execution-thread";

import type { ViteWorkerCommunicator } from "../../communicator";
import type { WorkerTestRunnerRunOpts, WorkerTestRunnerCtorOpts } from "../../../runner/test-runner/types";
import type { WorkerRunTestResult } from "../../../hermione";
import type { BrowserHistory } from "../../../../types";
import type { Browser } from "../../../../browser/types";
import type { BrowserEnvRuntimeConfig } from "../../types";

export class TestRunner extends NodejsEnvTestRunner {
    #communicator: ViteWorkerCommunicator;
    #runUuid: string = crypto.randomUUID();

    constructor(opts: WorkerTestRunnerCtorOpts) {
        super(opts);

        this.#communicator = (RuntimeConfig.getInstance() as BrowserEnvRuntimeConfig).viteWorkerCommunicator;
    }

    async run(opts: WorkerTestRunnerRunOpts): Promise<WorkerRunTestResult> {
        return super.run({ ...opts, ExecutionThreadCls: wrapExecutionThread(this.#runUuid) });
    }

    _getPreparePageActions(browser: Browser, history: BrowserHistory): (() => Promise<void>)[] {
        return [
            async (): Promise<void> => {
                await history.runGroup(browser.callstackHistory, "openVite", async () => {
                    const { publicAPI: session } = browser;
                    const cmdUuid = crypto.randomUUID();

                    const uri = new URI(this._config.baseUrl)
                        .query({
                            pid: process.pid,
                            file: this._file,
                            runUuid: this.#runUuid,
                            cmdUuid,
                        })
                        .toString();
                    await session.url(uri);

                    const msg = await this.#communicator.waitMessage({
                        cmdUuid,
                        timeout: this._config.urlHttpTimeout || this._config.httpTimeout,
                    });

                    if (!_.isEmpty(msg.data.errors)) {
                        throw msg.data.errors[0];
                    }
                });
            },
            ...super._getPreparePageActions(browser, history),
        ];
    }
}
