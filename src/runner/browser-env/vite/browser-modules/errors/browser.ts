import { BaseError } from "./base.js";

interface BrowserErrorData {
    message: string;
    stack?: string;
    file?: string;
}

export class BrowserError extends BaseError {
    file?: string;

    static create<T extends BrowserError>(this: new (opts: BrowserErrorData) => T, opts: BrowserErrorData): T {
        return new this(opts);
    }

    constructor({ message, stack, file }: BrowserErrorData) {
        super({ message, stack });

        if (file) {
            this.file = file;
        }
    }
}
