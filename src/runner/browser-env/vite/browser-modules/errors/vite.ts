import { BaseError } from "./base.js";

interface ViteErrorData {
    message: string;
    stack: string;
    file: string;
    frame: string;
    tip: string;
}

type ViteErrorCtor<T> = new (opts: ViteErrorData) => T;

export class ViteError extends BaseError {
    file: string;
    frame: string;
    tip: string;

    static create<T extends ViteError>(this: ViteErrorCtor<T>, opts: ViteErrorData): T {
        return new this(opts);
    }

    constructor({ message, stack, file, frame, tip }: ViteErrorData) {
        super({ message });

        this.stack = `${this.constructor.name}: ${this.message}\n${stack}`;
        this.file = file;
        this.frame = frame;
        this.tip = tip;
    }
}
