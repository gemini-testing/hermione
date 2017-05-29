'use strict';

const EventEmitter = require('events').EventEmitter;
const _ = require('lodash');
const q = require('q');
const BrowserAgent = require('../../../../lib/browser-agent');
const RunnerEvents = require('../../../../lib/constants/runner-events');
const MochaAdapter = require('../../../../lib/runner/mocha-runner/mocha-adapter');
const MochaRunner = require('../../../../lib/runner/mocha-runner');
const RetryMochaRunner = require('../../../../lib/runner/mocha-runner/retry-mocha-runner');
const TestSkipper = require('../../../../lib/runner/test-skipper');
const MochaBuilder = require('../../../../lib/runner/mocha-runner/mocha-builder');
const MochaStub = require('../../_mocha');

describe('mocha-runner', () => {
    const sandbox = sinon.sandbox.create();

    const stubConfig_ = (config) => {
        return _.defaults(config || {}, {
            system: {mochaOpts: {}, ctx: {}},
            forBrowser: sandbox.stub().returns({})
        });
    };
    const createMochaRunner_ = () => {
        return new MochaRunner(
            stubConfig_(),
            sinon.createStubInstance(BrowserAgent),
            sinon.createStubInstance(TestSkipper)
        );
    };

    const init_ = (suites) => createMochaRunner_().init(suites || ['test_suite']);
    const run_ = (suites) => init_(suites).run();

    beforeEach(() => {
        sandbox.stub(MochaAdapter, 'prepare');
        sandbox.stub(RetryMochaRunner.prototype, 'run');
        sandbox.stub(MochaBuilder.prototype, 'buildAdapters').returns([]);
    });

    afterEach(() => sandbox.restore());

    describe('constructor', () => {
        it('should create mocha adapter builder', () => {
            sandbox.spy(MochaBuilder, 'create');

            const config = stubConfig_({system: {foo: 'bar'}});
            const browserAgent = {browserId: 'bro'};
            const testSkipper = {baz: 'qux'};

            MochaRunner.create(config, browserAgent, testSkipper);

            assert.calledOnceWith(MochaBuilder.create, {foo: 'bar'}, browserAgent, testSkipper);
        });

        describe('should passthrough events from a mocha builder', () => {
            const events = [
                RunnerEvents.BEFORE_FILE_READ,
                RunnerEvents.AFTER_FILE_READ
            ];

            events.forEach((event) => {
                it(`${event}`, () => {
                    const mochaBuilder = new EventEmitter();
                    sandbox.stub(MochaBuilder, 'create').returns(mochaBuilder);

                    const mochaRunner = createMochaRunner_();
                    const spy = sinon.spy();

                    mochaRunner.on(event, spy);
                    mochaBuilder.emit(event, 'some-data');

                    assert.calledOnceWith(spy, 'some-data');
                });
            });
        });
    });

    describe('prepare', () => {
        it('should prepare mocha adapter', () => {
            MochaRunner.prepare();

            assert.calledOnce(MochaAdapter.prepare);
        });
    });

    describe('init', () => {
        it('should pass files to mocha adapter builder', () => {
            init_(['some/file', 'other/file']);

            assert.calledOnceWith(MochaBuilder.prototype.buildAdapters, ['some/file', 'other/file']);
        });

        it('should pass a tests per session value to mocha adapter builder', () => {
            const config = stubConfig_();
            config.forBrowser.withArgs('bro').returns({testsPerSession: 1});

            MochaRunner.create(config, {browserId: 'bro'}).init();

            assert.calledOnceWith(MochaBuilder.prototype.buildAdapters, sinon.match.any, 1);
        });

        it('should return an instance of mocha runner', () => {
            const mochaRunner = createMochaRunner_();

            assert.deepEqual(mochaRunner.init(), mochaRunner);
        });

        it('should throw in case of duplicate test titles in mocha adapters', () => {
            const mocha1 = new MochaStub();
            const mocha2 = new MochaStub();

            mocha1.updateSuiteTree((suite) => {
                return suite
                    .addTest({title: 'some test', file: 'first file'});
            });

            mocha2.updateSuiteTree((suite) => {
                return suite
                    .addTest({title: 'some test', file: 'second file'});
            });

            MochaBuilder.prototype.buildAdapters.returns([{suite: mocha1.suite}, {suite: mocha2.suite}]);

            assert.throws(() => init_(),
                'Tests with the same title \'some test\' in files \'first file\' and \'second file\' can\'t be used');
        });

        it('should does not throw on mocha adapters without duplicates', () => {
            const mocha1 = new MochaStub();
            const mocha2 = new MochaStub();

            mocha1.updateSuiteTree((suite) => {
                return suite
                    .addTest({title: 'first test', file: 'first file'});
            });

            mocha2.updateSuiteTree((suite) => {
                return suite
                    .addTest({title: 'second test', file: 'second file'});
            });

            MochaBuilder.prototype.buildAdapters.returns([{suite: mocha1.suite}, {suite: mocha2.suite}]);

            assert.doesNotThrow(() => init_());
        });
    });

    describe('run', () => {
        it('should wrap each mocha instance into a retry runner', () => {
            const mocha1 = new MochaStub();
            const mocha2 = new MochaStub();

            MochaBuilder.prototype.buildAdapters.returns([mocha1, mocha2]);
            sandbox.spy(RetryMochaRunner, 'create');

            return run_()
                .then(() => {
                    assert.calledTwice(RetryMochaRunner.create);
                    assert.calledWith(RetryMochaRunner.create, mocha1);
                    assert.calledWith(RetryMochaRunner.create, mocha2);
                });
        });

        it('should create a retry runner for a passed browser', () => {
            MochaBuilder.prototype.buildAdapters.returns([new MochaStub()]);
            sandbox.spy(RetryMochaRunner, 'create');

            const config = stubConfig_();
            config.forBrowser.withArgs('bro').returns({retry: 10});

            return MochaRunner.create(config, {browserId: 'bro'}).init().run()
                .then(() => assert.calledOnceWith(RetryMochaRunner.create, sinon.match.any, {retry: 10}));
        });

        it('should run mocha instances via a retry runner', () => {
            const mocha = new MochaStub();
            sandbox.stub(mocha, 'run');
            MochaBuilder.prototype.buildAdapters.returns([mocha]);

            return run_()
                .then(() => {
                    assert.notCalled(mocha.run);
                    assert.calledOnce(RetryMochaRunner.prototype.run);
                });
        });

        it('should wait until all mocha instances will finish their work', () => {
            const firstResolveMarker = sandbox.stub().named('First resolve marker');
            const secondResolveMarker = sandbox.stub().named('Second resolve marker');

            MochaBuilder.prototype.buildAdapters.returns([
                new MochaStub(),
                new MochaStub()
            ]);

            RetryMochaRunner.prototype.run
                .onFirstCall().callsFake(() => q().then(firstResolveMarker))
                .onSecondCall().callsFake(() => q.delay(1).then(secondResolveMarker));

            return run_()
                .then(() => {
                    assert.called(firstResolveMarker);
                    assert.called(secondResolveMarker);
                });
        });

        it('should be rejected if one of mocha instances rejected on run', () => {
            MochaBuilder.prototype.buildAdapters.returns([new MochaStub()]);

            RetryMochaRunner.prototype.run.returns(q.reject('Error'));

            return assert.isRejected(run_(), /Error/);
        });

        describe('should passthrough events from a', () => {
            const testPassthroughing = (event, from) => {
                RetryMochaRunner.prototype.run.callsFake(() => from.emit(event, 'some-data'));

                const mochaRunner = createMochaRunner_();
                const spy = sinon.spy();

                mochaRunner.on(event, spy);

                return mochaRunner.init().run()
                    .then(() => assert.calledOnceWith(spy, 'some-data'));
            };

            describe('mocha runner', () => {
                const events = [
                    RunnerEvents.SUITE_BEGIN,
                    RunnerEvents.SUITE_END,

                    RunnerEvents.TEST_BEGIN,
                    RunnerEvents.TEST_END,

                    RunnerEvents.TEST_PASS,
                    RunnerEvents.TEST_PENDING,

                    RunnerEvents.INFO,
                    RunnerEvents.WARNING
                ];

                events.forEach((event) => {
                    it(`${event}`, () => {
                        const mocha = new MochaStub();
                        MochaBuilder.prototype.buildAdapters.returns([mocha]);

                        return testPassthroughing(event, mocha);
                    });
                });
            });

            describe('retry wrapper', () => {
                const events = [
                    RunnerEvents.TEST_FAIL,
                    RunnerEvents.RETRY,
                    RunnerEvents.ERROR
                ];

                events.forEach((event) => {
                    it(`${event}`, () => {
                        const retryMochaRunner = Object.create(RetryMochaRunner.prototype);
                        sandbox.stub(RetryMochaRunner, 'create').returns(retryMochaRunner);

                        MochaBuilder.prototype.buildAdapters.returns([new MochaStub()]);

                        return testPassthroughing(event, retryMochaRunner);
                    });
                });
            });
        });
    });

    describe('buildSuiteTree', () => {
        it('should build suite tree for specified paths', () => {
            MochaBuilder.prototype.buildAdapters.returns([new MochaStub()]);

            const mochaRunner = createMochaRunner_();
            mochaRunner.buildSuiteTree(['some/path']);

            assert.calledOnceWith(MochaBuilder.prototype.buildAdapters, ['some/path']);
        });

        it('should return suite of mocha-adapter', () => {
            const mochaRunner = createMochaRunner_();
            const suite = {foo: 'bar'};
            MochaBuilder.prototype.buildAdapters.returns([{suite}]);

            const suiteTree = mochaRunner.buildSuiteTree();
            assert.deepEqual(suiteTree, suite);
        });

        describe('should passthrough events from a mocha runner', () => {
            const events = [
                RunnerEvents.BEFORE_FILE_READ,
                RunnerEvents.AFTER_FILE_READ
            ];

            events.forEach((event) => {
                it(`${event}`, () => {
                    MochaBuilder.prototype.buildAdapters.callsFake(function() {
                        this.emit(event, 'some-data');
                        return [new MochaStub()];
                    });

                    const mochaRunner = createMochaRunner_();
                    const spy = sinon.spy();

                    mochaRunner.on(event, spy);
                    mochaRunner.buildSuiteTree(['path/to/file']);

                    assert.calledOnceWith(spy, 'some-data');
                });
            });
        });
    });
});
