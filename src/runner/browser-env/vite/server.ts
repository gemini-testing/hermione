import path from "node:path";
import url from "node:url";
import { createServer } from "vite";
import _ from "lodash";
import getPort from "get-port";
import chalk from "chalk";

import logger from "../../../utils/logger";
import { plugin as generateIndexHtml } from "./plugins/generate-index-html";
import { plugin as resolveModulePaths } from "./plugins/resolve-module-paths";
import { Config } from "../../../config";
import { VITE_DEFAULT_CONFIG_ENV } from "./constants";
import { getNodeModulePath } from "./utils";
import { BrowserWorkerCommunicator } from "./communicator";

import type { ViteDevServer, InlineConfig } from "vite";
import type { BrowserTestRunEnvOptions } from "./types";

export class ViteServer {
    #hermioneConfig: Config;
    #viteConfig: Partial<InlineConfig>;
    #options?: BrowserTestRunEnvOptions;
    #server?: ViteDevServer;

    static create<T extends ViteServer>(this: new (hermioneConfig: Config) => T, hermioneConfig: Config): T {
        return new this(hermioneConfig);
    }

    constructor(hermioneConfig: Config) {
        this.#hermioneConfig = hermioneConfig;
        this.#viteConfig = {
            server: { host: "localhost" },
            configFile: false,
            logLevel: "silent",
            build: {
                sourcemap: "inline",
            },
            optimizeDeps: {
                esbuildOptions: {
                    logLevel: "silent",
                },
            },
        };

        this.#options = _.isArray(this.#hermioneConfig.system.testRunEnv)
            ? this.#hermioneConfig.system.testRunEnv[1]
            : undefined;
    }

    async start(): Promise<void> {
        await this.#applyUserViteConfig();
        await this.#addRequiredVitePlugins();

        if (!this.#viteConfig.server!.port) {
            this.#viteConfig.server!.port = await getPort();
        }

        this.#server = await createServer(this.#viteConfig);
        BrowserWorkerCommunicator.create(this.#server.ws).handleMessages();

        await this.#server.listen();

        logger.log(chalk.green(`Vite server started on ${this.baseUrl}`));
    }

    async close(): Promise<void> {
        await this.#server?.close();
    }

    async #applyUserViteConfig(): Promise<void> {
        if (!this.#options?.viteConfig) {
            return;
        }

        const config = this.#options.viteConfig;
        let preparedConfig: InlineConfig;

        if (_.isString(config)) {
            preparedConfig = (await import(path.resolve(process.cwd(), config))).default as InlineConfig;
        } else if (_.isFunction(config)) {
            preparedConfig = await config(VITE_DEFAULT_CONFIG_ENV);
        } else {
            preparedConfig = config;
        }

        this.#viteConfig = _.merge(this.#viteConfig, preparedConfig);
    }

    async #addRequiredVitePlugins(): Promise<void> {
        const mochaPath = await getNodeModulePath({
            moduleName: "mocha",
            parent: path.join("node_modules", "hermione", "node_modules"),
        });
        const modulePaths = {
            mocha: path.join(url.fileURLToPath(path.dirname(mochaPath)), "mocha.js"),
        };

        this.#viteConfig.plugins = [
            ...(this.#viteConfig.plugins || []),
            generateIndexHtml(),
            resolveModulePaths({ ...this.#options, modulePaths }),
        ];
    }

    get baseUrl(): string | undefined {
        return this.#server?.resolvedUrls!.local[0];
    }
}
