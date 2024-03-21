import sinon, { SinonStub } from "sinon";
import { MainRunner as BrowserEnvRunner } from "../../../../src/runner/browser-env";
import { MainRunner as NodejsEnvRunner } from "../../../../src/runner";
import { ViteServer } from "../../../../src/runner/browser-env/vite/server";
import { TestCollection } from "../../../../src/test-collection";
import { Stats as RunnerStats } from "../../../../src/stats";

import { makeConfigStub } from "../../../utils";
import type { Config } from "../../../../src/config";

describe("BrowserEnvRunner", () => {
    const sandbox = sinon.createSandbox();

    const run_ = async (
        opts: { config?: Config; testCollection?: TestCollection; stats?: RunnerStats } = {},
    ): Promise<void> => {
        const config = opts.config || makeConfigStub();
        const testCollection = opts.testCollection || TestCollection.create({});
        const stats = opts.stats || sinon.createStubInstance(RunnerStats);

        const runner = BrowserEnvRunner.create(config);
        runner.init();

        return runner.run(testCollection, stats);
    };

    beforeEach(() => {
        sandbox.stub(NodejsEnvRunner.prototype, "run").resolves();
        sandbox.stub(NodejsEnvRunner.prototype, "cancel");

        sandbox.stub(ViteServer, "create").returns(Object.create(ViteServer.prototype));
        sandbox.stub(ViteServer.prototype, "start").resolves();
        sandbox.stub(ViteServer.prototype, "close").resolves();
        sandbox.stub(ViteServer.prototype, "baseUrl").get(() => "http://vite-default.com");
    });

    afterEach(() => sandbox.restore());

    describe("constructor", () => {
        it("should create vite server", () => {
            const config = makeConfigStub();

            BrowserEnvRunner.create(config);

            assert.calledOnceWith(ViteServer.create, config);
        });
    });

    describe("run", () => {
        it("should start vite server", async () => {
            await run_();

            assert.calledOnceWith(ViteServer.prototype.start);
        });

        it("should throw error if vite server failed", async () => {
            (ViteServer.prototype.start as SinonStub).rejects(new Error("o.O"));

            await assert.isRejected(run_(), "Vite server failed to start: o.O");
        });

        it("should use base url from vite", async () => {
            const viteUrl = "http://localhost:4000";
            sandbox.stub(ViteServer.prototype, "baseUrl").get(() => viteUrl);

            const config = makeConfigStub({
                baseUrl: "http://default.com",
                browsers: ["b1", "b2"],
            }) as Config;

            await run_({ config });

            assert.equal(config.baseUrl, viteUrl);
            assert.equal(config.browsers.b1.baseUrl, viteUrl);
            assert.equal(config.browsers.b2.baseUrl, viteUrl);
        });

        it('should call "run" command of base runner at the end', async () => {
            await run_();

            assert.callOrder(ViteServer.prototype.start as SinonStub, NodejsEnvRunner.prototype.run as SinonStub);
        });
    });

    describe("cancel", () => {
        it('should call "cancel" command of base runner', () => {
            BrowserEnvRunner.create(makeConfigStub()).cancel();

            assert.calledOnce(NodejsEnvRunner.prototype.cancel as SinonStub);
        });

        it("should close vite server", () => {
            BrowserEnvRunner.create(makeConfigStub()).cancel();

            assert.calledOnce(ViteServer.prototype.close as SinonStub);
        });
    });
});
