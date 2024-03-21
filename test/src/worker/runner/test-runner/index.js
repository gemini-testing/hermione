"use strict";

const _ = require("lodash");
const Promise = require("bluebird");
const TestRunner = require("src/worker/runner/test-runner");
const HookRunner = require("src/worker/runner/test-runner/hook-runner");
const ExecutionThread = require("src/worker/runner/test-runner/execution-thread");
const OneTimeScreenshooter = require("src/worker/runner/test-runner/one-time-screenshooter");
const BrowserAgent = require("src/worker/runner/browser-agent");
const { AssertViewError } = require("src/browser/commands/assert-view/errors/assert-view-error");
const AssertViewResults = require("src/browser/commands/assert-view/assert-view-results");
const { Suite, Test } = require("src/test-reader/test-object");
const history = require("src/browser/history");
const { SAVE_HISTORY_MODE } = require("src/constants/config");
const { makeConfigStub } = require("../../../../utils");

describe("worker/runner/test-runner", () => {
    const sandbox = sinon.createSandbox();

    const mkTest_ = (opts = {}) => {
        opts.fn = opts.fn || sinon.spy();
        const test = Test.create(opts);
        test.parent = Suite.create();

        return test;
    };

    const mkRunner_ = (opts = {}) => {
        const test = opts.test || mkTest_();
        const file = opts.file || "/default/file/path";
        const config = opts.config || makeConfigStub();
        const browserAgent = opts.browserAgent || Object.create(BrowserAgent.prototype);

        return TestRunner.create({ test, file, config, browserAgent });
    };

    const mkElement_ = proto => {
        return _.defaults(proto, {
            scrollIntoView: sandbox.stub().named("scrollIntoView").resolves(),
            getSize: sandbox.stub().named("getSize").resolves({ width: 100, height: 500 }),
            elementId: 100500,
        });
    };

    const mkActionAPI_ = () => {
        const actionStub = {};
        actionStub.move = sandbox.stub().named("move").returns(actionStub);
        actionStub.perform = sandbox.stub().named("perform").resolves();

        return actionStub;
    };

    const mkBrowser_ = ({ prototype, config, id } = {}) => {
        const actionStub = {};
        actionStub.move = sandbox.stub().named("move").returns(actionStub);
        actionStub.perform = sandbox.stub().named("perform").resolves();

        const publicAPI = _.defaults(prototype, {
            $: sandbox.stub().named("$").resolves(mkElement_()),
            execute: sandbox.stub().named("execute").resolves({ x: 0, y: 0 }),
            assertView: sandbox.stub().named("assertView").resolves(),
            moveToElement: sandbox.stub().named("moveToElement").resolves(),
            action: sandbox.stub().named("getSize").returns(mkActionAPI_()),
            isW3C: true,
        });
        config = _.defaults(config, { resetCursor: true });

        return {
            id,
            publicAPI,
            config,
            meta: {},
            state: {
                isBroken: false,
            },
            markAsBroken: sandbox.stub().callsFake(() => {
                this.state.isBroken = true;

                return sandbox.stub();
            }),
        };
    };

    beforeEach(() => {
        sandbox.stub(BrowserAgent.prototype, "getBrowser").resolves(mkBrowser_());
        sandbox.stub(BrowserAgent.prototype, "freeBrowser");

        sandbox.stub(ExecutionThread, "create").returns(Object.create(ExecutionThread.prototype));
        sandbox.stub(ExecutionThread.prototype, "run").callsFake(runnable => runnable.fn());

        sandbox.stub(HookRunner, "create").returns(Object.create(HookRunner.prototype));
        sandbox.stub(HookRunner.prototype, "hasBeforeEachHooks").returns(false);
        sandbox.stub(HookRunner.prototype, "runBeforeEachHooks").resolves();
        sandbox.stub(HookRunner.prototype, "hasAfterEachHooks").returns(false);
        sandbox.stub(HookRunner.prototype, "runAfterEachHooks").resolves();

        sandbox.stub(OneTimeScreenshooter, "create").returns(Object.create(OneTimeScreenshooter.prototype));
    });

    afterEach(() => sandbox.restore());

    describe("run", () => {
        let callstackHistoryStub;

        const run_ = (opts = {}) => {
            const test = opts.test || mkTest_();
            const runner = opts.runner || mkRunner_({ test });
            const sessionId = opts.sessionId || "default-sessionId";
            const sessionCaps = opts.sessionCaps || "default-session-caps";
            const sessionOpts = opts.sessionOpts || "default-session-opts";

            return runner.run({ sessionId, sessionCaps, sessionOpts });
        };

        beforeEach(() => {
            callstackHistoryStub = {
                enter: sandbox.stub(),
                leave: sandbox.stub(),
                markError: sandbox.stub(),
                release: sandbox.stub(),
            };
        });

        it("should request browser for passed session", async () => {
            const runner = mkRunner_();
            const opts = {
                sessionId: "100500",
                sessionCaps: "some-caps",
                sessionOpts: "some-opts",
                state: {},
            };

            await runner.run(opts);

            assert.calledOnceWithExactly(BrowserAgent.prototype.getBrowser, opts);
        });

        it("should create one time screenshooter", async () => {
            const config = makeConfigStub();
            const runner = mkRunner_({ config });

            const browser = mkBrowser_();
            BrowserAgent.prototype.getBrowser.resolves(browser);

            await run_({ runner });

            assert.calledOnceWith(OneTimeScreenshooter.create, config, browser);
        });

        it("should create execution thread for test", async () => {
            const test = mkTest_();

            await run_({ test });

            assert.calledOnceWith(ExecutionThread.create, sinon.match({ test }));
        });

        it("should protect test from modification in execution thread", async () => {
            ExecutionThread.create.callsFake(({ test }) => {
                test.foo = "bar";
                return Object.create(ExecutionThread.prototype);
            });

            const test = mkTest_();
            await run_({ test });

            assert.notProperty(test, "foo");
        });

        it("should create execution thread with requested browser", async () => {
            const browser = mkBrowser_();
            BrowserAgent.prototype.getBrowser.resolves(browser);

            await run_();

            assert.calledOnceWith(ExecutionThread.create, sinon.match({ browser }));
        });

        it("should create execution thread with empty hermioneCtx by default", async () => {
            await run_({});

            assert.calledOnceWith(ExecutionThread.create, sinon.match({ hermioneCtx: {} }));
        });

        it("should create execution thread with test hermioneCtx", async () => {
            const test = mkTest_();
            test.hermioneCtx = { foo: "bar" };

            await run_({ test });

            assert.calledOnceWith(ExecutionThread.create, sinon.match({ hermioneCtx: { foo: "bar" } }));
        });

        it("test hermioneCtx should be protected from modification during run", async () => {
            ExecutionThread.create.callsFake(({ test, hermioneCtx }) => {
                ExecutionThread.prototype.run.callsFake(() => {
                    hermioneCtx.baz = "qux";
                    test.hermioneCtx.baaz = "quux";
                });

                return Object.create(ExecutionThread.prototype);
            });

            const test = mkTest_();
            test.hermioneCtx = { foo: "bar" };

            await run_({ test });

            assert.deepEqual(test.hermioneCtx, { foo: "bar" });
        });

        it("test parent should be shared between runs", async () => {
            ExecutionThread.create.callsFake(({ test }) => {
                ExecutionThread.prototype.run.callsFake(() => {
                    test.parent.foo = "bar";
                });

                return Object.create(ExecutionThread.prototype);
            });

            const test = mkTest_();

            await run_({ test });

            assert.propertyVal(test.parent, "foo", "bar");
        });

        it("should create execution thread with screenshooter", async () => {
            const screenshooter = Object.create(OneTimeScreenshooter.prototype);
            OneTimeScreenshooter.create.returns(screenshooter);

            await run_();

            assert.calledOnceWith(ExecutionThread.create, sinon.match({ screenshooter }));
        });

        it("should create hook runner for test with execution thread", async () => {
            const executionThread = Object.create(ExecutionThread.prototype);
            ExecutionThread.create.returns(executionThread);
            const test = mkTest_();

            await run_({ test });

            assert.calledOnceWith(HookRunner.create, sinon.match(test), executionThread);
        });

        it("should run test in execution thread", async () => {
            const test = mkTest_();

            await run_({ test });

            assert.calledOnceWith(ExecutionThread.prototype.run, sinon.match(test));
        });

        it("should protect test from modification during run in execution thread", async () => {
            ExecutionThread.prototype.run.callsFake(test => (test.foo = "bar"));

            const test = mkTest_();
            await run_({ test });

            assert.notProperty(test, "foo");
        });

        describe("cursor position", () => {
            describe('"resetCursor" is disabled', () => {
                let browser;
                let body;

                beforeEach(() => {
                    browser = mkBrowser_({ config: { resetCursor: false } });
                    BrowserAgent.prototype.getBrowser.resolves(browser);

                    body = mkElement_();
                    browser.publicAPI.$.withArgs("body").resolves(body);
                });

                it("should not get body element", async () => {
                    await run_();

                    assert.notCalled(browser.publicAPI.$);
                });

                it("should not scroll into body view", async () => {
                    await run_();

                    assert.notCalled(body.scrollIntoView);
                });

                it('should not move cursor to position "0,0" on body element', async () => {
                    await run_();

                    assert.notCalled(browser.publicAPI.action);
                });
            });

            describe('"resetCursor" is enabled', () => {
                let browser;
                let body;

                beforeEach(() => {
                    browser = mkBrowser_({ config: { resetCursor: true } });
                    BrowserAgent.prototype.getBrowser.resolves(browser);

                    body = mkElement_();
                    browser.publicAPI.$.withArgs("body").resolves(body);
                });

                it('should throw error if "body" does not exist on the page', async () => {
                    browser.publicAPI.$.withArgs("body").resolves(undefined);

                    await assert.isRejected(
                        run_(),
                        /There is no "body" element on the page when resetting cursor position/,
                    );
                });

                it("should get body element", async () => {
                    await run_();

                    assert.calledOnceWith(browser.publicAPI.$, "body");
                });

                it("should scroll into body view", async () => {
                    await run_();

                    assert.calledOnceWith(body.scrollIntoView);
                });

                describe("in jsonwp protocol", () => {
                    beforeEach(() => {
                        browser.publicAPI.isW3C = false;
                    });

                    it("should scroll before moving cursor", async () => {
                        await run_();

                        assert.callOrder(body.scrollIntoView, browser.publicAPI.moveToElement);
                    });

                    it('should move cursor to position "0,0"', async () => {
                        browser.publicAPI.execute.resolves({ x: 5, y: 5 });
                        body.elementId = 12345;

                        await run_();

                        assert.calledOnceWith(browser.publicAPI.moveToElement, 12345, -5, -5);
                    });

                    it("should floor coords if body element has fractional coords", async () => {
                        browser.publicAPI.execute.resolves({ x: 10.123, y: 15.899 });
                        body.elementId = 12345;

                        await run_();

                        assert.calledOnceWith(browser.publicAPI.moveToElement, 12345, -10, -15);
                    });
                });

                describe("in w3c protocol", () => {
                    beforeEach(() => {
                        browser.publicAPI.isW3C = true;
                    });

                    it("should scroll before moving cursor", async () => {
                        await run_();

                        assert.callOrder(body.scrollIntoView, browser.publicAPI.action);
                    });

                    it('should move cursor to position "0,0"', async () => {
                        const actionAPI = mkActionAPI_();
                        browser.publicAPI.action.returns(actionAPI);

                        await run_();

                        assert.calledOnceWith(browser.publicAPI.action, "pointer", {
                            parameters: { pointerType: "mouse" },
                        });
                        assert.calledOnceWith(actionAPI.move, { x: 0, y: 0 });
                        assert.calledOnce(actionAPI.perform);
                        assert.callOrder(browser.publicAPI.action, actionAPI.move, actionAPI.perform);
                    });
                });
            });
        });

        describe("getting of browser fails", () => {
            it("should be rejected", () => {
                BrowserAgent.prototype.getBrowser.rejects(new Error("foo bar"));

                return assert.isRejected(run_(), /foo bar/);
            });

            it("should extend error with hermioneCtx", async () => {
                BrowserAgent.prototype.getBrowser.rejects(new Error());

                const test = mkTest_();
                test.hermioneCtx = { foo: "bar" };

                const error = await run_({ test }).catch(e => e);

                assert.deepEqual(error.hermioneCtx, test.hermioneCtx);
            });
        });

        describe("beforeEach hooks", () => {
            beforeEach(() => {
                sandbox.spy(history, "runGroup");
            });

            it("should be called before test hook", async () => {
                await run_();

                assert.calledOnce(HookRunner.prototype.runBeforeEachHooks);
            });

            it("should wait beforeEach hooks finish before running test", async () => {
                const afterBeforeEach = sinon.spy().named("afterBeforeEach");
                HookRunner.prototype.runBeforeEachHooks.callsFake(() => Promise.delay(10).then(afterBeforeEach));
                const test = mkTest_();

                await run_({ test });

                assert.callOrder(afterBeforeEach, test.fn);
            });

            it("should not call test if beforeEach hooks failed", async () => {
                HookRunner.prototype.runBeforeEachHooks.rejects(new Error());
                const test = mkTest_();

                await run_({ test }).catch(() => {});

                assert.notCalled(test.fn);
            });

            it("should reject with beforeEach hook error", async () => {
                HookRunner.prototype.runBeforeEachHooks.rejects(new Error("foo"));

                await assert.isRejected(run_(), /foo/);
            });

            it('should log "resetCursor" in history if set', async () => {
                const browser = mkBrowser_({ config: { resetCursor: true, saveHistoryMode: SAVE_HISTORY_MODE.ALL } });
                BrowserAgent.prototype.getBrowser.resolves(browser);
                HookRunner.prototype.hasBeforeEachHooks.returns(true);

                await run_();

                assert.calledWith(history.runGroup, sinon.match.any, "resetCursor", sinon.match.func);
            });

            it('should log "beforeEach" in history if beforeEach hooks exist', async () => {
                const browser = mkBrowser_({ config: { saveHistoryMode: SAVE_HISTORY_MODE.ALL } });
                BrowserAgent.prototype.getBrowser.resolves(browser);
                HookRunner.prototype.hasBeforeEachHooks.returns(true);

                await run_();

                assert.calledWith(history.runGroup, sinon.match.any, "beforeEach", sinon.match.func);
            });

            it('should not log "beforeEach" in history if beforeEach hooks do not exist', async () => {
                const browser = mkBrowser_({ config: { resetCursor: false, saveHistoryMode: SAVE_HISTORY_MODE.ALL } });
                BrowserAgent.prototype.getBrowser.resolves(browser);
                HookRunner.prototype.hasBeforeEachHooks.returns(false);

                await run_();

                assert.neverCalledWith(history.runGroup, sinon.match.any, "beforeEach", sinon.match.func);
            });
        });

        describe("afterEach hooks", () => {
            beforeEach(() => {
                sandbox.spy(history, "runGroup");
            });

            it("should be called if beforeEach hook failed", async () => {
                HookRunner.prototype.hasBeforeEachHooks.returns(true);
                HookRunner.prototype.hasAfterEachHooks.returns(true);
                HookRunner.prototype.runBeforeEachHooks.rejects(new Error());

                await run_().catch(() => {});

                assert.calledOnce(HookRunner.prototype.runAfterEachHooks);
            });

            it("should be called even if test failed", async () => {
                HookRunner.prototype.hasAfterEachHooks.returns(true);
                const test = mkTest_({
                    fn: sinon.stub().rejects(new Error()),
                });

                await run_({ test }).catch(() => {});

                assert.calledOnce(HookRunner.prototype.runAfterEachHooks);
            });

            it("should fail on afterEach fail", async () => {
                HookRunner.prototype.hasAfterEachHooks.returns(true);
                HookRunner.prototype.runAfterEachHooks.rejects(new Error("foo"));

                await assert.isRejected(run_(), /foo/);
            });

            it("should reject with test error if both test and afterEach hooks failed", async () => {
                const test = mkTest_({
                    fn: sinon.stub().rejects(new Error("foo")),
                });
                HookRunner.prototype.runAfterEachHooks.rejects(new Error("bar"));

                await assert.isRejected(run_({ test }), /foo/);
            });

            it('should log "afterEach" in history if afterEach hooks exist', async () => {
                const browser = mkBrowser_({ config: { saveHistoryMode: SAVE_HISTORY_MODE.ALL } });
                BrowserAgent.prototype.getBrowser.resolves(browser);
                HookRunner.prototype.hasAfterEachHooks.returns(true);

                await run_();

                assert.calledWith(history.runGroup, sinon.match.any, "afterEach", sinon.match.func);
            });

            it('should not log "afterEach" in history if afterEach hooks do not exist', async () => {
                const browser = mkBrowser_({ config: { saveHistoryMode: SAVE_HISTORY_MODE.ALL } });
                BrowserAgent.prototype.getBrowser.resolves(browser);
                HookRunner.prototype.hasAfterEachHooks.returns(false);

                await run_();

                assert.neverCalledWith(history.runGroup, sinon.match.any, "afterEach", sinon.match.func);
            });
        });

        describe("mark browser as broken", () => {
            describe("on browser prepare", () => {
                it("should not mark if session is not broken", async () => {
                    const config = makeConfigStub({ system: { patternsOnReject: ["FOO_BAR"] } });
                    const runner = mkRunner_({ config });
                    const browser = mkBrowser_({ config: { resetCursor: true } });
                    BrowserAgent.prototype.getBrowser.resolves(browser);
                    browser.publicAPI.$.rejects(new Error());

                    await run_({ runner }).catch(() => {});

                    assert.notCalled(browser.markAsBroken);
                });

                it("should mark if cursor resetting was failed", async () => {
                    const config = makeConfigStub({ system: { patternsOnReject: ["FOO_BAR"] } });
                    const runner = mkRunner_({ config });
                    const browser = mkBrowser_({ config: { resetCursor: true } });
                    BrowserAgent.prototype.getBrowser.resolves(browser);
                    browser.publicAPI.$.rejects(new Error("FOO_BAR"));

                    await run_({ runner }).catch(() => {});

                    assert.calledOnce(browser.markAsBroken);
                });
            });

            describe('in "beforeEach" hook', () => {
                it("should not mark if session is not broken", async () => {
                    const config = makeConfigStub({ system: { patternsOnReject: ["FOO_BAR"] } });
                    const runner = mkRunner_({ config });
                    const browser = mkBrowser_();
                    BrowserAgent.prototype.getBrowser.resolves(browser);
                    HookRunner.prototype.runBeforeEachHooks.rejects(new Error());

                    await run_({ runner }).catch(() => {});

                    assert.notCalled(browser.markAsBroken);
                });

                it("should mark if session is broken", async () => {
                    const config = makeConfigStub({ system: { patternsOnReject: ["FOO_BAR"] } });
                    const runner = mkRunner_({ config });
                    const browser = mkBrowser_();
                    BrowserAgent.prototype.getBrowser.resolves(browser);
                    HookRunner.prototype.runBeforeEachHooks.rejects(new Error("FOO_BAR"));

                    await run_({ runner }).catch(() => {});

                    assert.calledOnce(browser.markAsBroken);
                });
            });

            describe('in "test" execution', () => {
                it("should not mark if session is not broken", async () => {
                    const config = makeConfigStub({ system: { patternsOnReject: ["FOO_BAR"] } });
                    const test = mkTest_({ fn: sinon.stub().rejects(new Error()) });
                    const runner = mkRunner_({ config, test });
                    const browser = mkBrowser_();
                    BrowserAgent.prototype.getBrowser.resolves(browser);

                    await run_({ runner }).catch(() => {});

                    assert.notCalled(browser.markAsBroken);
                });

                it("should mark if session is broken", async () => {
                    const config = makeConfigStub({ system: { patternsOnReject: ["FOO_BAR"] } });
                    const test = mkTest_({ fn: sinon.stub().rejects(new Error("FOO_BAR")) });
                    const runner = mkRunner_({ config, test });
                    const browser = mkBrowser_();
                    BrowserAgent.prototype.getBrowser.resolves(browser);

                    await run_({ runner }).catch(() => {});

                    assert.calledOnce(browser.markAsBroken);
                });
            });

            describe('in "afterEach" hook', () => {
                it("should mark if session is broken", async () => {
                    const config = makeConfigStub({ system: { patternsOnReject: ["FOO_BAR"] } });
                    const test = mkTest_({ fn: sinon.stub().resolves() });
                    const runner = mkRunner_({ config, test });
                    const browser = mkBrowser_();
                    BrowserAgent.prototype.getBrowser.resolves(browser);
                    HookRunner.prototype.hasAfterEachHooks.returns(true);
                    HookRunner.prototype.runAfterEachHooks.rejects(new Error("FOO_BAR"));

                    await run_({ runner }).catch(() => {});

                    assert.calledOnce(browser.markAsBroken);
                });
            });

            describe("with assertView errors", () => {
                it("should mark if test fails with screenshot error", async () => {
                    const config = makeConfigStub({ system: { patternsOnReject: ["image comparison failed"] } });
                    const runner = mkRunner_({ config });
                    const browser = mkBrowser_();
                    BrowserAgent.prototype.getBrowser.resolves(browser);

                    const assertViewResults = AssertViewResults.create([new Error("image error")]);

                    ExecutionThread.create.callsFake(({ hermioneCtx }) => {
                        ExecutionThread.prototype.run.callsFake(() => {
                            hermioneCtx.assertViewResults = assertViewResults;
                        });

                        return Object.create(ExecutionThread.prototype);
                    });

                    await run_({ runner }).catch(() => {});

                    assert.calledOnce(browser.markAsBroken);
                });
            });
        });

        describe("on success", () => {
            it("should resolve with hermioneCtx object passed to execution thread", async () => {
                ExecutionThread.create.callsFake(({ hermioneCtx }) => {
                    ExecutionThread.prototype.run.callsFake(() => (hermioneCtx.foo = "bar"));
                    return Object.create(ExecutionThread.prototype);
                });

                const result = await run_();

                assert.match(result.hermioneCtx, { foo: "bar" });
            });

            it("should extend hermioneCtx with empty assert view results", async () => {
                const result = await run_();

                assert.match(result.hermioneCtx, { assertViewResults: [] });
            });

            it("should convert assert view results to raw object", async () => {
                const assertViewResults = AssertViewResults.create([{ foo: "bar" }]);

                ExecutionThread.create.callsFake(({ hermioneCtx }) => {
                    ExecutionThread.prototype.run.callsFake(() => {
                        hermioneCtx.assertViewResults = assertViewResults;
                    });

                    return Object.create(ExecutionThread.prototype);
                });

                const result = await run_();

                assert.match(result.hermioneCtx, { assertViewResults: [{ foo: "bar" }] });
            });

            it("should fail if assert view results have fails", async () => {
                const assertViewResults = AssertViewResults.create([new Error()]);

                ExecutionThread.create.callsFake(({ hermioneCtx }) => {
                    ExecutionThread.prototype.run.callsFake(() => {
                        hermioneCtx.assertViewResults = assertViewResults;
                    });

                    return Object.create(ExecutionThread.prototype);
                });

                await assert.isRejected(run_(), AssertViewError);
            });

            it("should extend AssertViewError with screenshot on fail if it exists", async () => {
                sandbox.stub(OneTimeScreenshooter.prototype, "getScreenshot").returns("base64");

                const assertViewResults = AssertViewResults.create([new Error()]);

                ExecutionThread.create.callsFake(({ hermioneCtx }) => {
                    ExecutionThread.prototype.run.callsFake(() => {
                        hermioneCtx.assertViewResults = assertViewResults;
                    });

                    return Object.create(ExecutionThread.prototype);
                });

                const error = await run_().catch(e => e);

                assert.propertyVal(error, "screenshot", "base64");
            });

            it("should not extend AssertViewError with screenshot on fail if it not exists", async () => {
                sandbox.stub(OneTimeScreenshooter.prototype, "getScreenshot").returns();

                const assertViewResults = AssertViewResults.create([new Error()]);

                ExecutionThread.create.callsFake(({ hermioneCtx }) => {
                    ExecutionThread.prototype.run.callsFake(() => {
                        hermioneCtx.assertViewResults = assertViewResults;
                    });

                    return Object.create(ExecutionThread.prototype);
                });

                const error = await run_().catch(e => e);

                assert.notProperty(error, "screenshot");
            });

            it("should resolve with browser meta", async () => {
                ExecutionThread.create.callsFake(({ browser }) => {
                    ExecutionThread.prototype.run.callsFake(() => {
                        browser.meta.foo = "bar";
                    });
                    return Object.create(ExecutionThread.prototype);
                });

                const result = await run_();

                assert.match(result.meta, { foo: "bar" });
            });

            it("should release browser", async () => {
                const browser = mkBrowser_();
                BrowserAgent.prototype.getBrowser.resolves(browser);

                await run_();

                assert.calledOnceWith(BrowserAgent.prototype.freeBrowser, browser);
            });

            it("should release browser after all browser data has been used", async () => {
                ExecutionThread.create.callsFake(({ browser }) => {
                    ExecutionThread.prototype.run.callsFake(() => {
                        browser.meta.foo = "bar";
                    });
                    return Object.create(ExecutionThread.prototype);
                });

                BrowserAgent.prototype.freeBrowser.callsFake(browser => {
                    browser.meta = null;
                    browser.browserState = null;
                });

                const result = await run_();

                assert.match(result.meta, { foo: "bar" });
            });

            it(`should pass history if "saveHistory" is true`, async () => {
                const history = Symbol();
                const browser = mkBrowser_({ config: { saveHistoryMode: SAVE_HISTORY_MODE.ALL } });
                BrowserAgent.prototype.getBrowser.resolves(browser);
                callstackHistoryStub.release.returns(history);
                browser.callstackHistory = callstackHistoryStub;

                const result = await run_();

                assert.equal(result.history, history);
            });

            [SAVE_HISTORY_MODE.NONE, SAVE_HISTORY_MODE.ONLY_FAILED].forEach(saveHistoryMode => {
                it(`should not pass history if "saveHistory" is ${saveHistoryMode}`, async () => {
                    const browser = mkBrowser_({ config: { saveHistoryMode } });
                    BrowserAgent.prototype.getBrowser.resolves(browser);
                    browser.callstackHistory = callstackHistoryStub;

                    const result = await run_();

                    assert.isUndefined(result.history);
                });
            });
        });

        describe("on fail", () => {
            it("should extend error with hermioneCtx object passed to execution thread", async () => {
                ExecutionThread.create.callsFake(({ hermioneCtx }) => {
                    ExecutionThread.prototype.run.callsFake(() => {
                        hermioneCtx.foo = "bar";
                        return Promise.reject(new Error());
                    });
                    return Object.create(ExecutionThread.prototype);
                });

                const error = await run_().catch(e => e);

                assert.match(error.hermioneCtx, { foo: "bar" });
            });

            it("should extend hermioneCtx with empty assert view results", async () => {
                ExecutionThread.prototype.run.rejects(new Error());

                const error = await run_().catch(e => e);

                assert.match(error.hermioneCtx, { assertViewResults: [] });
            });

            it("should convert assert view results to raw object", async () => {
                const assertViewResults = AssertViewResults.create([{ foo: "bar" }]);

                ExecutionThread.create.callsFake(({ hermioneCtx }) => {
                    ExecutionThread.prototype.run.callsFake(() => {
                        hermioneCtx.assertViewResults = assertViewResults;
                        return Promise.reject(new Error());
                    });

                    return Object.create(ExecutionThread.prototype);
                });

                const error = await run_().catch(e => e);

                assert.match(error.hermioneCtx, { assertViewResults: [{ foo: "bar" }] });
            });

            it("should not throw AssertViewError if runtime error exist", async () => {
                const assertViewResults = AssertViewResults.create([new Error()]);

                ExecutionThread.create.callsFake(({ hermioneCtx }) => {
                    ExecutionThread.prototype.run.callsFake(() => {
                        hermioneCtx.assertViewResults = assertViewResults;
                        return Promise.reject(new Error("runtime error"));
                    });

                    return Object.create(ExecutionThread.prototype);
                });

                await assert.isRejected(run_(), "runtime error");
            });

            it("should extend error with browser meta", async () => {
                ExecutionThread.create.callsFake(({ browser }) => {
                    ExecutionThread.prototype.run.callsFake(() => {
                        browser.meta.foo = "bar";

                        return Promise.reject(new Error());
                    });

                    return Object.create(ExecutionThread.prototype);
                });

                const error = await run_().catch(e => e);

                assert.match(error.meta, { foo: "bar" });
            });

            it("should release browser", async () => {
                const browser = mkBrowser_();
                BrowserAgent.prototype.getBrowser.resolves(browser);

                ExecutionThread.prototype.run.rejects(new Error());

                await run_().catch(e => e);

                assert.calledOnceWith(BrowserAgent.prototype.freeBrowser, browser);
            });

            [SAVE_HISTORY_MODE.ONLY_FAILED, SAVE_HISTORY_MODE.ALL].forEach(saveHistoryMode => {
                it(`should pass history if "saveHistory" is ${saveHistoryMode}`, async () => {
                    const history = Symbol();
                    const browser = mkBrowser_({ config: { saveHistoryMode } });
                    BrowserAgent.prototype.getBrowser.resolves(browser);
                    HookRunner.prototype.hasAfterEachHooks.returns(true);
                    HookRunner.prototype.runAfterEachHooks.rejects(new Error());
                    callstackHistoryStub.release.returns(history);
                    browser.callstackHistory = callstackHistoryStub;

                    await run_().catch(err => {
                        assert.equal(err.history, history);
                    });
                });
            });

            it(`should not pass history if "saveHistory" is not set`, async () => {
                const history = Symbol();
                const browser = mkBrowser_({ config: { saveHistoryMode: SAVE_HISTORY_MODE.NONE } });
                BrowserAgent.prototype.getBrowser.resolves(browser);
                HookRunner.prototype.hasAfterEachHooks.returns(true);
                HookRunner.prototype.runAfterEachHooks.rejects(new Error());
                callstackHistoryStub.release.returns(history);
                browser.callstackHistory = callstackHistoryStub;

                await run_().catch(err => {
                    assert.isUndefined(err.history);
                });
            });
        });
    });
});
