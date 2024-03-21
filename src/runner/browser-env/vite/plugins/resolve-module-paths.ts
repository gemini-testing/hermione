import url from "node:url";
import path from "node:path";

import { getImportMetaUrl } from "../utils";
import { MODULE_NAMES } from "../constants";

import type { Plugin } from "vite";
import type { VitePluginOptions } from "../types";

export const plugin = (options: VitePluginOptions): Plugin[] => {
    const dirname = url.fileURLToPath(new URL(".", getImportMetaUrl(__filename)));

    const browserModulesPath = path.resolve(dirname, "..", "browser-modules");
    const browserRunnerModulePath = path.resolve(browserModulesPath, "index.js");
    const globalsModulePath = path.resolve(browserModulesPath, "globals.js");

    return [
        {
            name: "hermione:resolveModulePaths",
            enforce: "pre",
            resolveId: (id): string | void => {
                if (id.endsWith(MODULE_NAMES.browserRunner)) {
                    return browserRunnerModulePath;
                }

                if (id.endsWith(MODULE_NAMES.globals)) {
                    return globalsModulePath;
                }

                if (id.endsWith(MODULE_NAMES.mocha)) {
                    return options.modulePaths.mocha;
                }
            },
        },
    ];
};
