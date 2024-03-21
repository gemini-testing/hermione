import type { AssertViewCommand, AssertViewElementCommand } from "./commands/types";
import type { BrowserConfig } from "./../config/browser-config";
import type { AssertViewResult, RunnerTest, RunnerHook } from "../types";
import Callstack from "./history/callstack";

export interface BrowserMeta {
    pid: number;
    browserVersion: string;
    [name: string]: unknown;
}

export interface Browser {
    publicAPI: WebdriverIO.Browser;
    config: BrowserConfig;
    state: Record<string, unknown>;
    applyState: (state: Record<string, unknown>) => void;
    callstackHistory: Callstack;
}

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace WebdriverIO {
        type OverwriteCommandFn<IsElement extends boolean = false> = (
            this: IsElement extends true ? WebdriverIO.Element : WebdriverIO.Browser,
            origCommand: (...args: any[]) => Promise<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
            ...args: any[] // eslint-disable-line @typescript-eslint/no-explicit-any
        ) => Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

        interface Browser {
            getMeta(): Promise<BrowserMeta>;
            getMeta(key: string): Promise<unknown>;

            setMeta(key: string, value: unknown): Promise<void>;

            extendOptions(opts: { [name: string]: unknown }): Promise<void>;

            getConfig(): Promise<BrowserConfig>;

            overwriteCommand<IsElement extends boolean = false>(
                name: string,
                func: OverwriteCommandFn<IsElement>,
                attachToElement?: IsElement,
                proto?: Record<string, any>, // eslint-disable-line @typescript-eslint/no-explicit-any
                instances?: Record<string, WebdriverIO.Browser | WebdriverIO.MultiRemoteBrowser>,
            ): void;

            /**
             * Takes a screenshot of the passed selector and compares the received screenshot with the reference.
             *
             * @remarks
             * For more details, see {@link https://github.com/gemini-testing/hermione#assertview documentation}.
             *
             * @example
             * ```ts
             *
             * it('some test', async function() {
             *     await this.browser.url('some/url');
             *     await this.browser.assertView('plain', '.button', {
             *         ignoreElements: ['.link'],
             *         tolerance: 2.3,
             *         antialiasingTolerance: 4,
             *         allowViewportOverflow: true,
             *         captureElementFromTop: true,
             *         compositeImage: true,
             *         screenshotDelay: 600,
             *         selectorToScroll: '.modal'
             *     });
             *});
             * ```
             *
             * @param state state name, should be unique within one test
             * @param selectors DOM-node selector that you need to capture
             * @param opts additional options, currently available:
             * "ignoreElements", "tolerance", "antialiasingTolerance", "allowViewportOverflow", "captureElementFromTop",
             * "compositeImage", "screenshotDelay", "selectorToScroll"
             */
            assertView: AssertViewCommand;

            /**
             * Command that allows to add human-readable description for commands in history
             *
             * @remarks
             * For more details, see {@link https://github.com/gemini-testing/hermione#runstep documentation}
             *
             * @example
             * ```ts
             * it('some test', async function () {
             *     await this.browser.runStep('step name', async () => {
             *         await this.browser.url('some/url');
             *         ...
             *     });
             * })
             * ```
             *
             * @param stepName step name
             * @param stepCb step callback
             * @returns {Promise<T>} value, returned by `stepCb`
             */
            runStep<T = unknown>(stepName: string, stepCb: () => Promise<T> | T): Promise<T>;

            // TODO: describe executionContext more precisely
            executionContext: (RunnerTest | RunnerHook) & {
                hermioneCtx: {
                    assertViewResults: Array<AssertViewResult>;
                };
                ctx: {
                    browser: WebdriverIO.Browser;
                    currentTest: RunnerTest;
                };
            };

            switchToRepl: (ctx?: Record<string, unknown>) => Promise<void>;

            clearSession: () => Promise<void>;
        }

        interface Element {
            /**
             * Takes a screenshot of the element and compares the received screenshot with the reference.
             *
             * @remarks
             * For more details, see {@link https://github.com/gemini-testing/hermione#assertview documentation}.
             *
             * @example
             * ```ts
             *
             * it('some test', async function() {
             *     await this.browser.url('some/url');
             *     const button = await this.browser.$('.button');
             *     await button.assertView('plain', {
             *         ignoreElements: ['.link'],
             *         tolerance: 2.3,
             *         antialiasingTolerance: 4,
             *         allowViewportOverflow: true,
             *         captureElementFromTop: true,
             *         compositeImage: true,
             *         screenshotDelay: 600,
             *         selectorToScroll: '.modal'
             *     });
             *});
             * ```
             *
             * @param state state name, should be unique within one test
             * @param opts additional options, currently available:
             * "ignoreElements", "tolerance", "antialiasingTolerance", "allowViewportOverflow", "captureElementFromTop",
             * "compositeImage", "screenshotDelay", "selectorToScroll"
             */
            assertView: AssertViewElementCommand;
        }
    }
}
