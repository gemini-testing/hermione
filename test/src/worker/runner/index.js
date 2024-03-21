"use strict";

const Runner = require("src/worker/runner");
const BrowserPool = require("src/worker/runner/browser-pool");
const CachingTestParser = require("src/worker/runner/caching-test-parser");
const BrowserAgent = require("src/worker/runner/browser-agent");
const { WorkerEvents: RunnerEvents } = require("src/events");
const NodejsEnvTestRunner = require("src/worker/runner/test-runner");
const { TestRunner: BrowserEnvTestRunner } = require("src/worker/browser-env/runner/test-runner");
const { NODEJS_TEST_RUN_ENV, BROWSER_TEST_RUN_ENV } = require("src/constants/config");
const { makeConfigStub, makeTest } = require("../../../utils");

describe("worker/runner", () => {
    const sandbox = sinon.createSandbox();

    const mkRunner_ = (opts = {}) => {
        const config = opts.config || makeConfigStub();
        return Runner.create(config);
    };

    beforeEach(() => {
        sandbox.stub(BrowserPool, "create").returns({ browser: "pool" });

        sandbox.stub(CachingTestParser, "create").returns(Object.create(CachingTestParser.prototype));
        sandbox.stub(CachingTestParser.prototype, "parse").resolves([]);

        sandbox.stub(NodejsEnvTestRunner, "create").returns(Object.create(NodejsEnvTestRunner.prototype));
        sandbox.stub(NodejsEnvTestRunner.prototype, "run").resolves();

        // sandbox.stub(BrowserEnvTestRunner, "create").returns(Object.create(BrowserEnvTestRunner.prototype));
        sandbox.stub(BrowserEnvTestRunner.prototype, "run").resolves();

        sandbox.stub(BrowserAgent, "create").returns(Object.create(BrowserAgent.prototype));
    });

    afterEach(() => sandbox.restore());

    describe("constructor", () => {
        it("should create browser pool", () => {
            Runner.create({ foo: "bar" });

            assert.calledOnceWith(BrowserPool.create, { foo: "bar" });
        });

        it("should create caching test parser", () => {
            const config = makeConfigStub();

            Runner.create(config);

            assert.calledOnceWith(CachingTestParser.create, config);
        });

        ["BEFORE_FILE_READ", "AFTER_FILE_READ", "AFTER_TESTS_READ"].forEach(event => {
            it(`should passthrough ${event} event from caching test parser`, () => {
                const testParser = Object.create(CachingTestParser.prototype);
                CachingTestParser.create.returns(testParser);

                const onEvent = sinon.spy().named(`on${event}`);
                mkRunner_().on(RunnerEvents[event], onEvent);

                testParser.emit(RunnerEvents[event], { foo: "bar" });

                assert.calledOnceWith(onEvent, { foo: "bar" });
            });
        });
    });

    [
        { name: "NodejsEnvTestRunner", TestRunner: NodejsEnvTestRunner, testRunEnv: NODEJS_TEST_RUN_ENV },
        { name: "BrowserEnvTestRunner", TestRunner: BrowserEnvTestRunner, testRunEnv: BROWSER_TEST_RUN_ENV },
    ].forEach(({ name, TestRunner, testRunEnv }) => {
        describe(name, () => {
            let runner;

            beforeEach(() => {
                runner = mkRunner_(
                    makeConfigStub({
                        system: { testRunEnv },
                    }),
                );
            });

            describe("runTest", () => {
                it("should parse passed file in passed browser", async () => {
                    await runner.runTest(null, { file: "some/file.js", browserId: "bro" });

                    assert.calledOnceWith(CachingTestParser.prototype.parse, {
                        file: "some/file.js",
                        browserId: "bro",
                    });
                });

                it("should create test runner for parsed test", async () => {
                    const test = makeTest({ fullTitle: () => "some test" });
                    CachingTestParser.prototype.parse.resolves([test]);

                    await runner.runTest("some test", {});

                    assert.calledOnceWith(TestRunner.create, sinon.match({ test }));
                });

                it("should pass browser config to test runner", async () => {
                    const config = makeConfigStub({ browsers: ["bro"], system: { testRunEnv } });
                    const runner = mkRunner_({ config });

                    const test = makeTest({ fullTitle: () => "some test" });
                    CachingTestParser.prototype.parse.resolves([test]);

                    await runner.runTest("some test", { browserId: "bro" });

                    assert.calledOnceWith(TestRunner.create, sinon.match({ config: config.forBrowser("bro") }));
                });

                it("should pass file to test runner", async () => {
                    const runner = mkRunner_();

                    const test = makeTest({ fullTitle: () => "some test" });
                    CachingTestParser.prototype.parse.resolves([test]);

                    await runner.runTest("some test", { file: "/path/to/file" });

                    assert.calledOnceWith(TestRunner.create, sinon.match({ file: "/path/to/file" }));
                });

                it("should create browser agent for test runner", async () => {
                    const pool = { browser: "pool" };
                    BrowserPool.create.returns(pool);
                    const runner = mkRunner_();

                    const test = makeTest({ fullTitle: () => "some test" });
                    CachingTestParser.prototype.parse.resolves([test]);

                    const browserAgent = Object.create(BrowserAgent.prototype);
                    BrowserAgent.create.withArgs({ id: "bro", version: "1.0", pool }).returns(browserAgent);

                    await runner.runTest("some test", { browserId: "bro", browserVersion: "1.0" });

                    assert.calledOnceWith(TestRunner.create, sinon.match({ browserAgent }));
                });

                it("should create test runner only for passed test", async () => {
                    const runner = mkRunner_();

                    const test1 = makeTest({ fullTitle: () => "some test" });
                    const test2 = makeTest({ fullTitle: () => "other test" });
                    CachingTestParser.prototype.parse.resolves([test1, test2]);

                    await runner.runTest("other test", {});

                    assert.calledOnceWith(TestRunner.create, sinon.match({ test: test2 }));
                });

                it("should run test in passed session", async () => {
                    const runner = mkRunner_();

                    const test = makeTest({ fullTitle: () => "some test" });
                    CachingTestParser.prototype.parse.resolves([test]);

                    await runner.runTest("some test", {
                        sessionId: "100500",
                        sessionCaps: "some-caps",
                        sessionOpts: "some-opts",
                        state: {},
                    });

                    assert.calledOnceWith(NodejsEnvTestRunner.prototype.run, {
                        sessionId: "100500",
                        sessionCaps: "some-caps",
                        sessionOpts: "some-opts",
                        state: {},
                    });
                });
            });
        });
    });
});
