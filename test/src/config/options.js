"use strict";

const _ = require("lodash");
const { MissingOptionError } = require("gemini-configparser");
const { Config } = require("src/config");
const defaults = require("src/config/defaults");
const parser = require("src/config/options");
const { NODEJS_TEST_RUN_ENV, BROWSER_TEST_RUN_ENV } = require("src/constants/config");

describe("config options", () => {
    const sandbox = sinon.createSandbox();

    const createConfig = () => Config.create("some-config-path");

    const parse_ = (opts = {}) => parser({ env: {}, argv: [], ...opts });

    beforeEach(() => sandbox.stub(Config, "read").returns({}));

    afterEach(() => sandbox.restore());

    describe("system", () => {
        describe("debug", () => {
            it("should throw error if debug is not a boolean", () => {
                const readConfig = _.set({}, "system.debug", "String");

                Config.read.returns(readConfig);

                assert.throws(() => createConfig(), Error, '"debug" must be a boolean');
            });

            it("should set default debug option if it does not set in config file", () => {
                const config = createConfig();

                assert.equal(config.system.debug, defaults.debug);
            });

            it("should override debug option", () => {
                const readConfig = _.set({}, "system.debug", true);
                Config.read.returns(readConfig);

                const config = createConfig();

                assert.equal(config.system.debug, true);
            });
        });

        [
            { optionName: "mochaOpts", subOptionName: "slow" },
            { optionName: "expectOpts", subOptionName: "wait" },
        ].forEach(({ optionName, subOptionName }) => {
            describe(`${optionName}`, () => {
                it("should throw error if option is not a null or object", () => {
                    const readConfig = _.set({}, `system.${optionName}`, ["Array"]);

                    Config.read.returns(readConfig);

                    assert.throws(() => createConfig(), Error, `"${optionName}" must be an object`);
                });

                it("should set default option if it does not set in config file", () => {
                    const config = createConfig();

                    assert.deepEqual(config.system[optionName], defaults[optionName]);
                });

                it("should override option", () => {
                    const readConfig = _.set({}, `system.${optionName}.${subOptionName}`, 100500);
                    Config.read.returns(readConfig);

                    const config = createConfig();

                    assert.deepEqual(config.system[optionName][subOptionName], 100500);
                });

                it("should parse option from environment", () => {
                    const result = parse_({
                        options: { system: { [optionName]: {} } },
                        // prettier-ignore
                        env: {[`hermione_system_${_.snakeCase(optionName)}`]: '{"some": "opts"}'},
                    });

                    assert.deepEqual(result.system[optionName], { some: "opts" });
                });

                it("should parse option from cli", () => {
                    const result = parse_({
                        options: { system: { [optionName]: {} } },
                        argv: [`--system-${_.kebabCase(optionName)}`, '{"some": "opts"}'],
                    });

                    assert.deepEqual(result.system[optionName], { some: "opts" });
                });
            });
        });

        describe("ctx", () => {
            it("should be empty by default", () => {
                const config = createConfig();

                assert.deepEqual(config.system.ctx, {});
            });

            it("should override ctx option", () => {
                const readConfig = _.set({}, "system.ctx", { some: "ctx" });
                Config.read.returns(readConfig);

                const config = createConfig();

                assert.deepEqual(config.system.ctx, { some: "ctx" });
            });
        });

        describe("patternsOnReject", () => {
            it("should be empty by default", () => {
                const config = createConfig();

                assert.deepEqual(config.system.patternsOnReject, []);
            });

            it('should throw error if "patternsOnReject" is not an array', () => {
                const readConfig = _.set({}, "system.patternsOnReject", {});

                Config.read.returns(readConfig);

                assert.throws(() => createConfig(), Error, '"patternsOnReject" must be an array');
            });

            it('should override "patternsOnReject" option', () => {
                const readConfig = _.set({}, "system.patternsOnReject", ["some-pattern"]);
                Config.read.returns(readConfig);

                const config = createConfig();

                assert.deepEqual(config.system.patternsOnReject, ["some-pattern"]);
            });

            it('should parse "patternsOnReject" option from environment', () => {
                const result = parse_({
                    options: { system: { patternsOnReject: [] } },
                    // prettier-ignore
                    env: {'hermione_system_patterns_on_reject': '["some-pattern"]'},
                });

                assert.deepEqual(result.system.patternsOnReject, ["some-pattern"]);
            });

            it('should parse "patternsOnReject" options from cli', () => {
                const result = parse_({
                    options: { system: { patternsOnReject: [] } },
                    argv: ["--system-patterns-on-reject", '["some-pattern"]'],
                });

                assert.deepEqual(result.system.patternsOnReject, ["some-pattern"]);
            });
        });

        describe("workers", () => {
            it("should throw in case of not positive integer", () => {
                [0, -1, "string", { foo: "bar" }].forEach(workers => {
                    Config.read.returns({ system: { workers } });

                    assert.throws(() => createConfig(), '"workers" must be a positive integer');
                });
            });

            it("should equal one by default", () => {
                const config = createConfig();

                assert.equal(config.system.workers, 1);
            });

            it("should be overridden from a config", () => {
                Config.read.returns({ system: { workers: 100500 } });

                const config = createConfig();

                assert.equal(config.system.workers, 100500);
            });
        });

        describe("diffColor", () => {
            it("should be #ff00ff by default", () => {
                const config = createConfig();

                assert.deepEqual(config.system.diffColor, "#ff00ff");
            });

            it("should override diffColor option", () => {
                const readConfig = _.set({}, "system.diffColor", "#f5f5f5");
                Config.read.returns(readConfig);

                const config = createConfig();

                assert.equal(config.system.diffColor, "#f5f5f5");
            });

            it("should throw an error if option is not a string", () => {
                const readConfig = _.set({}, "system.diffColor", 1);

                Config.read.returns(readConfig);

                assert.throws(() => createConfig(), Error, '"diffColor" must be a string');
            });

            it("should throw an error if option is not a hexadecimal value", () => {
                const readConfig = _.set({}, "system.diffColor", "#gggggg");

                Config.read.returns(readConfig);

                assert.throws(() => createConfig(), Error, /"diffColor" must be a hexadecimal/);
            });
        });

        describe("tempDir", () => {
            it("should set default option if it does not set in config file", () => {
                const config = createConfig();

                assert.deepEqual(config.system.tempDir, defaults.tempDir);
            });

            it("should override tempDir option", () => {
                const readConfig = _.set({}, "system.tempDir", "/def/path");
                Config.read.returns(readConfig);

                const config = createConfig();

                assert.equal(config.system.tempDir, "/def/path");
            });

            it("should throw an error if option is not a string", () => {
                const readConfig = _.set({}, "system.tempDir", 1);

                Config.read.returns(readConfig);

                assert.throws(() => createConfig(), Error, '"tempDir" must be a string');
            });
        });

        describe("parallelLimit", () => {
            it("should throw error in case of not positive integer", () => {
                [0, -1, "10", 10.15, { foo: "bar" }].forEach(parallelLimit => {
                    Config.read.returns({ system: { parallelLimit } });

                    assert.throws(() => createConfig(), '"parallelLimit" must be a positive integer');
                });
            });

            it("should be able to pass value is Infinity", () => {
                Config.read.returns({ system: { parallelLimit: Infinity } });

                const config = createConfig();

                assert.equal(config.system.parallelLimit, Infinity);
            });

            it("should set default parallelLimit option if it does not set in config file", () => {
                const config = createConfig();

                assert.equal(config.system.parallelLimit, defaults.parallelLimit);
            });

            it("should be overridden from a config", () => {
                Config.read.returns({ system: { parallelLimit: 5 } });

                const config = createConfig();

                assert.equal(config.system.parallelLimit, 5);
            });

            it("should parse option from environment", () => {
                const result = parse_({
                    options: { system: { mochaOpts: {} } },
                    // prettier-ignore
                    env: {'hermione_system_parallel_limit': 10},
                });

                assert.equal(result.system.parallelLimit, 10);
            });

            it("should parse option from cli", () => {
                const result = parse_({
                    options: { system: { parallelLimit: 1 } },
                    argv: ["--system-parallel-limit", "15"],
                });

                assert.equal(result.system.parallelLimit, 15);
            });
        });

        describe("fileExtensions", () => {
            it("should set default extension", () => {
                const config = createConfig();

                assert.deepEqual(config.system.fileExtensions, defaults.fileExtensions);
            });

            describe('should throw error if "fileExtensions" option', () => {
                it("is not an array", () => {
                    const value = {};
                    const readConfig = _.set({}, "system.fileExtensions", value);

                    Config.read.returns(readConfig);

                    assert.throws(
                        () => createConfig(),
                        Error,
                        `"fileExtensions" must be an array of strings but got ${JSON.stringify(value)}`,
                    );
                });

                it("is not an array of strings", () => {
                    const value = ["string", 100500];
                    const readConfig = _.set({}, "system.fileExtensions", value);

                    Config.read.returns(readConfig);

                    assert.throws(
                        () => createConfig(),
                        Error,
                        `fileExtensions" must be an array of strings but got ${JSON.stringify(value)}`,
                    );
                });

                it("has strings that do not start with dot symbol", () => {
                    const value = [".foo", "bar"];
                    const readConfig = _.set({}, "system.fileExtensions", value);

                    Config.read.returns(readConfig);

                    assert.throws(
                        () => createConfig(),
                        Error,
                        `Each extension from "fileExtensions" must start with dot symbol but got ${JSON.stringify(
                            value,
                        )}`,
                    );
                });
            });

            it('should set "fileExtensions" option', () => {
                const fileExtensions = [".foo", ".bar"];
                const readConfig = _.set({}, "system.fileExtensions", fileExtensions);
                Config.read.returns(readConfig);

                const config = createConfig();

                assert.deepEqual(config.system.fileExtensions, fileExtensions);
            });
        });

        describe("testRunEnv", () => {
            it("should set default test run environment", () => {
                const config = createConfig();

                assert.deepEqual(config.system.testRunEnv, defaults.testRunEnv);
            });

            describe('should throw error if "testRunEnv" option', () => {
                it("is not string or array", () => {
                    const value = 123;
                    const readConfig = _.set({}, "system.testRunEnv", value);
                    Config.read.returns(readConfig);

                    assert.throws(
                        () => createConfig(),
                        Error,
                        `"testRunEnv" must be an array or string but got ${JSON.stringify(value)}`,
                    );
                });

                it(`is string but not "${NODEJS_TEST_RUN_ENV}" or "${BROWSER_TEST_RUN_ENV}"`, () => {
                    const readConfig = _.set({}, "system.testRunEnv", "foo");
                    Config.read.returns(readConfig);

                    assert.throws(
                        () => createConfig(),
                        Error,
                        `"testRunEnv" specified as string must be "${NODEJS_TEST_RUN_ENV}" or "${BROWSER_TEST_RUN_ENV}" but got "foo"`,
                    );
                });

                it(`is array with "${NODEJS_TEST_RUN_ENV}" value`, () => {
                    const value = [NODEJS_TEST_RUN_ENV];
                    const readConfig = _.set({}, "system.testRunEnv", value);
                    Config.read.returns(readConfig);

                    assert.throws(
                        () => createConfig(),
                        Error,
                        `"testRunEnv" with "${NODEJS_TEST_RUN_ENV}" value must be specified as string but got ${JSON.stringify(
                            value,
                        )}`,
                    );
                });

                it(`is array with "${BROWSER_TEST_RUN_ENV}" but without options as second element`, () => {
                    const value = [BROWSER_TEST_RUN_ENV];
                    const readConfig = _.set({}, "system.testRunEnv", value);
                    Config.read.returns(readConfig);

                    assert.throws(
                        () => createConfig(),
                        Error,
                        `"testRunEnv" specified as array must also contain options as second argument but got ${JSON.stringify(
                            value,
                        )}`,
                    );
                });

                it(`is array without "${BROWSER_TEST_RUN_ENV}" as first element`, () => {
                    const value = ["foo"];
                    const readConfig = _.set({}, "system.testRunEnv", value);
                    Config.read.returns(readConfig);

                    assert.throws(
                        () => createConfig(),
                        Error,
                        `"testRunEnv" specified as array must be in format ["${BROWSER_TEST_RUN_ENV}", <options>] but got ${JSON.stringify(
                            value,
                        )}`,
                    );
                });
            });

            it(`should set "testRunEnv" option with ${NODEJS_TEST_RUN_ENV}`, () => {
                const readConfig = _.set({}, "system.testRunEnv", NODEJS_TEST_RUN_ENV);
                Config.read.returns(readConfig);

                const config = createConfig();

                assert.deepEqual(config.system.testRunEnv, NODEJS_TEST_RUN_ENV);
            });

            it(`should set "testRunEnv" option with ${BROWSER_TEST_RUN_ENV}`, () => {
                const readConfig = _.set({}, "system.testRunEnv", BROWSER_TEST_RUN_ENV);
                Config.read.returns(readConfig);

                const config = createConfig();

                assert.deepEqual(config.system.testRunEnv, BROWSER_TEST_RUN_ENV);
            });

            it(`should set "testRunEnv" option with ${BROWSER_TEST_RUN_ENV} and options`, () => {
                const readConfig = _.set({}, "system.testRunEnv", [BROWSER_TEST_RUN_ENV, {}]);
                Config.read.returns(readConfig);

                const config = createConfig();

                assert.deepEqual(config.system.testRunEnv, [BROWSER_TEST_RUN_ENV, {}]);
            });
        });
    });

    describe("prepareEnvironment", () => {
        it("should throw error if prepareEnvironment is not a null or function", () => {
            const readConfig = { prepareEnvironment: "String" };

            Config.read.returns(readConfig);

            assert.throws(() => createConfig(), Error, '"prepareEnvironment" must be a function');
        });

        it("should set default prepareEnvironment option if it does not set in config file", () => {
            const config = createConfig();

            assert.equal(config.prepareEnvironment, defaults.prepareEnvironment);
        });

        it("should override prepareEnvironment option", () => {
            const newFunc = () => {};
            const readConfig = { prepareEnvironment: newFunc };

            Config.read.returns(readConfig);

            const config = createConfig();

            assert.deepEqual(config.prepareEnvironment, newFunc);
        });
    });

    describe("plugins", () => {
        it("should parse boolean value from environment", () => {
            const result = parse_({
                options: { plugins: { foo: {} } },
                // prettier-ignore
                env: {'hermione_plugins_foo': 'true'},
            });

            assert.strictEqual(result.plugins.foo, true);
        });

        it("should parse object value from environment", () => {
            const result = parse_({
                options: { plugins: { foo: {} } },
                // prettier-ignore
                env: {'hermione_plugins_foo': '{"opt": 1}'},
            });

            assert.deepEqual(result.plugins.foo, { opt: 1 });
        });

        it("should throw error on invalid values from environment", () => {
            assert.throws(
                () =>
                    parse_({
                        options: { plugins: { foo: {} } },
                        // prettier-ignore
                        env: {'hermione_plugins_foo': '{key: 1}'},
                    }),
                "a value must be a primitive type",
            );
        });

        it("should parse boolean value from cli", () => {
            const result = parse_({
                options: { plugins: { foo: {} } },
                argv: ["--plugins-foo", "true"],
            });

            assert.strictEqual(result.plugins.foo, true);
        });

        it("should parse object value from cli", () => {
            const result = parse_({
                options: { plugins: { foo: {} } },
                argv: ["--plugins-foo", '{"opt": 1}'],
            });

            assert.deepEqual(result.plugins.foo, { opt: 1 });
        });

        it("should throw error on invalid values from cli", () => {
            assert.throws(
                () =>
                    parse_({
                        options: { plugins: { foo: {} } },
                        argv: ["--plugins-foo", "{key: 1}"],
                    }),
                "a value must be a primitive type",
            );
        });
    });

    describe("shouldRetry", () => {
        it("should throw error if shouldRetry is not a function", () => {
            const readConfig = _.set({}, "shouldRetry", "shouldRetry");

            Config.read.returns(readConfig);

            assert.throws(() => createConfig(), Error, '"shouldRetry" must be a function');
        });

        it("should set default shouldRetry option if it does not set in config file", () => {
            const config = createConfig();

            assert.equal(config.shouldRetry, null);
        });

        it("should override shouldRetry option", () => {
            const shouldRetry = () => {};
            const readConfig = _.set({}, "shouldRetry", shouldRetry);
            Config.read.returns(readConfig);

            const config = createConfig();

            assert.equal(config.shouldRetry, shouldRetry);
        });
    });

    describe("sets", () => {
        const parseOpts_ = (options = {}) => {
            options.browsers = _.mapValues(options.browsers, broConfig => ({ desiredCapabilities: {}, ...broConfig }));
            return parse_({ options });
        };

        describe("files", () => {
            it("should throw an error if files are not specified", () => {
                assert.throws(() => {
                    parseOpts_({
                        sets: {
                            someSet: {},
                        },
                    });
                }, MissingOptionError);
            });

            it("should convert string to array of strings", () => {
                const config = parseOpts_({
                    sets: {
                        someSet: {
                            files: "some/path",
                        },
                    },
                });

                assert.deepEqual(config.sets.someSet.files, ["some/path"]);
            });

            it("should throw an error if files are specified as non-string array", () => {
                assert.throws(
                    () => {
                        parseOpts_({
                            sets: {
                                someSet: {
                                    files: [100500],
                                },
                            },
                        });
                    },
                    Error,
                    /"sets.files" must be an array of strings/,
                );
            });

            it("should accept array with strings", () => {
                const config = parseOpts_({
                    sets: {
                        someSet: {
                            files: ["some/path", "other/path"],
                        },
                    },
                });

                assert.deepEqual(config.sets.someSet.files, ["some/path", "other/path"]);
            });
        });

        describe("ignoreFiles", () => {
            it("should accept array with strings", () => {
                const config = parseOpts_({
                    sets: {
                        someSet: {
                            files: ["foo"],
                            ignoreFiles: ["foo/bar", "baz"],
                        },
                    },
                });

                assert.deepEqual(config.sets.someSet.ignoreFiles, ["foo/bar", "baz"]);
            });

            describe("should throw an error", () => {
                const errorMask = /"sets.ignoreFiles" must be an array of strings/;

                it('if "ignoreFiles" is not array', () => {
                    assert.throws(
                        () => {
                            parseOpts_({
                                sets: {
                                    someSet: {
                                        files: ["foo"],
                                        ignoreFiles: 100500,
                                    },
                                },
                            });
                        },
                        Error,
                        errorMask,
                    );
                });

                it('if "ignoreFiles" are specified as non-string array', () => {
                    assert.throws(
                        () => {
                            parseOpts_({
                                sets: {
                                    someSet: {
                                        files: ["foo"],
                                        ignoreFiles: [100, 500],
                                    },
                                },
                            });
                        },
                        Error,
                        errorMask,
                    );
                });
            });
        });

        describe("browsers", () => {
            it("should contain all browsers from config by default", () => {
                const config = parseOpts_({
                    browsers: {
                        b1: {},
                        b2: {},
                    },
                    sets: {
                        someSet: {
                            files: ["some/path"],
                        },
                    },
                });

                assert.deepEqual(config.sets.someSet.browsers, ["b1", "b2"]);
            });

            it("should throw an error if browsers are not specified as array", () => {
                const config = {
                    sets: {
                        someSet: {
                            files: ["some/path"],
                            browsers: "something",
                        },
                    },
                };

                assert.throws(() => parseOpts_(config), Error, /"sets.browsers" must be an array/);
            });

            it("should throw an error if sets contain unknown browsers", () => {
                assert.throws(
                    () => {
                        parseOpts_({
                            browsers: {
                                b1: {},
                                b2: {},
                            },
                            sets: {
                                someSet: {
                                    files: ["some/path"],
                                    browsers: ["b3"],
                                },
                            },
                        });
                    },
                    Error,
                    /Unknown browsers for "sets.browsers": b3/,
                );
            });

            it("should use browsers which are specified in config", () => {
                const config = parseOpts_({
                    browsers: {
                        b1: {},
                        b2: {},
                    },
                    sets: {
                        set1: {
                            files: ["some/path"],
                            browsers: ["b1"],
                        },
                        set2: {
                            files: ["other/path"],
                            browsers: ["b2"],
                        },
                    },
                });

                assert.deepEqual(config.sets.set1.browsers, ["b1"]);
                assert.deepEqual(config.sets.set2.browsers, ["b2"]);
            });
        });

        it("should have default set with empty files and all browsers if sets are not specified", () => {
            const config = parseOpts_({
                browsers: {
                    b1: {},
                    b2: {},
                },
            });

            assert.deepEqual(config.sets, { "": { files: [], browsers: ["b1", "b2"], ignoreFiles: [] } });
        });
    });
});
