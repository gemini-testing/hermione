"use strict";

const { Hermione } = require("./hermione");
const RuntimeConfig = require("../config/runtime-config");
const Promise = require("bluebird");
const debug = require("debug")(`hermione:worker:${process.pid}`);
const ipc = require("../utils/ipc");
const { MASTER_INIT, MASTER_SYNC_CONFIG, WORKER_INIT, WORKER_SYNC_CONFIG } = require("../constants/process-messages");
const { requireModule } = require("../utils/module");
const { isRunInNodeJsEnv } = require("../utils/config");
const { ViteWorkerCommunicator } = require("./browser-env/communicator");

module.exports = class HermioneFacade {
    static create() {
        return new HermioneFacade();
    }

    constructor() {
        this.promise = Promise.resolve();
        this._hermione = null;
    }

    init() {
        this.init = () => this.promise;

        this.promise = this._init()
            .then(hermione => (this._hermione = hermione))
            .then(() => this._hermione.init());

        return this.promise;
    }

    syncConfig() {
        this.syncConfig = () => this.promise;

        this.promise = this.init().then(() => this._syncConfig());

        return this.promise;
    }

    runTest(...args) {
        return this.syncConfig().then(() => this._hermione.runTest(...args));
    }

    _init() {
        return new Promise((resolve, reject) => {
            debug("init worker");

            ipc.on(MASTER_INIT, ({ configPath, runtimeConfig } = {}) => {
                try {
                    const promise = Promise.resolve();

                    if (runtimeConfig.requireModules) {
                        runtimeConfig.requireModules.forEach(modulePath => {
                            promise.then(requireModule(modulePath));
                        });
                    }

                    RuntimeConfig.getInstance().extend(runtimeConfig);
                    const hermione = Hermione.create(configPath);

                    promise.then(() => {
                        debug("worker initialized");
                        resolve(hermione);
                    });
                } catch (e) {
                    debug("worker initialization failed");
                    reject(e);
                }
            });

            ipc.emit(WORKER_INIT);
        });
    }

    _syncConfig() {
        return new Promise(resolve => {
            debug("sync config");

            ipc.on(MASTER_SYNC_CONFIG, ({ config } = {}) => {
                delete config.system.mochaOpts.grep; // grep affects only master
                this._hermione.config.mergeWith(config);

                if (!isRunInNodeJsEnv(this._hermione.config)) {
                    const communicator = ViteWorkerCommunicator.create(this._hermione.config);
                    RuntimeConfig.getInstance().extend({ viteWorkerCommunicator: communicator });
                }

                debug("config synced");
                resolve();
            });

            ipc.emit(WORKER_SYNC_CONFIG);
        });
    }
};
