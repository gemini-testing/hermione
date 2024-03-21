"use strict";

const _ = require("lodash");
const { root, section, map, option } = require("gemini-configparser");
const browserOptions = require("./browser-options");
const defaults = require("./defaults");
const optionsBuilder = require("./options-builder");
const { NODEJS_TEST_RUN_ENV, BROWSER_TEST_RUN_ENV } = require("../constants/config");

const options = optionsBuilder(_.propertyOf(defaults));

const ENV_PREFIX = `${require("../../package").name}_`;

const rootSection = section(
    _.extend(browserOptions.getTopLevel(), {
        browsers: map(section(browserOptions.getPerBrowser())),

        prepareEnvironment: options.optionalFunction("prepareEnvironment"),

        system: section({
            debug: options.boolean("debug"),

            mochaOpts: options.optionalObject("mochaOpts"),

            expectOpts: options.optionalObject("expectOpts"),

            ctx: options.anyObject(),

            patternsOnReject: options.optionalArray("patternsOnReject"),

            workers: options.positiveInteger("workers"),

            testsPerWorker: options.positiveIntegerOrInfinity("testsPerWorker"),

            diffColor: options.hexString("diffColor"),

            tempDir: options.string("tempDir"),

            parallelLimit: options.positiveIntegerOrInfinity("parallelLimit"),

            fileExtensions: option({
                parseEnv: JSON.parse,
                parseCli: JSON.parse,
                defaultValue: defaults.fileExtensions,
                validate: value => {
                    if (!(_.isArray(value) && value.every(_.isString))) {
                        throw new Error(
                            `"fileExtensions" must be an array of strings but got ${JSON.stringify(value)}`,
                        );
                    }

                    if (value.some(v => !v.startsWith("."))) {
                        throw new Error(
                            `Each extension from "fileExtensions" must start with dot symbol but got ${JSON.stringify(
                                value,
                            )}`,
                        );
                    }
                },
            }),

            testRunEnv: option({
                defaultValue: defaults.testRunEnv,
                validate: value => {
                    if (!_.isArray(value) && !_.isString(value)) {
                        throw new Error(`"testRunEnv" must be an array or string but got ${JSON.stringify(value)}`);
                    }

                    if (_.isString(value)) {
                        if (value !== NODEJS_TEST_RUN_ENV && value !== BROWSER_TEST_RUN_ENV) {
                            throw new Error(
                                `"testRunEnv" specified as string must be "${NODEJS_TEST_RUN_ENV}" or "${BROWSER_TEST_RUN_ENV}" but got "${value}"`,
                            );
                        }

                        return;
                    }

                    const [testRunEnv, options] = value;

                    if (testRunEnv === NODEJS_TEST_RUN_ENV) {
                        throw new Error(
                            `"testRunEnv" with "${NODEJS_TEST_RUN_ENV}" value must be specified as string but got ${JSON.stringify(
                                value,
                            )}`,
                        );
                    }

                    if (testRunEnv === BROWSER_TEST_RUN_ENV && !options) {
                        throw new Error(
                            `"testRunEnv" specified as array must also contain options as second argument but got ${JSON.stringify(
                                value,
                            )}`,
                        );
                    }

                    if (testRunEnv !== BROWSER_TEST_RUN_ENV) {
                        throw new Error(
                            `"testRunEnv" specified as array must be in format ["${BROWSER_TEST_RUN_ENV}", <options>] but got ${JSON.stringify(
                                value,
                            )}`,
                        );
                    }
                },
            }),
        }),

        plugins: options.anyObject(),

        sets: map(
            section({
                files: option({
                    validate: value => {
                        if (!_.isArray(value) && !_.isString(value)) {
                            throw new Error('"sets.files" must be an array or string');
                        }

                        if (_.isArray(value) && !_.every(value, _.isString)) {
                            throw new Error('"sets.files" must be an array of strings');
                        }
                    },
                    map: val => [].concat(val),
                }),
                ignoreFiles: option({
                    defaultValue: [],
                    validate: value => {
                        if (!_.isArray(value) || !_.every(value, _.isString)) {
                            throw new Error('"sets.ignoreFiles" must be an array of strings');
                        }
                    },
                }),
                browsers: option({
                    defaultValue: config => _.keys(config.browsers),
                    validate: (value, config) => {
                        if (!_.isArray(value)) {
                            throw new Error('"sets.browsers" must be an array');
                        }

                        const unknownBrowsers = _.difference(value, _.keys(config.browsers));
                        if (!_.isEmpty(unknownBrowsers)) {
                            throw new Error(`Unknown browsers for "sets.browsers": ${unknownBrowsers.join(", ")}`);
                        }
                    },
                }),
            }),
            {
                "": { files: [] }, // Use `all` set with default values if sets were not specified in a config
            },
        ),
    }),
);

module.exports = root(rootSection, { envPrefix: ENV_PREFIX });
