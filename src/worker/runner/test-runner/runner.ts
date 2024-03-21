import { Constructor } from "type-fest";

export abstract class Runner {
    static create<T>(this: Constructor<T>, ...args: unknown[]): T {
        return new this(...args);
    }

    abstract run(...args: unknown[]): Promise<void>;
}
