'use strict';

const path = require('path');
const _ = require('lodash');
const defaults = require('./defaults');
const logger = require('../utils').logger;

module.exports = class ConfigReader {
    constructor(cliConfig) {
        this._cliConfig = cliConfig;
        this._configPath = cliConfig.config || defaults.config;
    }

    read() {
        const customConfig = this._getConfigFromFile(this._configPath);
        const config = _.defaultsDeep(this._cliConfig, customConfig, defaults);

        if (_.isFunction(config.prepareEnvironment)) {
            config.prepareEnvironment();
        }

        return config;
    }

    _getConfigFromFile(configPath) {
        try {
            return require(path.resolve(process.cwd(), configPath));
        } catch (e) {
            logger.error(`Unable to read config from path ${configPath}`);
            throw e;
        }
    }
};
