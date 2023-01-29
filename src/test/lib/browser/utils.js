"use strict";

const _ = require("lodash");
const NewBrowser = require("lib/browser/new-browser");
const ExistingBrowser = require("lib/browser/existing-browser");
const { WEBDRIVER_PROTOCOL } = require("lib/constants/config");

function createBrowserConfig_(opts = {}) {
    const browser = _.defaults(opts, {
        desiredCapabilities: { browserName: "browser", version: "1.0" },
        baseUrl: "http://base_url",
        gridUrl: "http://test_host:4444/wd/hub?query=value",
        automationProtocol: WEBDRIVER_PROTOCOL,
        sessionEnvFlags: {},
        outputDir: null,
        waitTimeout: 100,
        waitInterval: 50,
        httpTimeout: 3000,
        pageLoadTimeout: null,
        sessionRequestTimeout: null,
        sessionQuitTimeout: null,
        screenshotDelay: 0,
        windowSize: null,
        getScreenshotPath: () => "/some/path",
        system: opts.system || {},
        buildDiffOpts: {
            ignoreCaret: true,
        },
        waitOrientationChange: true,
        agent: null,
        headers: null,
        transformRequest: null,
        transformResponse: null,
        strictSSL: null,
        user: null,
        key: null,
        region: null,
        headless: null,
        saveHistory: true,
    });

    return {
        baseUrl: "http://main_url",
        gridUrl: "http://main_host:4444/wd/hub",
        system: { debug: true },
        forBrowser: () => browser,
    };
}

exports.mkNewBrowser_ = (opts, browser = "browser", version) => {
    return NewBrowser.create(createBrowserConfig_(opts), browser, version);
};

exports.mkExistingBrowser_ = (opts, browser = "browser", browserVersion, emitter = "emitter") => {
    return ExistingBrowser.create(createBrowserConfig_(opts), browser, browserVersion, emitter);
};

exports.mkSessionStub_ = () => {
    const session = {};
    const element = {
        selector: ".selector",
        click: sinon.stub().named("click").resolves(),
        waitForExist: sinon.stub().named("waitForExist").resolves(),
    };

    session.sessionId = "1234567890";
    session.isW3C = false;

    session.options = {};
    session.capabilities = {};
    session.commandList = [];

    session.deleteSession = sinon.stub().named("end").resolves();
    session.url = sinon.stub().named("url").resolves();
    session.getUrl = sinon.stub().named("getUrl").resolves("");
    session.execute = sinon.stub().named("execute").resolves();
    session.takeScreenshot = sinon.stub().named("takeScreenshot").resolves("");
    session.setWindowSize = sinon.stub().named("setWindowSize").resolves();
    session.getOrientation = sinon.stub().named("orientation").resolves("");
    session.setOrientation = sinon.stub().named("setOrientation").resolves();
    session.waitUntil = sinon.stub().named("waitUntil").resolves();
    session.setTimeout = sinon.stub().named("setTimeout").resolves();
    session.setTimeouts = sinon.stub().named("setTimeouts").resolves();
    session.getPuppeteer = sinon.stub().named("getPuppeteer").resolves({});
    session.$ = sinon.stub().named("$").resolves(element);

    session.addCommand = sinon.stub().callsFake((name, command, isElement) => {
        const target = isElement ? element : session;

        target[name] = command.bind(target);
        sinon.spy(target, name);
    });

    session.overwriteCommand = sinon.stub().callsFake((name, command, isElement) => {
        const target = isElement ? element : session;

        target[name] = command.bind(target, target[name]);
        sinon.spy(target, name);
    });

    return session;
};
