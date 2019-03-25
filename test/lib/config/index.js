'use strict';

const path = require('path');
const proxyquire = require('proxyquire').noCallThru();
const defaults = require('lib/config/defaults');
const BrowserConfig = require('lib/config/browser-config');

describe('config', () => {
    const sandbox = sinon.sandbox.create();

    let parseOptions;

    const initConfig = (opts) => {
        opts = opts || {};
        parseOptions = sandbox.stub().returns(opts.configParserReturns);

        const configPath = opts.configPath || defaults.config;
        const resolvedConfigPath = path.resolve(process.cwd(), configPath);
        const Config = proxyquire('../../../lib/config', {
            './options': parseOptions,
            [resolvedConfigPath]: opts.requireConfigReturns || {}
        });

        return Config.create(opts.configPath, opts.allowOverrides);
    };

    afterEach(() => sandbox.restore());

    describe('constructor', () => {
        it('should parse options', () => {
            initConfig();

            assert.calledOnce(parseOptions);
        });

        it('should parse config from file', () => {
            initConfig({requireConfigReturns: 'some-options'});

            assert.calledWithMatch(parseOptions, {options: 'some-options', env: process.env, argv: process.argv});
        });

        it('should create config', () => {
            assert.include(initConfig({configParserReturns: {some: 'option'}}), {some: 'option'});
        });

        it('should extend config with a config path', () => {
            assert.include(initConfig({configPath: 'config-path'}), {configPath: 'config-path'});
        });

        it('should wrap browser config with "BrowserConfig" instance', () => {
            const config = initConfig({
                configParserReturns: {
                    browsers: {
                        bro1: {}
                    }
                }
            });

            assert.instanceOf(config.forBrowser('bro1'), BrowserConfig);
        });

        describe('should extend browser config by', () => {
            it('its id', () => {
                const config = initConfig({configParserReturns: {browsers: {bro: {some: 'option'}}}});

                assert.include(config.forBrowser('bro'), {id: 'bro'});
            });

            it('common "system" option', () => {
                const system = {mochaOpts: {}, common: 'option'};
                const bro = {some: 'option'};

                const config = initConfig({
                    configParserReturns: {browsers: {bro}, system}
                });

                assert.deepEqual(config.forBrowser('bro').system, system);
            });

            it('common "system" option with modified "mochaOpts" option from browser config', () => {
                const system = {mochaOpts: {foo: 1, bar: 2}, common: 'option'};
                const bro = {mochaOpts: {foo: 3}};

                const config = initConfig({
                    configParserReturns: {browsers: {bro}, system}
                });

                assert.deepEqual(config.forBrowser('bro').system, {
                    mochaOpts: {foo: 3, bar: 2}, common: 'option'
                });
            });
        });

        it('should not modify common "system" option when extending browser config', () => {
            const system = {mochaOpts: {foo: 1, bar: 2}};
            const bro = {mochaOpts: {foo: 3}};

            const config = initConfig({
                configParserReturns: {
                    browsers: {bro}, system: Object.assign({}, system)
                }
            });

            assert.deepEqual(config.system, system);
        });
    });

    describe('forBrowser', () => {
        it('should get config for a browser', () => {
            const config = initConfig({configParserReturns: {browsers: {bro: {some: 'option'}}}});

            assert.include(config.forBrowser('bro'), {some: 'option'});
        });
    });

    describe('getBrowserIds', () => {
        it('should get browser ids', () => {
            const config = initConfig({configParserReturns: {browsers: {bro1: {}, bro2: {}}}});

            assert.deepEqual(config.getBrowserIds(), ['bro1', 'bro2']);
        });
    });

    describe('serialize', () => {
        it('should delegate browsers serialization to browser config', () => {
            const config = initConfig({configParserReturns: {
                browsers: {
                    bro: {}
                },
                configPath: 'foo/bar/baz'
            }});
            sandbox.stub(BrowserConfig.prototype, 'serialize').returns({foo: 'bar'});

            const result = config.serialize();

            assert.deepEqual(result, {
                browsers: {
                    bro: {foo: 'bar'}
                },
                configPath: 'foo/bar/baz'
            });
        });
    });

    describe('mergeWith', () => {
        it('should deeply merge config with another one', () => {
            const config = initConfig({configParserReturns: {some: {deep: {option: 'foo'}}}});

            config.mergeWith({some: {deep: {option: 'bar'}}});

            assert.deepInclude(config, {some: {deep: {option: 'bar'}}});
        });

        it('should not merge values of different types', () => {
            const config = initConfig({configParserReturns: {option: 100500}});

            config.mergeWith({option: '100500'});

            assert.deepInclude(config, {option: 100500});
        });
    });
});
