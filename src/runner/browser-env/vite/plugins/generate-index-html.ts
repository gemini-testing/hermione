import url from "node:url";
import createDebug from "debug";
import { MODULE_NAMES } from "../constants";
import logger from "../../../../utils/logger";

import type { Plugin } from "vite";

const debug = createDebug("vite:plugin:generateIndexHtml");

export const plugin = (): Plugin[] => {
    return [
        {
            name: "hermione:generateIndexHtml",
            enforce: "pre",
            configureServer(server) {
                return () => {
                    server.middlewares.use(async (req, res, next) => {
                        debug(`Received request for: ${req.originalUrl}`);

                        if (!req.url?.endsWith("index.html") || !req.originalUrl) {
                            return next();
                        }

                        try {
                            const template = generateTemplate(req.originalUrl);
                            res.end(await server.transformIndexHtml(`${req.originalUrl}`, template));
                        } catch (err) {
                            const template = generateErrorTemplate(err as Error);
                            logger.error(`Failed to render template: ${err}`);
                            res.end(await server.transformIndexHtml(`${req.originalUrl}`, template));
                        }

                        return next();
                    });
                };
            },
        },
    ];
};

function generateTemplate(reqUrl: string): string {
    const urlParsed = url.parse(reqUrl);
    const urlParamString = new URLSearchParams(urlParsed.query || "");

    const pid = urlParamString.get("pid");
    const file = urlParamString.get("file");
    const runUuid = urlParamString.get("runUuid");
    const cmdUuid = urlParamString.get("cmdUuid");

    return `
<!DOCTYPE html>
<html>
    <head>
        <title>Hermione Browser Test</title>
        <script type="module" src="${MODULE_NAMES.globals}" pid="${pid}" file="${file}" runUuid="${runUuid}" cmdUuid="${cmdUuid}"></script>
        <script type="module" src="${MODULE_NAMES.mocha}"></script>
        <script type="module" src="${MODULE_NAMES.browserRunner}"></script>
    </head>
    <body></body>
</html>
`;
}

function generateErrorTemplate(error: Error): string {
    return `
<!DOCTYPE html>
<html>
    <body>
        <pre>${error.stack}</pre>
    </body>
</html>
`;
}
