'use strict';

const _ = require('lodash');
const Runner = require('../runner');
const logger = require('../../utils/logger');
const Events = require('../../constants/runner-events');
const AssertViewResults = require('../../browser/commands/assert-view/assert-view-results');

module.exports = class RegularTestRunner extends Runner {
    constructor(test, browserAgent) {
        super();

        this._test = Object.create(test);
        this._browserAgent = browserAgent;
        this._browser = null;
    }

    async run(workers) {
        let freeBrowserPromise;

        try {
            const browser = await this._getBrowser();

            if (browser) {
                workers.once(`worker.${browser.sessionId}.freeBrowser`, (browserState) => {
                    freeBrowserPromise = this._freeBrowser(browserState);
                });
            }

            this._emit(Events.TEST_BEGIN);

            this._test.startTime = Date.now();

            const results = await this._runTest(workers);
            this._applyTestResults(results);

            this._emit(Events.TEST_PASS);
        } catch (error) {
            this._test.err = error;

            this._applyTestResults(error);

            this._emit(Events.TEST_FAIL);
        }

        this._emit(Events.TEST_END);

        await (freeBrowserPromise || this._freeBrowser());
    }

    _emit(event) {
        this.emit(event, this._test);
    }

    async _runTest(workers) {
        if (!this._browser) {
            throw this._test.err;
        }

        return await workers.runTest(
            this._test.fullTitle(),
            {
                browserId: this._browser.id,
                browserVersion: this._browser.version,
                sessionId: this._browser.sessionId,
                sessionCaps: this._browser.capabilities,
                sessionOpts: this._browser.publicAPI.options,
                file: this._test.file
            }
        );
    }

    _applyTestResults({meta, hermioneCtx = {}, history = []}) {
        hermioneCtx.assertViewResults = AssertViewResults.fromRawObject(hermioneCtx.assertViewResults || []);
        this._test.assertViewResults = hermioneCtx.assertViewResults.get();

        this._test.meta = _.extend(this._test.meta, meta);
        this._test.hermioneCtx = hermioneCtx;
        this._test.history = history;

        this._test.duration = Date.now() - this._test.startTime;
    }

    async _getBrowser() {
        try {
            this._browser = await this._browserAgent.getBrowser();
            this._test.sessionId = this._browser.sessionId;

            return this._browser;
        } catch (error) {
            this._test.err = error;
        }
    }

    async _freeBrowser(browserState = {}) {
        if (!this._browser) {
            return;
        }

        const browser = this._browser;
        this._browser = null;

        browser.applyState(browserState);

        try {
            await this._browserAgent.freeBrowser(browser);
        } catch (error) {
            logger.warn(`WARNING: can not release browser: ${error}`);
        }
    }
};
