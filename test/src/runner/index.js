"use strict";

const _ = require("lodash");
const Promise = require("bluebird");

const temp = require("src/temp");
const RuntimeConfig = require("src/config/runtime-config");
const { Stats: RunnerStats } = require("src/stats");
const { MasterEvents: RunnerEvents, RunnerSyncEvents } = require("src/events");
const logger = require("src/utils/logger");
const WorkersRegistry = require("src/utils/workers-registry");
const { BrowserRunner } = require("src/runner/browser-runner");
const { TestCollection } = require("src/test-collection");

const { makeConfigStub } = require("../../utils");
const proxyquire = require("proxyquire");

describe("NodejsEnvRunner", () => {
    const sandbox = sinon.createSandbox();
    let BrowserPool;
    let Runner;

    const mkWorkers_ = () => {
        return {
            runTest: sandbox.stub().resolves(),
        };
    };

    const run_ = (opts = {}) => {
        const config = opts.config || makeConfigStub();
        const stats = opts.stats || sinon.createStubInstance(RunnerStats);
        const runner = opts.runner || new Runner(config);
        runner.init();

        return runner.run(opts.testCollection || TestCollection.create(), stats);
    };

    const onRun = fn => {
        BrowserRunner.prototype.run.callsFake(function () {
            fn(this);
            return Promise.resolve();
        });
    };

    beforeEach(() => {
        BrowserPool = {
            create: sinon.stub().returns({ cancel: sandbox.spy() }),
        };

        sandbox.stub(WorkersRegistry.prototype);

        sandbox.stub(WorkersRegistry, "create").returns(Object.create(WorkersRegistry.prototype));
        sandbox.stub(temp, "init");

        sandbox.stub(temp, "serialize");
        sandbox.stub(logger, "warn");

        sandbox.stub(RuntimeConfig, "getInstance").returns({ extend: () => {} });
        sandbox.stub(TestCollection.prototype);

        sandbox.spy(BrowserRunner, "create");
        sandbox.stub(BrowserRunner.prototype, "run").resolves();
        sandbox.stub(BrowserRunner.prototype, "addTestToRun").resolves();

        Runner = proxyquire("src/runner", {
            "../browser-pool": BrowserPool,
        }).MainRunner;
    });

    afterEach(() => sandbox.restore());

    describe("constructor", () => {
        it("should init temp with dir from config", () => {
            const config = makeConfigStub({ system: { tempDir: "some/dir" } });

            Runner.create(config);

            assert.calledOnceWith(temp.init, "some/dir");
        });

        it("should extend runtime config with temp options", () => {
            const extend = sandbox.stub();
            RuntimeConfig.getInstance.returns({ extend });

            temp.serialize.returns({ some: "opts" });

            Runner.create(makeConfigStub());

            assert.calledOnceWith(extend, { tempOpts: { some: "opts" } });
        });
    });

    describe("init", () => {
        it("should create browser pool exactly on init", () => {
            const config = makeConfigStub();
            const runner = new Runner(config);

            assert.notCalled(BrowserPool.create);

            runner.init();

            assert.calledOnceWith(BrowserPool.create, config, runner);
        });
    });

    describe("run", () => {
        beforeEach(() => {
            TestCollection.prototype.getBrowsers.returns(["defaultBrowser"]);
        });

        describe("workers", () => {
            it("should create workers", async () => {
                const config = makeConfigStub();
                const runner = new Runner(config);

                await run_({ runner });

                assert.calledOnceWith(WorkersRegistry.create, config);
            });

            it('should passthrough "NEW_WORKER_PROCESS" event from workers registry', async () => {
                const workersRegistry = new WorkersRegistry();
                workersRegistry.emit.restore();
                workersRegistry.on.restore();
                workersRegistry.init.callsFake(() => {
                    workersRegistry.emit(RunnerEvents.NEW_WORKER_PROCESS);
                });
                WorkersRegistry.create.returns(workersRegistry);

                const runner = new Runner(makeConfigStub());
                const newWorkerProcess = sinon.stub().named(RunnerEvents.NEW_WORKER_PROCESS);
                runner.on(RunnerEvents.NEW_WORKER_PROCESS, newWorkerProcess);

                await run_({ runner });

                assert.calledOnce(newWorkerProcess);
            });

            it('should passthrough "ERROR" event from workers registry', async () => {
                const workersRegistry = new WorkersRegistry();
                const errorMsg = "o.O";

                workersRegistry.emit.restore();
                workersRegistry.on.restore();
                workersRegistry.init.callsFake(() => {
                    workersRegistry.emit(RunnerEvents.ERROR, errorMsg);
                });
                WorkersRegistry.create.returns(workersRegistry);

                const runner = new Runner(makeConfigStub());
                const errorHandler = sinon.stub().named(RunnerEvents.ERROR);
                runner.on(RunnerEvents.ERROR, errorHandler);

                await run_({ runner });

                assert.calledOnceWith(errorHandler, errorMsg);
            });

            it("should create workers before RUNNER_START event", async () => {
                const onRunnerStart = sinon.stub().named("onRunnerStart").resolves();
                const runner = new Runner(makeConfigStub()).on(RunnerEvents.RUNNER_START, onRunnerStart);

                await run_({ runner });

                assert.callOrder(WorkersRegistry.create, onRunnerStart);
            });

            it("should pass workers to each browser runner", async () => {
                const workers = mkWorkers_();
                WorkersRegistry.prototype.register.returns(workers);

                TestCollection.prototype.getBrowsers.returns(["bro1", "bro2"]);
                await run_();

                assert.alwaysCalledWith(
                    BrowserRunner.create,
                    sinon.match.any,
                    sinon.match.any,
                    sinon.match.any,
                    workers,
                );
            });

            it("should end workers after work is done", async () => {
                await run_();

                assert.calledOnce(WorkersRegistry.prototype.end);
            });

            it("should end workers on fail", async () => {
                const runner = new Runner(makeConfigStub()).on(RunnerEvents.RUNNER_START, () => Promise.reject("o.O"));

                await run_({ runner }).catch(() => {});

                assert.calledOnce(WorkersRegistry.prototype.end);
            });
        });

        describe("RUNNER_START event", () => {
            it("should pass a runner to a RUNNER_START handler", async () => {
                const onRunnerStart = sinon.stub().named("onRunnerStart").resolves();
                const runner = new Runner(makeConfigStub()).on(RunnerEvents.RUNNER_START, onRunnerStart);

                await run_({ runner });

                assert.calledOnceWith(onRunnerStart, runner);
            });

            it("should start browser runner only after RUNNER_START handler finish", async () => {
                const mediator = sinon.spy().named("mediator");
                const onRunnerStart = sinon
                    .stub()
                    .named("onRunnerStart")
                    .callsFake(() => Promise.delay(10).then(mediator));
                const runner = new Runner(makeConfigStub()).on(RunnerEvents.RUNNER_START, onRunnerStart);

                await run_({ runner });

                assert.callOrder(mediator, BrowserRunner.prototype.run);
            });

            it("should not run any browser runner if RUNNER_START handler failed", async () => {
                const onRunnerStart = sinon.stub().named("onRunnerStart").rejects("some-error");
                const runner = new Runner(makeConfigStub()).on(RunnerEvents.RUNNER_START, onRunnerStart);

                await run_({ runner }).catch(() => {});

                assert.notCalled(BrowserRunner.prototype.run);
            });
        });

        it("should emit BEGIN event only after RUNNER_START handler finish", async () => {
            const mediator = sinon.spy().named("mediator");
            const onRunnerStart = sinon
                .stub()
                .named("onRunnerStart")
                .callsFake(() => Promise.delay(10).then(mediator));
            const onBegin = sinon.stub().named("onBegin");

            const runner = new Runner(makeConfigStub())
                .on(RunnerEvents.RUNNER_START, onRunnerStart)
                .on(RunnerEvents.BEGIN, onBegin);

            await run_({ runner });

            assert.callOrder(onRunnerStart, mediator, onBegin);
        });

        it("should create browser runners for all browsers from config", async () => {
            TestCollection.prototype.getBrowsers.returns(["foo", "bar"]);

            await run_();

            assert.calledTwice(BrowserRunner.create);
            assert.calledWith(BrowserRunner.create, "foo");
            assert.calledWith(BrowserRunner.create, "bar");
        });

        it("should pass config to the browser runner", async () => {
            const config = makeConfigStub();

            await run_({ config });

            assert.calledOnceWith(BrowserRunner.create, sinon.match.any, config);
        });

        it("should create browser runners with the same browser pool", async () => {
            TestCollection.prototype.getBrowsers.returns(["foo", "bar"]);
            const pool = Object.create(null);

            BrowserPool.create.returns(pool);

            await run_();

            assert.calledTwice(BrowserRunner.create);
            assert.calledWith(BrowserRunner.create, sinon.match.any, sinon.match.any, pool);
            assert.calledWith(BrowserRunner.create, sinon.match.any, sinon.match.any, pool);
        });

        it("should pass test collection to browser runner", async () => {
            const testCollection = TestCollection.create();
            TestCollection.prototype.getBrowsers.returns(["foo"]);

            await run_({ testCollection });

            assert.calledOnceWith(BrowserRunner.prototype.run, testCollection);
        });

        it("should wait until all browser runners will finish", async () => {
            const firstResolveMarker = sandbox.stub().named("First resolve marker");
            const secondResolveMarker = sandbox.stub().named("Second resolve marker");

            TestCollection.prototype.getBrowsers.returns(["foo", "bar"]);
            BrowserRunner.prototype.run
                .onFirstCall()
                .callsFake(() => Promise.resolve().then(firstResolveMarker))
                .onSecondCall()
                .callsFake(() => Promise.delay(1).then(secondResolveMarker));

            await run_();

            assert.calledOnce(firstResolveMarker);
            assert.calledOnce(secondResolveMarker);
        });

        _.forEach(RunnerSyncEvents, (event, name) => {
            it(`should passthrough ${name} event from browser runner`, async () => {
                onRun(browserRunner => browserRunner.emit(event, { foo: "bar" }));

                const onEvent = sinon.stub().named(`on${name}`);
                const runner = new Runner(makeConfigStub()).on(event, onEvent);

                await run_({ runner });

                assert.calledOnceWith(onEvent, { foo: "bar" });
            });
        });

        describe("interceptors", () => {
            _.forEach(RunnerSyncEvents, (event, name) => {
                it(`should call interceptor for ${name} with event name and event data`, async () => {
                    onRun(browserRunner => browserRunner.emit(event, { foo: "bar" }));

                    const handler = sandbox.stub();
                    const runner = new Runner(makeConfigStub(), [{ event, handler }]);

                    await run_({ runner });

                    assert.calledOnceWith(handler, { event, data: { foo: "bar" } });
                });

                it(`should intecept ${name} from browser runner`, async () => {
                    onRun(browserRunner => browserRunner.emit(event));

                    const onEvent = sinon.stub().named(`on${name}`);
                    const onFoo = sinon.stub().named("onFoo");
                    const handler = sandbox.stub().returns({ event: "foo", data: { baz: "qux" } });
                    const runner = new Runner(makeConfigStub(), [{ event, handler }])
                        .on(event, onEvent)
                        .on("foo", onFoo);

                    await run_({ runner });

                    assert.notCalled(onEvent);
                    assert.calledOnceWith(onFoo, { baz: "qux" });
                });
            });

            it("should passthrough event if interceptor returns falsey value", async () => {
                onRun(browserRunner => browserRunner.emit("eventName", { foo: "bar" }));

                const onEvent = sinon.stub().named("onEvent");
                const interceptor = { event: "eventName", handler: sandbox.stub().returns() };
                const runner = new Runner(makeConfigStub(), [interceptor]).on("eventName", onEvent);

                await run_({ runner });

                assert.calledOnceWith(onEvent, { foo: "bar" });
            });

            it("should not emit event if interceptor returns an empty object", async () => {
                onRun(browserRunner => browserRunner.emit("eventName"));

                const onEvent = sinon.stub().named("onEvent");
                const interceptor = { event: "eventName", handler: sandbox.stub().returns({}) };
                const runner = new Runner(makeConfigStub(), [interceptor]).on("eventName", onEvent);

                await run_({ runner });

                assert.notCalled(onEvent);
            });

            it("should passthrough event if interceptor returns the same event", async () => {
                onRun(browserRunner => browserRunner.emit("eventName", { foo: "bar" }));

                const onEvent = sinon.stub().named(`onEvent`);
                const handler = sandbox.stub().returns({ event: "eventName", data: { baz: "qux" } });
                const interceptor = { event: "eventName", handler };
                const runner = new Runner(makeConfigStub(), [interceptor]).on("eventName", onEvent);

                await run_({ runner });

                assert.calledOnceWith(onEvent, { baz: "qux" });
            });

            it("should apply all event interceptors", async () => {
                onRun(browserRunner => browserRunner.emit("eventName"));

                const onEvent = sinon.stub().named(`onEvent`);
                const onFoo = sinon.stub().named("onFoo");
                const interceptor1 = { event: "eventName", handler: sandbox.stub().returns({ event: "eventName" }) };
                const interceptor2 = { event: "eventName", handler: sandbox.stub().returns({ event: "foo" }) };
                const runner = new Runner(makeConfigStub(), [interceptor1, interceptor2])
                    .on("eventName", onEvent)
                    .on("foo", onFoo);

                await run_({ runner });

                assert.notCalled(onEvent);
                assert.calledOnce(onFoo);
            });

            it("should apply appropriate event interceptors from the list of all ones", async () => {
                onRun(browserRunner => browserRunner.emit("eventName"));

                const onEvent = sinon.stub().named(`onEvent`);
                const onFoo = sinon.stub().named("onFoo");
                const interceptor1 = { event: "eventName", handler: sandbox.stub().returns({ event: "onFoo" }) };
                const interceptor2 = { event: "anotherEvent", handler: sandbox.stub() };
                const runner = new Runner(makeConfigStub(), [interceptor1, interceptor2])
                    .on("eventName", onEvent)
                    .on("onFoo", onFoo);

                await run_({ runner });

                assert.notCalled(onEvent);
                assert.calledOnce(onFoo);
            });

            it("should pass events between interceptors", async () => {
                onRun(browserRunner => browserRunner.emit("eventName"));

                const onEvent = sinon.stub().named(`onEvent`);
                const onFoo = sinon.stub().named("onFoo");
                const onBar = sinon.stub().named("onBar");
                const interceptor1 = { event: "eventName", handler: sandbox.stub().returns({ event: "foo" }) };
                const interceptor2 = { event: "foo", handler: sandbox.stub().returns({ event: "bar" }) };
                const runner = new Runner(makeConfigStub(), [interceptor1, interceptor2])
                    .on("eventName", onEvent)
                    .on("foo", onFoo)
                    .on("bar", onBar);

                await run_({ runner });

                assert.notCalled(onEvent);
                assert.notCalled(onFoo);
                assert.calledOnce(onBar);
            });

            it("should handle cycles when passing events between interceptors", async () => {
                onRun(browserRunner => browserRunner.emit("eventName"));

                const onEvent = sinon.stub().named(`onEvent`);
                const onFoo = sinon.stub().named("onFoo");
                const interceptor1 = { event: "eventName", handler: sandbox.stub().returns({ event: "onFoo" }) };
                const interceptor2 = { event: "onFoo", handler: sandbox.stub().returns({ event: "eventName" }) };
                const runner = new Runner(makeConfigStub(), [interceptor1, interceptor2])
                    .on("eventName", onEvent)
                    .on("foo", onFoo);

                await run_({ runner });

                assert.notCalled(onFoo);
                assert.calledOnce(onEvent);
            });

            it("should handle errors from interceptor callback", async () => {
                onRun(browserRunner => browserRunner.emit("eventName"));

                const onEvent = sinon.stub().named("onEvent");
                const onError = sinon.stub().named("onError");
                const err = new Error();
                const runner = new Runner(makeConfigStub(), [
                    { event: "eventName", handler: sandbox.stub().throws(err) },
                ])
                    .on("eventName", onEvent)
                    .on(RunnerEvents.ERROR, onError);

                await run_({ runner });

                assert.calledOnceWith(onError, err);
            });
        });

        describe("END event", () => {
            it("should be emitted after browser runners finish", async () => {
                const onEnd = sinon.spy().named("onEnd");

                const runner = new Runner(makeConfigStub()).on(RunnerEvents.END, onEnd);

                await run_({ runner });

                assert.callOrder(BrowserRunner.prototype.run, onEnd);
            });

            it("should be emitted even if some browser runner failed", async () => {
                const onEnd = sinon.spy().named("onEnd");
                const runner = new Runner(makeConfigStub()).on(RunnerEvents.RUNNER_END, onEnd);

                BrowserRunner.prototype.run.callsFake(() => Promise.reject());

                await run_({ runner }).catch(() => {});

                assert.calledOnce(onEnd);
            });

            it("should be emitted before RUNNER_END event", async () => {
                const onEnd = sinon.spy().named("onEnd");
                const onRunnerEnd = sinon.spy().named("onRunnerEnd");

                const runner = new Runner(makeConfigStub())
                    .on(RunnerEvents.END, onEnd)
                    .on(RunnerEvents.RUNNER_END, onRunnerEnd);

                await run_({ runner });

                assert.callOrder(onEnd, onRunnerEnd);
            });
        });

        describe("RUNNER_END event", () => {
            it("should be emitted after browser runners finish", async () => {
                const onRunnerEnd = sinon.spy().named("onRunnerEnd");

                const runner = new Runner(makeConfigStub()).on(RunnerEvents.RUNNER_END, onRunnerEnd);

                await run_({ runner });

                assert.callOrder(BrowserRunner.prototype.run, onRunnerEnd);
            });

            it("runner should wait until RUNNER_END handler finished", async () => {
                const finMarker = sinon.spy().named("finMarker");
                const onRunnerEnd = sinon
                    .stub()
                    .named("onRunnerEnd")
                    .callsFake(() => Promise.delay(1).then(finMarker));

                const runner = new Runner(makeConfigStub()).on(RunnerEvents.RUNNER_END, onRunnerEnd);

                await run_({ runner });

                assert.calledOnce(finMarker);
            });

            it("should be emitted even if RUNNER_START handler failed", async () => {
                const onRunnerStart = sinon.stub().named("onRunnerStart").rejects();
                const onRunnerEnd = sinon.spy().named("onRunnerEnd");
                const runner = new Runner(makeConfigStub())
                    .on(RunnerEvents.RUNNER_START, onRunnerStart)
                    .on(RunnerEvents.RUNNER_END, onRunnerEnd);

                await run_({ runner }).catch(() => {});

                assert.calledOnce(onRunnerEnd);
            });

            it("should be emitted even if some browser runner failed", async () => {
                const onRunnerEnd = sinon.spy().named("onRunnerEnd");
                const runner = new Runner(makeConfigStub()).on(RunnerEvents.RUNNER_END, onRunnerEnd);

                BrowserRunner.prototype.run.callsFake(() => Promise.reject());

                await run_({ runner }).catch(() => {});

                assert.calledOnce(onRunnerEnd);
            });

            it("should pass test statistic to a RUNNER_END handler", async () => {
                const stats = sinon.createStubInstance(RunnerStats);
                stats.getResult.returns({ foo: "bar" });

                const onRunnerEnd = sinon.stub().named("onRunnerEnd");
                const runner = new Runner(makeConfigStub()).on(RunnerEvents.RUNNER_END, onRunnerEnd);

                await run_({ runner, stats });

                assert.calledOnceWith(onRunnerEnd, { foo: "bar" });
            });

            it("should fail with original error if RUNNER_END handler is failed too", () => {
                const runner = new Runner(makeConfigStub()).on(RunnerEvents.RUNNER_END, () =>
                    Promise.reject("handler-error"),
                );

                BrowserRunner.prototype.run.callsFake(() => Promise.reject("run-error"));

                return assert.isRejected(run_({ runner }), /run-error/);
            });
        });
    });

    describe("addTestToRun", () => {
        beforeEach(() => {
            TestCollection.prototype.getBrowsers.returns([]);
        });

        it("should create new browser runner if there is no active one", async () => {
            const config = makeConfigStub({ browser: ["bro1"] });
            const pool = {};
            BrowserPool.create.returns(pool);

            const workers = mkWorkers_();
            WorkersRegistry.prototype.register.returns(workers);

            const runner = new Runner(config);
            const test = {};
            await run_({ runner });

            runner.addTestToRun(test, "bro2");

            assert.calledOnceWith(BrowserRunner.create, "bro2", config, pool, workers);
            assert.calledOnceWith(BrowserRunner.prototype.run, TestCollection.create({ bro2: [test] }, config));
        });

        it("should pass test to the browser runner", async () => {
            const runner = new Runner(makeConfigStub());
            const test = {};

            sandbox.stub(BrowserRunner.prototype, "browserId").get(() => "bro");
            BrowserRunner.prototype.run.callsFake(() => runner.addTestToRun(test, "bro"));
            TestCollection.prototype.getBrowsers.returns(["bro"]);

            await run_({ runner });

            assert.calledWith(BrowserRunner.prototype.addTestToRun, test);
        });

        it("should return false when runner is not running", async () => {
            const runner = new Runner(makeConfigStub());

            const added = runner.addTestToRun({});

            assert.isFalse(added);
            assert.notCalled(BrowserRunner.prototype.addTestToRun);
            assert.notCalled(BrowserRunner.prototype.run);
        });

        it("should return false when runner is cancelled", async () => {
            const runner = new Runner(makeConfigStub());
            await run_({ runner });

            runner.cancel();
            const added = runner.addTestToRun({});

            assert.isFalse(added);
            assert.notCalled(BrowserRunner.prototype.addTestToRun);
            assert.notCalled(BrowserRunner.prototype.run);
        });
    });

    describe("cancel", () => {
        let cancelStub;

        beforeEach(() => {
            cancelStub = sandbox.stub();
            BrowserPool.create.returns({ cancel: cancelStub });

            sandbox.stub(BrowserRunner.prototype, "cancel");
        });

        it("should cancel browser pool", () => {
            const runner = new Runner(makeConfigStub());

            runner.init();
            runner.cancel();

            assert.calledOnce(cancelStub);
        });

        it("should cancel all executing browser runners", async () => {
            TestCollection.prototype.getBrowsers.returns(["foo", "bar"]);

            const runner = new Runner(makeConfigStub());

            BrowserRunner.prototype.run.onSecondCall().callsFake(() => {
                runner.cancel();
                return Promise.resolve();
            });

            await run_({ runner });

            assert.calledTwice(BrowserRunner.prototype.cancel);
        });

        it("should not cancel finished browser runner", async () => {
            TestCollection.prototype.getBrowsers.returns(["foo", "bar"]);

            const runner = new Runner(makeConfigStub());

            await run_({ runner });
            runner.cancel();

            assert.notCalled(BrowserRunner.prototype.cancel);
        });

        it("shuld not run browser runners if cancelled", async () => {
            TestCollection.prototype.getBrowsers.returns(["foo", "bar"]);

            const runner = new Runner(makeConfigStub()).on(RunnerEvents.RUNNER_START, () => runner.cancel());

            await run_({ runner });

            assert.notCalled(BrowserRunner.prototype.run);
            assert.notCalled(BrowserRunner.prototype.cancel);
        });
    });
});
