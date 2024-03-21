"use strict";

const { AsyncEmitter } = require("../../events/async-emitter");
const { passthroughEvent } = require("../../events/utils");
const { WorkerEvents } = require("../../events");
const BrowserPool = require("./browser-pool");
const BrowserAgent = require("./browser-agent");
const NodejsEnvTestRunner = require("./test-runner");
const { TestRunner: BrowserEnvTestRunner } = require("../browser-env/runner/test-runner");
const CachingTestParser = require("./caching-test-parser");
const { isRunInNodeJsEnv } = require("../../utils/config");

module.exports = class Runner extends AsyncEmitter {
    static create(config) {
        return new Runner(config);
    }

    constructor(config) {
        super();

        this._config = config;
        this._browserPool = BrowserPool.create(this._config, this);

        this._testParser = CachingTestParser.create(config);
        passthroughEvent(this._testParser, this, [
            WorkerEvents.BEFORE_FILE_READ,
            WorkerEvents.AFTER_FILE_READ,
            WorkerEvents.AFTER_TESTS_READ,
        ]);
    }

    async runTest(fullTitle, { browserId, browserVersion, file, sessionId, sessionCaps, sessionOpts, state }) {
        const tests = await this._testParser.parse({ file, browserId });
        const test = tests.find(t => t.fullTitle() === fullTitle);
        const browserAgent = BrowserAgent.create({ id: browserId, version: browserVersion, pool: this._browserPool });
        const runner = (isRunInNodeJsEnv(this._config) ? NodejsEnvTestRunner : BrowserEnvTestRunner).create({
            test,
            file,
            config: this._config.forBrowser(browserId),
            browserAgent,
        });

        return runner.run({ sessionId, sessionCaps, sessionOpts, state });
    }
};
