"use strict";

const _ = require("lodash");
const Browser = require("../src/browser/new-browser");
const { NODEJS_TEST_RUN_ENV } = require("../src/constants/config");

function browserWithId(id) {
    const config = { browsers: {}, system: { debug: false } };

    config.forBrowser = () => ({ capabilities: { browserName: id } });

    return new Browser(config, id);
}

function makeConfigStub(opts = {}) {
    opts = _.defaults(opts, {
        baseUrl: "http://default.com",
        browsers: ["some-default-browser"],
        version: "1.0",
        desiredCapabilities: {},
        retry: 0,
        sessionsPerBrowser: 1,
        testsPerSession: Infinity,
        configPath: "some-default-config-path",
        resetCursor: true,
        system: {
            mochaOpts: {},
            expectOpts: {},
            patternsOnReject: [],
            testRunEnv: NODEJS_TEST_RUN_ENV,
        },
        sets: {},
    });

    const config = {
        browsers: {},
        plugins: opts.plugins,
        system: opts.system,
        sets: opts.sets,
        configPath: opts.configPath,
    };

    opts.browsers.forEach(browserId => {
        config.browsers[browserId] = makeBrowserConfigStub(opts, browserId);
    });

    config.forBrowser = sinon
        .stub()
        .callsFake(browserId => config.browsers[browserId] || makeBrowserConfigStub(opts, browserId));
    config.getBrowserIds = () => opts.browsers;
    config.serialize = sinon.stub().returns(config);
    config.mergeWith = sinon.stub();

    return config;
}

function makeBrowserConfigStub(opts = {}, browserId) {
    return {
        baseUrl: opts.baseUrl,
        retry: opts.retry,
        shouldRetry: opts.shouldRetry,
        sessionsPerBrowser: opts.sessionsPerBrowser,
        testsPerSession: opts.testsPerSession,
        desiredCapabilities: _.isEmpty(opts.desiredCapabilities)
            ? { browserName: browserId, version: opts.version }
            : opts.desiredCapabilities,
        testTimeout: opts.testTimeout,
        system: opts.system,
        urlHttpTimeout: opts.urlHttpTimeout,
    };
}

function makeSuite(opts = {}) {
    return _.defaults(opts, {
        root: false,
        id: () => "default-id",
        parent: { root: true },
        title: "default-suite",
        fullTitle: () => "default-suite",
        eachTest: () => {},
    });
}

function makeTest(opts = {}) {
    return _.defaults(opts, {
        id: "some-default-id",
        parent: makeSuite(),
        title: "default-test",
        browserId: "yabro",
        fullTitle: () => "default-test",
    });
}

exports.browserWithId = browserWithId;
exports.makeConfigStub = makeConfigStub;
exports.makeBrowserConfigStub = makeBrowserConfigStub;
exports.makeSuite = makeSuite;
exports.makeTest = makeTest;
