'use strict';

module.exports = {
    baseUrl: 'http://localhost',
    gridUrl: 'http://localhost:4444/wd/hub',
    config: '.hermione.conf.js',
    desiredCapabilities: null,
    screenshotPath: null,
    screenshotsDir: 'hermione/screens',
    diffColor: '#ff00ff',
    tolerance: 2.3,
    antialiasingTolerance: 0,
    compareOpts: {
        ignoreElementsStyle: 'solid',
        shouldCluster: false,
        clustersSize: 10,
        stopOnFirstFail: false
    },
    buildDiffOpts: {
        ignoreAntialiasing: true,
        ignoreCaret: true
    },
    calibrate: false,
    screenshotMode: 'auto',
    screenshotDelay: 0,
    compositeImage: false,
    prepareBrowser: null,
    prepareEnvironment: null,
    waitTimeout: 1000,
    httpTimeout: 90000,
    pageLoadTimeout: null,
    sessionRequestTimeout: null,
    sessionQuitTimeout: null,
    testTimeout: null,
    screenshotOnReject: true,
    screenshotOnRejectTimeout: null,
    reporters: ['flat'],
    debug: false,
    parallelLimit: Infinity,
    sessionsPerBrowser: 1,
    testsPerSession: Infinity,
    workers: 1,
    testsPerWorker: Infinity,
    retry: 0,
    shouldRetry: null,
    mochaOpts: {
        slow: 10000,
        timeout: 60000
    },
    patternsOnReject: [],
    meta: null,
    windowSize: null,
    tempDir: '',
    orientation: null,
    resetCursor: true,
    w3cCompatible: false,
    strictTestsOrder: false
};
