import type { SetRequired } from "type-fest";
import type { BrowserConfig } from "./browser-config";
import type { BrowserTestRunEnvOptions } from "../runner/browser-env/vite/types";
import type { Test } from "../types";

export interface CompareOptsConfig {
    shouldCluster: boolean;
    clustersSize: number;
    stopOnFirstFail: boolean;
}

export interface BuildDiffOptsConfig {
    ignoreAntialiasing: boolean;
    ignoreCaret: boolean;
}

export interface AssertViewOptsConfig {
    /**
     * DOM-node selectors which will be ignored (painted with a black rectangle) when comparing images.
     *
     * @defaultValue `[]`
     */
    ignoreElements: string | Array<string>;
    /**
     * Ability to set capture element from the top area or from current position.
     *
     * @remarks
     * In the first case viewport will be scrolled to the top of the element.
     *
     * @defaultValue `true`
     */
    captureElementFromTop: boolean;
    /**
     * Disables check that element is outside of the viewport left, top, right or bottom bounds.
     *
     * @remarks
     * By default Hermione throws an error if element is outside the viewport bounds.
     * This option disables check that element is outside of the viewport left, top, right or bottom bounds.
     * And in this case if browser option {@link https://github.com/gemini-testing/hermione#compositeimage compositeImage} set to `false`, then only visible part of the element will be captured.
     * But if {@link https://github.com/gemini-testing/hermione#compositeimage compositeImage} set to `true` (default), then in the resulting screenshot will appear the whole element with not visible parts outside of the bottom bounds of viewport.
     *
     * @defaultValue `false`
     */
    allowViewportOverflow: boolean;
}

export interface ExpectOptsConfig {
    wait: number;
    interval: number;
}

export interface MochaOpts {
    /** milliseconds to wait before considering a test slow. */
    slow?: number;

    /** timeout in milliseconds or time string like '1s'. */
    timeout?: number;

    /** string or regexp to filter tests with. */
    grep?: string | RegExp;
}

export interface SystemConfig {
    debug: boolean;
    mochaOpts: MochaOpts;
    expectOpts: ExpectOptsConfig;
    ctx: { [name: string]: unknown };
    patternsOnReject: Array<string>;
    workers: number;
    testsPerWorker: number;
    diffColor: string;
    tempDir: string;
    parallelLimit: number;
    fileExtensions: Array<string>;
    testRunEnv: "nodejs" | "browser" | ["browser", BrowserTestRunEnvOptions];
}

export interface CommonConfig {
    configPath?: string;
    automationProtocol: "webdriver" | "devtools";
    desiredCapabilities: WebDriver.DesiredCapabilities | null;
    gridUrl: string;
    baseUrl: string;
    sessionsPerBrowser: number;
    testsPerSession: number;
    retry: number;
    shouldRetry(testInfo: { ctx: Test; retriesLeft: number }): boolean | null;
    httpTimeout: number;
    urlHttpTimeout: number | null;
    pageLoadTimeout: number | null;
    sessionRequestTimeout: number | null;
    sessionQuitTimeout: number | null;
    testTimeout: number | null;
    waitTimeout: number;
    saveHistoryMode: "all" | "none" | "onlyFailed";
    takeScreenshotOnFails: {
        testFail: boolean;
        assertViewFail: boolean;
    };
    takeScreenshotOnFailsTimeout: number | null;
    takeScreenshotOnFailsMode: "fullpage" | "viewport";
    prepareBrowser(browser: WebdriverIO.Browser): void | null;
    screenshotPath: string | null;
    screenshotsDir(test: Test): string;
    calibrate: boolean;
    compositeImage: boolean;
    strictTestsOrder: boolean;
    screenshotMode: "fullpage" | "viewport" | "auto";
    screenshotDelay: number;
    tolerance: number;
    antialiasingTolerance: number;
    compareOpts: CompareOptsConfig;
    buildDiffOpts: BuildDiffOptsConfig;
    assertViewOpts: AssertViewOptsConfig;
    expectOpts: ExpectOptsConfig;
    meta: { [name: string]: unknown };
    windowSize: string | { width: number; height: number } | null;
    orientation: "landscape" | "portrait" | null;
    resetCursor: boolean;
    headers: Record<string, string> | null;

    system: SystemConfig;
    headless: "old" | "new" | boolean | null;
    isolation: boolean;

    openAndWaitOpts: {
        timeout?: number;
        waitNetworkIdle: boolean;
        waitNetworkIdleTimeout: number;
        failOnNetworkError: boolean;
        ignoreNetworkErrorsPatterns: Array<RegExp | string>;
    };
}

export interface SetsConfig {
    files: string | Array<string>;
    ignoreFiles?: Array<string>;
    browsers?: Array<string>;
}

// Only browsers desiredCapabilities are required in input config
export type ConfigInput = {
    browsers: Record<string, SetRequired<Partial<CommonConfig>, "desiredCapabilities">>;
    plugins?: Record<string, unknown>;
    sets?: Record<string, SetsConfig>;
    prepareEnvironment?: () => void | null;
};

export interface RuntimeConfig {
    extend: (data: unknown) => this;
    [key: string]: unknown;
}

declare module "." {
    export interface Config extends CommonConfig {
        browsers: Record<string, BrowserConfig>;
        plugins: Record<string, Record<string, unknown>>;
        sets: Record<string, SetsConfig>;
        prepareEnvironment?: () => void | null;
    }
}

declare module "./browser-config" {
    export interface BrowserConfig extends CommonConfig {
        id: string;
    }
}
