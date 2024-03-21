import { BrowserError } from "./browser.js";
import { LoadPageError } from "./load-page.js";
import { ViteError } from "./vite.js";
import { getSelectorTextFromShadowRoot } from "../utils/index.js";
import { DOCUMENT_TITLE, VITE_SELECTORS } from "../constants.js";

export type ErrorOnPageLoad = LoadPageError | ViteError | BrowserError;
export type ErrorOnRunRunnable = ViteError | BrowserError | Error;
export type AvailableError = ErrorOnPageLoad | Error;

const getLoadPageErrors = (): LoadPageError[] => {
    if (document.title === DOCUMENT_TITLE && window.__hermione__) {
        return [];
    }

    return [LoadPageError.create()];
};

const getViteErrors = (): ViteError[] => {
    const viteErrorElem = document.querySelector(VITE_SELECTORS.overlay);

    if (!viteErrorElem || !viteErrorElem.shadowRoot) {
        return [];
    }

    const shadowRoot = viteErrorElem.shadowRoot;

    const message = getSelectorTextFromShadowRoot(VITE_SELECTORS.overlayMessage, shadowRoot);
    const stack = getSelectorTextFromShadowRoot(VITE_SELECTORS.overlayStack, shadowRoot);
    const file = getSelectorTextFromShadowRoot(VITE_SELECTORS.overlayFile, shadowRoot);
    const frame = getSelectorTextFromShadowRoot(VITE_SELECTORS.overlayFrame, shadowRoot);
    const tip = getSelectorTextFromShadowRoot(VITE_SELECTORS.overlayTip, shadowRoot);

    return [ViteError.create({ message, stack, file, frame, tip })];
};

const getBrowserErrors = (): BrowserError[] => {
    return window.__hermione__.errors;
};

const findErrors = (errors: AvailableError | AvailableError[] = []): AvailableError[] => {
    return [errors, getViteErrors(), getBrowserErrors()].flat().filter(Boolean);
};

export const findErrorsOnPageLoad = (): ErrorOnPageLoad[] => {
    return findErrors(getLoadPageErrors());
};

export const findErrorsOnRunRunnable = (runnableError?: Error): AvailableError[] => {
    return findErrors(runnableError);
};

export const prepareError = (error: Error): Error => {
    // in order to correctly pass errors through websocket
    return JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error)));
};

export { BrowserError, LoadPageError, ViteError };
