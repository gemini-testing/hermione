'use strict';

const _ = require('lodash');

const getAsyncEvents = () => ({
    INIT: 'init',

    RUNNER_START: 'startRunner',
    RUNNER_END: 'endRunner',

    SESSION_START: 'startSession',
    RUNNER_BEFORE_END: 'beforeEndRunner',
    SESSION_END: 'endSession',

    BEGIN: 'begin',

    EXIT: 'exit'
});

const getSyncEvents = () => ({
    CLI: 'cli',

    BEFORE_FILE_READ: 'beforeFileRead',
    AFTER_FILE_READ: 'afterFileRead',

    AFTER_TESTS_READ: 'afterTestsRead',

    SUITE_BEGIN: 'beginSuite',
    SUITE_END: 'endSuite',

    TEST_BEGIN: 'beginTest',
    TEST_END: 'endTest',

    TEST_PASS: 'passTest',
    TEST_FAIL: 'failTest',
    TEST_PENDING: 'pendingTest',

    RETRY: 'retry',

    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'err'
});

let events = _.extend(getSyncEvents(), getAsyncEvents());

Object.defineProperty(events, 'getSync', {value: getSyncEvents, enumerable: false});
Object.defineProperty(events, 'getAsync', {value: getAsyncEvents, enumerable: false});

module.exports = events;
