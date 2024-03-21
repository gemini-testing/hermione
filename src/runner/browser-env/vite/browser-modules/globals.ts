import { BrowserError } from "./errors/index.js";

type ParsedUrlParams = Record<"file" | "pid" | "runUuid" | "cmdUuid", string>;

const parseUrlParams = (): ParsedUrlParams => {
    const urlParams = new URLSearchParams(window.location.search);
    const parsedParams = ["file", "pid", "runUuid", "cmdUuid"].reduce<ParsedUrlParams>(
        (acc, key) => ({
            ...acc,
            [key]: urlParams.get(key) || "",
        }),
        { file: "", pid: "", runUuid: "", cmdUuid: "" },
    );

    if (!parsedParams.file) {
        console.error(`Query parameter "file" must be specified in url: ${window.location.href}`);
    }

    return parsedParams;
};

const proxyHermione = (): void => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proxyHandler: ProxyHandler<any> = {
        get(target, prop) {
            return prop in target ? target[prop] : new Proxy(() => {}, this);
        },
        apply() {
            return new Proxy(() => {}, this);
        },
    };

    window.hermione = new Proxy(window.hermione || {}, proxyHandler);
};

const subscribeOnBrowserErrors = (): void => {
    addEventListener("error", e =>
        window.__hermione__.errors.push(
            BrowserError.create({
                message: e.message,
                stack: e.error.stack,
                file: e.filename,
            }),
        ),
    );
};

const mockDialog =
    <T>({ name, value }: { name: string; value: T }) =>
    (...params: unknown[]): T => {
        const formatedParams = params.map(p => JSON.stringify(p)).join(", ");

        console.warn(
            `Hermione encountered a \`${name}(${formatedParams})\` call that blocks web page and does not allow the test to continue, so it mocked and return \`${value}\`.`,
        );

        return value;
    };

const mockBlockingDialogs = (): void => {
    window.alert = mockDialog({ name: "alert", value: undefined });
    window.confirm = mockDialog({ name: "confirm", value: false });
    window.prompt = mockDialog({ name: "prompt", value: null });
};

const urlParams = parseUrlParams();
window.__hermione__ = {
    ...urlParams,
    pid: Number(urlParams.pid),
    errors: [],
};

proxyHermione();
subscribeOnBrowserErrors();
mockBlockingDialogs();
