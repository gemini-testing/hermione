'use strict';

const BrowserAgent = require('../../../../lib/browser-agent');
const logger = require('../../../../lib/utils').logger;
const ProxyReporter = require('../../../../lib/runner/mocha-runner/proxy-reporter');
const SkipBuilder = require('../../../../lib/runner/mocha-runner/skip/skip-builder');
const OnlyBuilder = require('../../../../lib/runner/mocha-runner/skip/only-builder');
const Skip = require('../../../../lib/runner/mocha-runner/skip/');
const TestSkipper = require('../../../../lib/runner/test-skipper');
const RunnerEvents = require('../../../../lib/constants/runner-events');
const MochaStub = require('../../_mocha');
const path = require('path');
const proxyquire = require('proxyquire').noCallThru();
const _ = require('lodash');
const q = require('q');

describe('mocha-runner/mocha-adapter', () => {
    const sandbox = sinon.sandbox.create();

    let MochaAdapter;
    let browserAgent;
    let clearRequire;
    let testSkipper;

    const mkMochaAdapter_ = (opts, ctx) => {
        return MochaAdapter.create(opts || {}, browserAgent, ctx);
    };

    const mkBrowserStub_ = () => {
        return {publicAPI: Object.create({})};
    };

    beforeEach(() => {
        testSkipper = sinon.createStubInstance(TestSkipper);
        browserAgent = sinon.createStubInstance(BrowserAgent);

        clearRequire = sandbox.stub().named('clear-require');
        MochaAdapter = proxyquire('../../../../lib/runner/mocha-runner/mocha-adapter', {
            'clear-require': clearRequire,
            'mocha': MochaStub
        });

        sandbox.stub(logger);
    });

    afterEach(() => sandbox.restore());

    describe('prepare', () => {
        it('should add an empty hermione object to global', () => {
            MochaAdapter.prepare();

            assert.deepEqual(global.hermione, {});

            delete global.hermione;
        });
    });

    describe('constructor', () => {
        it('should pass shared opts to mocha instance', () => {
            mkMochaAdapter_({grep: 'foo'});

            assert.deepEqual(MochaStub.lastInstance.constructorArgs, {grep: 'foo'});
        });

        it('should enable full stacktrace in mocha', () => {
            mkMochaAdapter_();

            assert.called(MochaStub.lastInstance.fullTrace);
        });
    });

    describe('loadFile', () => {
        it('should be chainable', () => {
            const mochaAdapter = mkMochaAdapter_();

            assert.deepEqual(mochaAdapter.loadFile('path/to/file'), mochaAdapter);
        });

        it('should load file', () => {
            const mochaAdapter = mkMochaAdapter_();

            mochaAdapter.loadFile('path/to/file');

            assert.calledOnceWith(MochaStub.lastInstance.addFile, 'path/to/file');
        });

        it('should clear require cache for file before adding', () => {
            const mochaAdapter = mkMochaAdapter_();

            mochaAdapter.loadFile('path/to/file');

            assert.calledOnceWith(clearRequire, path.resolve('path/to/file'));
            assert.callOrder(clearRequire, MochaStub.lastInstance.addFile);
        });

        it('should load file after add', () => {
            const mochaAdapter = mkMochaAdapter_();

            mochaAdapter.loadFile('path/to/file');

            assert.calledOnce(MochaStub.lastInstance.loadFiles);
            assert.callOrder(MochaStub.lastInstance.addFile, MochaStub.lastInstance.loadFiles);
        });

        it('should flush files after load', () => {
            const mochaAdapter = mkMochaAdapter_();

            mochaAdapter.loadFile('path/to/file');

            assert.deepEqual(MochaStub.lastInstance.files, []);
        });
    });

    describe('reloadFiles', () => {
        it('should be chainable', () => {
            const mochaAdapter = mkMochaAdapter_();

            assert.deepEqual(mochaAdapter.reloadFiles(), mochaAdapter);
        });

        it('should reload file', () => {
            const mochaAdapter = mkMochaAdapter_();

            mochaAdapter.loadFile('path/to/file');

            MochaStub.lastInstance.addFile.reset();

            mochaAdapter.reloadFiles();

            assert.calledOnceWith(MochaStub.lastInstance.addFile, 'path/to/file');
        });

        it('should clear require cache for file before adding', () => {
            const mochaAdapter = mkMochaAdapter_();

            mochaAdapter.loadFile('path/to/file');

            MochaStub.lastInstance.addFile.reset();
            clearRequire.reset();

            mochaAdapter.reloadFiles();

            assert.calledOnceWith(clearRequire, path.resolve('path/to/file'));
            assert.callOrder(
                clearRequire,
                MochaStub.lastInstance.addFile
            );
        });

        it('should load file after add', () => {
            const mochaAdapter = mkMochaAdapter_();

            mochaAdapter.loadFile('path/to/file');

            MochaStub.lastInstance.addFile.reset();
            MochaStub.lastInstance.loadFiles.reset();

            mochaAdapter.reloadFiles();

            assert.calledOnce(MochaStub.lastInstance.loadFiles);
            assert.callOrder(MochaStub.lastInstance.addFile, MochaStub.lastInstance.loadFiles);
        });

        it('should flush files after load', () => {
            const mochaAdapter = mkMochaAdapter_();

            mochaAdapter
                .loadFile('path/to/file')
                .reloadFiles();

            assert.deepEqual(MochaStub.lastInstance.files, []);
        });
    });

    describe('hermione global', () => {
        beforeEach(() => MochaAdapter.prepare());
        afterEach(() => delete global.hermione);

        it('hermione.skip should return SkipBuilder instance', () => {
            mkMochaAdapter_();

            assert.instanceOf(global.hermione.skip, SkipBuilder);
        });

        it('hermione.only should return OnlyBuilder instance', () => {
            mkMochaAdapter_();

            assert.instanceOf(global.hermione.only, OnlyBuilder);
        });

        it('hermione.ctx should return passed ctx', () => {
            mkMochaAdapter_({}, {some: 'ctx'});

            assert.deepEqual(global.hermione.ctx, {some: 'ctx'});
        });
    });

    describe('inject browser', () => {
        beforeEach(() => {
            browserAgent.getBrowser.returns(q(mkBrowserStub_()));
            browserAgent.freeBrowser.returns(q());
        });

        it('should request browser before suite execution', () => {
            const mochaAdapter = mkMochaAdapter_();

            MochaStub.lastInstance.updateSuiteTree((suite) => suite.addTest());

            return mochaAdapter.run()
                .then(() => assert.calledOnce(browserAgent.getBrowser));
        });

        it('should fail all suite tests if requesting of a browser fails', () => {
            const mochaAdapter = mkMochaAdapter_();
            const testFailSpy = sinon.spy();
            const error = new Error();

            browserAgent.getBrowser.returns(q.reject(error));

            MochaStub.lastInstance.updateSuiteTree((rootSuite) => {
                return rootSuite
                    .addTest({title: 'first-test'})
                    .addSuite(MochaStub.Suite.create(rootSuite).addTest({title: 'second-test'}).onFail(testFailSpy))
                    .onFail(testFailSpy);
            });

            return mochaAdapter.run()
                .then(() => {
                    assert.calledTwice(testFailSpy);
                    assert.calledWithMatch(testFailSpy, {error, test: {title: 'first-test'}});
                    assert.calledWithMatch(testFailSpy, {error, test: {title: 'second-test'}});
                });
        });

        it('should not request browsers for suite with one skipped test', () => {
            const mochaAdapter = mkMochaAdapter_();

            MochaStub.lastInstance.updateSuiteTree((suite) => suite.addTest({pending: true}));

            return mochaAdapter.run()
                .then(() => assert.notCalled(browserAgent.getBrowser));
        });

        it('should request browsers for suite with at least one non-skipped test', () => {
            const mochaAdapter = mkMochaAdapter_();

            MochaStub.lastInstance.updateSuiteTree((suite) => {
                return suite
                    .addTest({skipped: true})
                    .addTest();
            });

            return mochaAdapter.run()
                .then(() => assert.calledOnce(browserAgent.getBrowser));
        });

        it('should not request browsers for suite with nested skipped tests', () => {
            const mochaAdapter = mkMochaAdapter_();

            MochaStub.lastInstance.updateSuiteTree((suite) => {
                return suite
                    .addSuite(
                        MochaStub.Suite.create()
                            .addTest({pending: true})
                            .addTest({pending: true})
                    );
            });

            return mochaAdapter.run()
                .then(() => assert.notCalled(browserAgent.getBrowser));
        });

        it('should release browser after suite execution', () => {
            const browser = mkBrowserStub_();
            browserAgent.getBrowser.returns(q(browser));
            browserAgent.freeBrowser.returns(q());

            const mochaAdapter = mkMochaAdapter_();

            MochaStub.lastInstance.updateSuiteTree((suite) => suite.addTest());

            return mochaAdapter.run().then(() => {
                assert.calledOnce(browserAgent.freeBrowser);
                assert.calledWith(browserAgent.freeBrowser, browser);
            });
        });

        it('should disable mocha timeouts while setting browser hooks', () => {
            const suitePrototype = MochaStub.Suite.prototype;
            const beforeAllStub = sandbox.stub(suitePrototype, 'beforeAll');
            const afterAllStub = sandbox.stub(suitePrototype, 'afterAll');

            mkMochaAdapter_();
            const suite = MochaStub.lastInstance.suite;

            assert.callOrder(
                suite.enableTimeouts, // get current value of enableTimeouts
                suite.enableTimeouts.withArgs(false).named('disableTimeouts'),
                beforeAllStub,
                afterAllStub,
                suite.enableTimeouts.withArgs(true).named('restoreTimeouts')
            );
        });

        it('should not be rejected if freeBrowser failed', () => {
            const browser = mkBrowserStub_();

            browserAgent.getBrowser.returns(q(browser));
            browserAgent.freeBrowser.returns(q.reject('some-error'));

            const mochaAdapter = mkMochaAdapter_();

            MochaStub.lastInstance.updateSuiteTree((suite) => suite.addTest());

            return mochaAdapter.run()
                .then(() => {
                    assert.calledOnce(logger.warn);
                    assert.calledWithMatch(logger.warn, /some-error/);
                });
        });
    });

    describe('inject skip', () => {
        let mochaAdapter;

        beforeEach(() => {
            browserAgent.getBrowser.returns(q(mkBrowserStub_()));
            browserAgent.freeBrowser.returns(q());
            sandbox.stub(Skip.prototype, 'handleEntity');

            mochaAdapter = mkMochaAdapter_();
        });

        it('should apply skip to test', () => {
            const test = new MochaStub.Test();

            MochaStub.lastInstance.updateSuiteTree((suite) => suite.addTest(test));

            return mochaAdapter.run()
                .then(() => {
                    assert.called(Skip.prototype.handleEntity);
                    assert.calledWith(Skip.prototype.handleEntity, test);
                });
        });

        it('should apply skip to suite', () => {
            const nestedSuite = MochaStub.Suite.create();

            MochaStub.lastInstance.updateSuiteTree((suite) => suite.addSuite(nestedSuite));

            return mochaAdapter.run()
                .then(() => {
                    assert.called(Skip.prototype.handleEntity);
                    assert.calledWith(Skip.prototype.handleEntity, nestedSuite);
                });
        });
    });

    describe('applySkip', () => {
        it('should skip suite using test skipper', () => {
            const mochaAdapter = mkMochaAdapter_();
            browserAgent.browserId = 'some-browser';

            mochaAdapter.applySkip(testSkipper);

            assert.calledWith(testSkipper.applySkip, MochaStub.lastInstance.suite, 'some-browser');
        });

        it('should be chainable', () => {
            const mochaAdapter = mkMochaAdapter_();
            const mochaInstance = mochaAdapter.applySkip(testSkipper);

            assert.instanceOf(mochaInstance, MochaAdapter);
        });
    });

    describe('inject execution context', () => {
        let browser;
        let mochaAdapter;

        beforeEach(() => {
            browser = mkBrowserStub_();
            browserAgent.getBrowser.returns(q(browser));
            browserAgent.freeBrowser.returns(q());

            mochaAdapter = mkMochaAdapter_();
        });

        it('should add execution context to browser', () => {
            const test = new MochaStub.Test();
            MochaStub.lastInstance.updateSuiteTree((suite) => suite.addTest(test));

            return mochaAdapter.run()
                .then(() => assert.includeMembers(_.keys(browser.publicAPI.executionContext), _.keys(test)));
        });

        it('should handle nested tests', () => {
            let nestedSuite = MochaStub.Suite.create();
            let nestedSuiteTest;

            MochaStub.lastInstance.updateSuiteTree((suite) => {
                suite.addSuite(nestedSuite);

                nestedSuiteTest = new MochaStub.Test();
                nestedSuite.addTest(nestedSuiteTest);
                return suite;
            });

            return mochaAdapter.run()
                .then(() => {
                    assert.includeMembers(
                        _.keys(browser.publicAPI.executionContext),
                        _.keys(nestedSuiteTest)
                    );
                });
        });

        it('should add browser id to the context', () => {
            BrowserAgent.prototype.browserId = 'some-browser';

            MochaStub.lastInstance.updateSuiteTree((suite) => suite.addTest());

            return mochaAdapter.run()
                .then(() => assert.property(browser.publicAPI.executionContext, 'browserId', 'some-browser'));
        });

        it('should add execution context to the browser prototype', () => {
            BrowserAgent.prototype.browserId = 'some-browser';

            MochaStub.lastInstance.updateSuiteTree((suite) => suite.addTest());

            return mochaAdapter.run()
                .then(() => assert.property(Object.getPrototypeOf(browser.publicAPI), 'executionContext'));
        });
    });

    describe('attachTestFilter', () => {
        it('should pass tests and its index in a file to a filter function', () => {
            const shouldRun = sandbox.stub();

            mkMochaAdapter_()
                .attachTestFilter(shouldRun)
                .loadFile('some/file');

            const test1 = new MochaStub.Test();
            const test2 = new MochaStub.Test();

            MochaStub.lastInstance.updateSuiteTree((suite) => {
                return suite
                    .addTest(test1)
                    .addTest(test2);
            });

            assert.calledTwice(shouldRun);
            assert.calledWith(shouldRun, test1, 0);
            assert.calledWith(shouldRun, test2, 1);
        });

        it('should restore an index for tests before loading of a file', () => {
            const shouldRun = sandbox.stub().returns(true);
            const mochaAdapter = mkMochaAdapter_();

            mochaAdapter
                .attachTestFilter(shouldRun)
                .loadFile('some/file');

            MochaStub.lastInstance.updateSuiteTree((suite) => suite.addTest(new MochaStub.Test()));
            mochaAdapter.loadFile('some/file');
            MochaStub.lastInstance.updateSuiteTree((suite) => suite.addTest(new MochaStub.Test()));

            assert.alwaysCalledWith(shouldRun, sinon.match.any, 0);
        });

        it('should not remove test which expected to be run', () => {
            const testSpy = sinon.spy();
            const shouldRun = () => true;
            const mochaAdapter = mkMochaAdapter_();
            mochaAdapter.attachTestFilter(shouldRun);

            MochaStub.lastInstance.updateSuiteTree((suite) => {
                return suite
                    .addTest({title: 'test1'})
                    .addTest({title: 'test2'})
                    .onTestBegin(testSpy);
            });

            return mochaAdapter.run()
                .then(() => {
                    assert.calledTwice(testSpy);
                    assert.calledWithMatch(testSpy.firstCall, {title: 'test1'});
                    assert.calledWithMatch(testSpy.secondCall, {title: 'test2'});
                });
        });

        it('should remove test which does not suppose to be run', () => {
            const testSpy = sinon.spy();
            const shouldRun = sandbox.stub();
            shouldRun.onFirstCall().returns(true);
            shouldRun.onSecondCall().returns(false);

            const mochaAdapter = mkMochaAdapter_();
            mochaAdapter.attachTestFilter(shouldRun);

            MochaStub.lastInstance.updateSuiteTree((suite) => {
                return suite
                    .addTest({title: 'test1'})
                    .addTest({title: 'test2'})
                    .onTestBegin(testSpy);
            });

            return mochaAdapter.run()
                .then(() => {
                    assert.calledOnce(testSpy);
                    assert.calledWithMatch(testSpy.firstCall, {title: 'test1'});
                });
        });
    });

    describe('tests', () => {
        it('should return filtered tests', () => {
            const mochaAdapter = mkMochaAdapter_();
            const shouldRun = sandbox.stub()
                .onFirstCall().returns(true)
                .onSecondCall().returns(false);

            mochaAdapter.attachTestFilter(shouldRun);

            const test1 = new MochaStub.Test();
            const test2 = new MochaStub.Test();
            MochaStub.lastInstance.updateSuiteTree((suite) => {
                return suite
                    .addTest(test1)
                    .addTest(test2);
            });

            assert.deepEqual(mochaAdapter.tests, [test1]);
        });

        it('should restore tests storage after reinit', () => {
            const mochaAdapter = mkMochaAdapter_();

            mochaAdapter.attachTestFilter(sandbox.stub().returns(true));

            MochaStub.lastInstance.updateSuiteTree((suite) => suite.addTest(new MochaStub.Test()));

            mochaAdapter.reinit();

            assert.deepEqual(mochaAdapter.tests, []);
        });
    });

    describe('passthrough mocha events', () => {
        let mochaAdapter;

        beforeEach(() => {
            sandbox.stub(ProxyReporter.prototype, '__constructor');
            mochaAdapter = mkMochaAdapter_();
            sandbox.spy(mochaAdapter, 'emit').named('emit');
        });

        function passthroughMochaEvents_() {
            const Reporter = MochaStub.lastInstance.reporter.lastCall.args[0];
            new Reporter(); // eslint-disable-line no-new
        }

        it('should set mocha reporter as proxy reporter in order to proxy events to emit fn', () => {
            passthroughMochaEvents_();

            assert.calledOnce(ProxyReporter.prototype.__constructor);
        });

        it('should pass to proxy reporter emit fn', () => {
            passthroughMochaEvents_();

            const emit_ = ProxyReporter.prototype.__constructor.firstCall.args[0];
            emit_('some-event', {some: 'data'});

            assert.calledOnce(mochaAdapter.emit);
            assert.calledWith(mochaAdapter.emit, 'some-event', sinon.match({some: 'data'}));
        });

        it('should pass to proxy reporter getter for requested browser', () => {
            const browser = mkBrowserStub_();
            browserAgent.getBrowser.returns(q(browser));
            passthroughMochaEvents_();

            MochaStub.lastInstance.updateSuiteTree((suite) => suite.addTest());

            return mochaAdapter.run()
                .then(() => {
                    const getBrowser = ProxyReporter.prototype.__constructor.lastCall.args[1];
                    assert.equal(browser, getBrowser());
                });
        });

        it('should pass to proxy reporter getter for browser id if browser not requested', () => {
            browserAgent.browserId = 'some-browser';

            passthroughMochaEvents_();

            const getBrowser = ProxyReporter.prototype.__constructor.lastCall.args[1];
            assert.deepEqual(getBrowser(), {id: 'some-browser'});
        });

        describe('if event handler throws', () => {
            const initBadHandler_ = (event, handler) => {
                mochaAdapter.on(event, handler);

                passthroughMochaEvents_();
                return ProxyReporter.prototype.__constructor.firstCall.args[0];
            };

            it('proxy should rethrow error', () => {
                const emit_ = initBadHandler_('foo', () => {
                    throw new Error(new Error('bar'));
                });

                assert.throws(() => emit_('foo'), /bar/);
            });

            it('run should be rejected', () => {
                const emit_ = initBadHandler_('foo', () => {
                    throw new Error('bar');
                });

                const promise = mochaAdapter.run();

                try {
                    emit_('foo');
                } catch (e) {
                    // eslint иди лесом
                }

                return assert.isRejected(promise, /bar/);
            });
        });

        describe('file events', () => {
            beforeEach(() => MochaAdapter.init());
            afterEach(() => delete global.hermione);

            _.forEach({
                'pre-require': 'BEFORE_FILE_READ',
                'post-require': 'AFTER_FILE_READ'
            }, (hermioneEvent, mochaEvent) => {
                it(`should emit ${hermioneEvent} on mocha ${mochaEvent}`, () => {
                    browserAgent.browserId = 'bro';

                    MochaStub.lastInstance.suite.emit(mochaEvent, {}, '/some/file.js');

                    assert.calledOnce(mochaAdapter.emit);
                    assert.calledWith(mochaAdapter.emit, RunnerEvents[hermioneEvent], {
                        file: '/some/file.js',
                        hermione: global.hermione,
                        browser: 'bro',
                        suite: mochaAdapter.suite
                    });
                });
            });
        });
    });

    describe('"before" hook error handling', () => {
        let mochaAdapter;

        beforeEach(() => {
            browserAgent.getBrowser.returns(q(mkBrowserStub_()));
            browserAgent.freeBrowser.returns(q());

            mochaAdapter = mkMochaAdapter_();
        });

        it('should not launch suite original test if "before" hook failed', () => {
            const testCb = sinon.spy();

            MochaStub.lastInstance.updateSuiteTree((suite) => {
                return suite
                    .beforeAll(() => q.reject(new Error()))
                    .addTest({fn: testCb});
            });

            return mochaAdapter.run()
                .then(() => assert.notCalled(testCb));
        });

        it('should fail all suite tests with "before" hook error', () => {
            const error = new Error();
            const testFailSpy = sinon.spy();

            MochaStub.lastInstance.updateSuiteTree((rootSuite) => {
                return rootSuite
                    .beforeAll(() => q.reject(error))
                    .addTest({title: 'first-test'})
                    .addSuite(MochaStub.Suite.create(rootSuite).addTest({title: 'second-test'}).onFail(testFailSpy))
                    .onFail(testFailSpy);
            });

            return mochaAdapter.run()
                .then(() => {
                    assert.calledTwice(testFailSpy);
                    assert.calledWithMatch(testFailSpy, {error, test: {title: 'first-test'}});
                    assert.calledWithMatch(testFailSpy, {error, test: {title: 'second-test'}});
                });
        });

        it('should handle sync "before hook" errors', () => {
            const testFailSpy = sinon.spy();

            MochaStub.lastInstance.updateSuiteTree((suite) => {
                return suite
                    .beforeAll(() => {
                        throw new Error();
                    })
                    .addTest({title: 'some-test'})
                    .onFail(testFailSpy);
            });

            return mochaAdapter.run()
                .then(() => assert.calledOnce(testFailSpy));
        });

        it('should not execute "before each" hook if "before" hook failed at the same level', () => {
            const beforeEachHookFn = sinon.spy();

            MochaStub.lastInstance.updateSuiteTree((suite) => {
                return suite
                    .beforeAll(() => q.reject(new Error()))
                    .beforeEach(beforeEachHookFn)
                    .addTest();
            });

            return mochaAdapter.run()
                .then(() => assert.notCalled(beforeEachHookFn));
        });

        it('should not execute "before each" hook if "before" hook has already failed on a higher level', () => {
            const beforeEachHookFn = sinon.spy();

            MochaStub.lastInstance.updateSuiteTree((rootSuite) => {
                const suite = MochaStub.Suite.create();

                rootSuite
                    .beforeAll(() => q.reject(new Error()))
                    .addSuite(suite);

                suite.beforeEach(beforeEachHookFn).addTest();

                return rootSuite;
            });

            return mochaAdapter.run()
                .then(() => assert.notCalled(beforeEachHookFn));
        });

        it('should not execute "before" hook if another one has already failed on a higher level', () => {
            const beforeAllHookFn = sandbox.spy();

            MochaStub.lastInstance.updateSuiteTree((rootSuite) => {
                const suite = MochaStub.Suite.create();

                rootSuite
                    .beforeAll(() => q.reject(new Error()))
                    .addSuite(suite);

                suite.beforeAll(beforeAllHookFn).addTest();

                return rootSuite;
            });

            return mochaAdapter.run()
                .then(() => assert.notCalled(beforeAllHookFn));
        });

        it('should not execute "before each" hook if "before" hook has already failed on a lower level', () => {
            const beforeEachHookFn = sandbox.spy();

            MochaStub.lastInstance.updateSuiteTree((rootSuite) => {
                const suite = MochaStub.Suite.create();

                rootSuite
                    .beforeEach(beforeEachHookFn)
                    .addSuite(suite);

                suite.beforeAll(() => q.reject(new Error())).addTest();

                return rootSuite;
            });

            return mochaAdapter.run()
                .then(() => assert.notCalled(beforeEachHookFn));
        });

        it('should fail suite tests with error from "before" hook if "before each" hook is present at the same level', () => {
            const error = new Error();
            const hookFailSpy = sinon.spy();

            MochaStub.lastInstance.updateSuiteTree((suite) => {
                return suite
                    .beforeAll(() => q.reject(error))
                    .beforeEach(() => true)
                    .addTest()
                    .addTest()
                    .onFail(hookFailSpy);
            });

            return mochaAdapter.run()
                .then(() => {
                    assert.calledTwice(hookFailSpy);
                    assert.calledWithMatch(hookFailSpy, {error});
                });
        });
    });

    describe('"before each" hook error handling', () => {
        let mochaAdapter;

        beforeEach(() => {
            browserAgent.getBrowser.returns(q(mkBrowserStub_()));
            browserAgent.freeBrowser.returns(q());

            mochaAdapter = mkMochaAdapter_();
        });

        it('should not execute original suite test if "before each" hook failed', () => {
            const testCb = sinon.spy();

            MochaStub.lastInstance.updateSuiteTree((suite) => {
                return suite
                    .beforeEach(() => q.reject(new Error()))
                    .addTest({fn: testCb});
            });

            return mochaAdapter.run()
                .then(() => assert.notCalled(testCb));
        });

        it('should execute original suite test if "before each" hook was executed successfully', () => {
            const testCb = sinon.spy();

            MochaStub.lastInstance.updateSuiteTree((suite) => {
                return suite
                    .beforeEach(_.noop)
                    .addTest({fn: testCb});
            });

            return mochaAdapter.run()
                .then(() => assert.called(testCb));
        });

        it('should fail test with error from "before each" hook', () => {
            const error = new Error();
            const testFailSpy = sinon.spy();

            MochaStub.lastInstance.updateSuiteTree((suite) => {
                return suite
                    .beforeEach(() => q.reject(error))
                    .addTest({title: 'some-test'})
                    .onFail(testFailSpy);
            });

            return mochaAdapter.run()
                .then(() => assert.calledWithMatch(testFailSpy, {error, test: {title: 'some-test'}}));
        });

        it('should handle sync "before each" hook errors', () => {
            const testFailSpy = sinon.spy();

            MochaStub.lastInstance.updateSuiteTree((suite) => {
                return suite
                    .beforeEach(() => {
                        throw new Error();
                    })
                    .addTest({title: 'some-test'})
                    .onFail(testFailSpy);
            });

            return mochaAdapter.run()
                .then(() => assert.calledOnce(testFailSpy));
        });

        it('should not execute "before each" hook if another one has already failed on a higher level', () => {
            const beforeEachHookFn = sandbox.spy();

            MochaStub.lastInstance.updateSuiteTree((rootSuite) => {
                const suite = MochaStub.Suite.create(rootSuite);

                rootSuite
                    .beforeEach(() => q.reject(new Error()))
                    .addSuite(suite);

                suite.beforeEach(beforeEachHookFn).addTest();

                return rootSuite;
            });

            return mochaAdapter.run()
                .then(() => assert.notCalled(beforeEachHookFn));
        });
    });
});
