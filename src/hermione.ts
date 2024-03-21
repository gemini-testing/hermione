import { CommanderStatic } from "@gemini-testing/commander";
import * as _ from "lodash";
import { Stats as RunnerStats } from "./stats";
import { BaseHermione } from "./base-hermione";
import { MainRunner as NodejsEnvRunner } from "./runner";
import { MainRunner as BrowserEnvRunner } from "./runner/browser-env";
import RuntimeConfig from "./config/runtime-config";
import { MasterAsyncEvents, MasterEvents, MasterSyncEvents } from "./events";
import eventsUtils from "./events/utils";
import signalHandler from "./signal-handler";
import TestReader from "./test-reader";
import { TestCollection } from "./test-collection";
import { validateUnknownBrowsers } from "./validators";
import { initReporters } from "./reporters";
import logger from "./utils/logger";
import { isRunInNodeJsEnv } from "./utils/config";
import { ConfigInput } from "./config/types";
import { MasterEventHandler, Test } from "./types";

interface RunOpts {
    browsers: string[];
    sets: string[];
    grep: RegExp;
    updateRefs: boolean;
    requireModules: string[];
    inspectMode: {
        inspect: boolean;
        inspectBrk: boolean;
    };
    reporters: string[];
    replMode: {
        enabled: boolean;
        beforeTest: boolean;
        onFail: boolean;
    };
    devtools: boolean;
}

interface ReadTestsOpts extends Pick<RunOpts, "browsers" | "sets" | "grep" | "replMode"> {
    silent: boolean;
    ignore: string | string[];
}

export interface Hermione {
    on: MasterEventHandler<this>;
    once: MasterEventHandler<this>;
    prependListener: MasterEventHandler<this>;
}

export class Hermione extends BaseHermione {
    protected failed: boolean;
    protected runner: NodejsEnvRunner | BrowserEnvRunner | null;

    constructor(config?: string | ConfigInput) {
        super(config);

        this.failed = false;
        this.runner = null;
    }

    extendCli(parser: CommanderStatic): void {
        this.emit(MasterEvents.CLI, parser);
    }

    async run(
        testPaths: TestCollection | string[],
        {
            browsers,
            sets,
            grep,
            updateRefs,
            requireModules,
            inspectMode,
            replMode,
            devtools,
            reporters = [],
        }: Partial<RunOpts> = {},
    ): Promise<boolean> {
        validateUnknownBrowsers(browsers, _.keys(this._config.browsers));

        RuntimeConfig.getInstance().extend({ updateRefs, requireModules, inspectMode, replMode, devtools });

        if (replMode?.enabled) {
            this._config.system.mochaOpts.timeout = 0;
        }

        const runner = (isRunInNodeJsEnv(this._config) ? NodejsEnvRunner : BrowserEnvRunner).create(
            this._config,
            this._interceptors,
        );
        this.runner = runner;

        this.on(MasterEvents.TEST_FAIL, () => this._fail()).on(MasterEvents.ERROR, (err: Error) => this.halt(err));

        await initReporters(reporters, this);

        eventsUtils.passthroughEvent(this.runner, this, _.values(MasterSyncEvents));
        eventsUtils.passthroughEventAsync(this.runner, this, _.values(MasterAsyncEvents));
        eventsUtils.passthroughEventAsync(signalHandler, this, MasterEvents.EXIT);

        await this._init();
        runner.init();
        await runner.run(
            await this._readTests(testPaths, { browsers, sets, grep, replMode }),
            RunnerStats.create(this),
        );

        return !this.isFailed();
    }

    protected async _readTests(
        testPaths: string[] | TestCollection,
        opts: Partial<ReadTestsOpts>,
    ): Promise<TestCollection> {
        return testPaths instanceof TestCollection ? testPaths : await this.readTests(testPaths, opts);
    }

    addTestToRun(test: Test, browserId: string): boolean {
        return this.runner ? this.runner.addTestToRun(test, browserId) : false;
    }

    async readTests(
        testPaths: string[],
        { browsers, sets, grep, silent, ignore, replMode }: Partial<ReadTestsOpts> = {},
    ): Promise<TestCollection> {
        const testReader = TestReader.create(this._config);

        if (!silent) {
            await this._init();

            eventsUtils.passthroughEvent(testReader, this, [
                MasterEvents.BEFORE_FILE_READ,
                MasterEvents.AFTER_FILE_READ,
            ]);
        }

        const specs = await testReader.read({ paths: testPaths, browsers, ignore, sets, grep, replMode });
        const collection = TestCollection.create(specs);

        collection.getBrowsers().forEach(bro => {
            if (this._config.forBrowser(bro).strictTestsOrder) {
                collection.sortTests(bro, ({ id: a }, { id: b }) => (a < b ? -1 : 1));
            }
        });

        if (!silent) {
            this.emit(MasterEvents.AFTER_TESTS_READ, collection);
        }

        return collection;
    }

    isFailed(): boolean {
        return this.failed;
    }

    protected _fail(): void {
        this.failed = true;
    }

    isWorker(): boolean {
        return false;
    }

    halt(err: Error, timeout = 60000): void {
        logger.error("Terminating on critical error:", err);

        this._fail();

        if (timeout > 0) {
            setTimeout(() => {
                logger.error("Forcing shutdown...");
                process.exit(1);
            }, timeout).unref();
        }

        if (this.runner) {
            this.runner.cancel();
        }
    }
}
