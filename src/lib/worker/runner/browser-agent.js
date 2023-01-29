'use strict';

module.exports = class BrowserAgent {
    static create(browserId, browserVersion, pool) {
        return new BrowserAgent(browserId, browserVersion, pool);
    }

    constructor(browserId, browserVersion, pool) {
        this.browserId = browserId;
        this.browserVersion = browserVersion;

        this._pool = pool;
    }

    getBrowser({sessionId, sessionCaps, sessionOpts}) {
        return this._pool.getBrowser({
            browserId: this.browserId,
            browserVersion: this.browserVersion,
            sessionId,
            sessionCaps,
            sessionOpts
        });
    }

    freeBrowser(browser) {
        this._pool.freeBrowser(browser);
    }
};
