'use strict';

const EventEmitter = require('events').EventEmitter;
const logger = require('lib/utils/logger');
const PlainReporter = require('lib/reporters/plain');
const RunnerEvents = require('lib/constants/runner-events');

const mkTestStub_ = require('./utils').mkTestStub_;
const getDeserializedResult = require('./utils').getDeserializedResult;

describe('Plain reporter', () => {
    const sandbox = sinon.sandbox.create();

    let test;
    let emitter;
    let stdout;

    const emit = (event, data) => {
        emitter.emit(RunnerEvents.RUNNER_START);
        if (event) {
            emitter.emit(event, data);
        }
        emitter.emit(RunnerEvents.RUNNER_END, {});
    };

    beforeEach(() => {
        test = mkTestStub_();

        const reporter = new PlainReporter();

        emitter = new EventEmitter();
        reporter.attachRunner(emitter);

        stdout = '';
        sandbox.stub(logger, 'log').callsFake((str) => stdout += `${str}\n`);

        sandbox.stub(logger, 'warn');
        sandbox.stub(logger, 'error');
    });

    afterEach(() => sandbox.restore());

    describe('success tests report', () => {
        it('should log correct info about test', () => {
            test = mkTestStub_({
                fullTitle: () => 'some test title',
                title: 'test title',
                file: 'some/path/file.js',
                browserId: 'bro',
                duration: '100'
            });

            emit(RunnerEvents.TEST_PASS, test);

            assert.match(
                getDeserializedResult(stdout),
                /some test title \[bro\] - 100ms/
            );
        });
    });

    const testStates = {
        RETRY: 'retried',
        TEST_FAIL: 'failed'
    };

    ['RETRY', 'TEST_FAIL'].forEach((event) => {
        describe(`${testStates[event]} tests report`, () => {
            it(`should log correct info about test`, () => {
                test = mkTestStub_({
                    fullTitle: () => 'some test title',
                    title: 'test title',
                    file: 'some/path/file.js',
                    browserId: 'bro',
                    duration: '100',
                    err: {stack: 'some error stack'}
                });

                emit(RunnerEvents[event], test);

                console.log(stdout);
                assert.match(
                    getDeserializedResult(stdout),
                    /some test title \[bro\] - 100ms\s.+some\/path\/file.js\s.+some error stack/
                );
            });

            it('should extend error with original selenium error if it exist', () => {
                test = mkTestStub_({
                    err: {
                        stack: 'some stack',
                        seleniumStack: {
                            orgStatusMessage: 'some original message'
                        }
                    }
                });

                emit(RunnerEvents[event], test);

                assert.match(stdout, /some stack \(some original message\)/);
            });
        });
    });
});
