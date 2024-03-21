import { BaseError } from "./base.js";

interface LoadPageErrorData {
    message?: string;
}

type BrowserErrorCtor<T> = new (opts?: LoadPageErrorData) => T;

export class LoadPageError extends BaseError {
    static create<T extends LoadPageError>(this: BrowserErrorCtor<T>, opts?: LoadPageErrorData): T {
        return new this(opts);
    }

    constructor({ message = "failed to load Vite test page" }: LoadPageErrorData = {}) {
        super({ message });
    }
}
