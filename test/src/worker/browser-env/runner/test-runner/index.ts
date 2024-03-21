import process from "node:process";
import crypto from "node:crypto";
import _ from "lodash";
import sinon, { SinonStub } from "sinon";
import { TestRunner as BrowserEnvRunner } from "../../../../../../src/worker/browser-env/runner/test-runner";
import { makeBrowserConfigStub } from "../../../../../utils";
import RuntimeConfig from "../../../../../../src/config/runtime-config";
import { Test, Suite } from "../../../../../../src/test-reader/test-object";
import BrowserAgent from "../../../../../../src/worker/runner/browser-agent";
import history from "../../../../../../src/browser/history";
import { ViteWorkerCommunicator } from "../../../../../../src/worker/browser-env/communicator";

import OneTimeScreenshooter from "../../../../../../src/worker/runner/test-runner/one-time-screenshooter";

import type {
    WorkerTestRunnerRunOpts,
    WorkerTestRunnerCtorOpts,
} from "../../../../../../src/worker/runner/test-runner/types";
import type { Test as TestType } from "../../../../../../src/test-reader/test-object/test";
import type { BrowserConfig } from "../../../../../../src/config/browser-config";
import type { WorkerRunTestResult } from "../../../../../../src/worker/hermione";
import type { Browser } from "../../../../../../src/browser/types.ts";

interface TestOpts {
    title: string;
    file: string;
    id: string;
    fn: VoidFunction;
}
interface RunOpts extends WorkerTestRunnerRunOpts {
    runner?: BrowserEnvRunner;
}

describe("worker/browser-env/runner/test-runner", () => {
    const sandbox = sinon.createSandbox();

    const mkTest_ = (opts?: Partial<TestOpts>): TestType => {
        const test = Test.create({
            ...opts,
            title: "default",
            file: "/default/file/path",
            id: "12345",
            fn: sinon.stub(),
        }) as TestType;
        test.parent = Suite.create();

        return test;
    };

    const mkRunner_ = (opts?: Partial<WorkerTestRunnerCtorOpts>): BrowserEnvRunner => {
        opts = {
            test: mkTest_(),
            file: "/default/file/path",
            config: makeBrowserConfigStub({
                baseUrl: "http://localhost:12345",
                system: { patternsOnReject: [] },
            }) as BrowserConfig,
            browserAgent: Object.create(BrowserAgent.prototype),
            ...opts,
        };

        return BrowserEnvRunner.create(opts as WorkerTestRunnerCtorOpts) as BrowserEnvRunner;
    };

    const run_ = (opts?: Partial<RunOpts>): Promise<WorkerRunTestResult> => {
        const test = mkTest_();
        const runner = opts?.runner || mkRunner_({ test });

        opts = {
            sessionId: "default-sessionId",
            sessionCaps: {},
            sessionOpts: {} as WorkerTestRunnerRunOpts["sessionOpts"],
            state: {},
            ..._.omit(opts, "runer"),
        };

        return runner.run(opts as WorkerTestRunnerRunOpts);
    };

    const mkBrowser_ = (): Browser => ({
        publicAPI: {
            url: sandbox.stub().resolves(),
        } as unknown as Browser["publicAPI"],
        config: makeBrowserConfigStub({ saveHistoryMode: "none" }) as BrowserConfig,
        state: {
            isBroken: false,
        },
        applyState: sandbox.stub(),
        callstackHistory: {
            enter: sandbox.stub(),
            leave: sandbox.stub(),
            markError: sandbox.stub(),
            release: sandbox.stub(),
        } as unknown as Browser["callstackHistory"],
    });

    beforeEach(() => {
        sandbox.stub(BrowserAgent.prototype, "getBrowser").resolves(mkBrowser_());
        sandbox.stub(BrowserAgent.prototype, "freeBrowser");

        sandbox.stub(OneTimeScreenshooter, "create").returns(Object.create(OneTimeScreenshooter.prototype));
        sandbox.stub(OneTimeScreenshooter.prototype, "extendWithScreenshot").resolves();

        sandbox.stub(crypto, "randomUUID").returns("00000");
        sandbox.stub(process, "pid").value(11111);

        sandbox.stub(ViteWorkerCommunicator.prototype, "sendMessage").resolves();
        sandbox.stub(ViteWorkerCommunicator.prototype, "waitMessage").resolves({ data: {} });

        sandbox.stub(RuntimeConfig, "getInstance").returns({
            viteWorkerCommunicator: ViteWorkerCommunicator.prototype,
        });
    });

    afterEach(() => sandbox.restore());

    describe("run", () => {
        beforeEach(() => {
            sandbox.spy(history, "runGroup");
        });

        it('should log "openVite" in history', async () => {
            const browser = mkBrowser_();
            (BrowserAgent.prototype.getBrowser as SinonStub).resolves(browser);

            await run_();

            assert.calledWith(history.runGroup as SinonStub, browser.callstackHistory, "openVite", sinon.match.func);
        });

        it("should open url to vite server with query args", async () => {
            const pid = 77777;
            const file = "/some/file";
            const runUuid = "12345";
            const cmdUuid = "54321";

            (crypto.randomUUID as SinonStub).onFirstCall().returns(runUuid).onSecondCall().returns(cmdUuid);
            sandbox.stub(process, "pid").value(pid);

            const browser = mkBrowser_();
            (BrowserAgent.prototype.getBrowser as SinonStub).resolves(browser);

            const runner = mkRunner_({
                test: mkTest_({ file }),
                file,
                config: makeBrowserConfigStub({ baseUrl: "http://localhost:4444", system: {} }) as BrowserConfig,
            });

            await run_({ runner });

            assert.calledOnceWith(
                browser.publicAPI.url,
                `http://localhost:4444/?pid=${pid}&file=${encodeURIComponent(
                    file,
                )}&runUuid=${runUuid}&cmdUuid=${cmdUuid}`,
            );
        });

        it("should wait response from communicator", async () => {
            (crypto.randomUUID as SinonStub).onFirstCall().returns("12345").onSecondCall().returns("54321");

            const runner = mkRunner_({
                config: makeBrowserConfigStub({
                    urlHttpTimeout: 5000,
                    system: {},
                    baseUrl: "http://localhost",
                }) as BrowserConfig,
            });

            await run_({ runner });

            assert.calledWith((ViteWorkerCommunicator.prototype.waitMessage as SinonStub).firstCall, {
                cmdUuid: "54321",
                timeout: 5000,
            });
        });

        it("should throw if got message with errors", async () => {
            (ViteWorkerCommunicator.prototype.waitMessage as SinonStub).resolves({
                data: {
                    errors: [new Error("o.O")],
                },
            });

            await assert.isRejected(run_(), /o.O/);
        });
    });
});
