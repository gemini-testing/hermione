export class BaseError extends Error {
    constructor({ message, stack }: { message: string; stack?: string }) {
        super(message);

        this.name = this.constructor.name;

        if (stack) {
            this.stack = stack;
        }
    }
}
