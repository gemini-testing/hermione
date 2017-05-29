'use strict';

var _ = require('lodash'),
    inherit = require('inherit'),
    BasicPool = require('./basic-pool'),
    Pool = require('./pool'),
    LimitedPool = require('./limited-pool'),
    signalHandler = require('../signal-handler');

module.exports = inherit(Pool, {
    __constructor: function(config) {
        this._config = config;
        this._pools = {};

        var pool = new BasicPool(config);

        signalHandler.on('exit', function() {
            // Запрещаем выдавать браузеры после sigterm
            pool.terminate();
        });

        _.forEach(this._config.browsers, function(options, browserId) {
            this._pools[browserId] = new LimitedPool(options.sessionsPerBrowser, pool);
        }, this);
    },

    getBrowser: function(id) {
        return this._pools[id].getBrowser(id)
            .then((browser) => {
                console.log(`=========== ${new Date()} ========== Подняли браузер ${id}, всего запущено браузеров  ${this._pools[id]._launched}`);

                return browser;
            });
    },

    freeBrowser: function(browser) {
        return this._pools[browser.id].freeBrowser(browser);
    }
});
