import { HERMIONE_BROWSER_EVENT_SUFFIX } from "./constants";
import type { InlineConfig, ConfigEnv } from "vite";
import type { BrowserMessage } from "./browser-modules/types";

export interface BrowserTestRunEnvOptions {
    viteConfig?: string | InlineConfig | ((env: ConfigEnv) => InlineConfig | Promise<InlineConfig>);
}

export interface VitePluginOptions extends BrowserTestRunEnvOptions {
    modulePaths: {
        mocha: string;
    };
}

// TODO: use from "./browser-modules/types" after migrate to esm
export enum BrowserEventNames {
    init = `${HERMIONE_BROWSER_EVENT_SUFFIX}:init`,
    runnableResult = `${HERMIONE_BROWSER_EVENT_SUFFIX}:runnableResult`,
}

export interface BrowserInitPayload {
    event: BrowserEventNames.init;
    data: BrowserMessage;
}

export interface BrowserRunRunnablePayload {
    event: BrowserEventNames.runnableResult;
    data: BrowserMessage;
}

export type BrowserPayload = BrowserInitPayload | BrowserRunRunnablePayload;
