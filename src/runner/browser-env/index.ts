import { ViteServer } from "./vite/server";
import { MainRunner as NodejsEnvRunner } from "..";
import { TestCollection } from "../../test-collection";
import { Config } from "../../config";
import { Interceptor } from "../../events";
import type { Stats as RunnerStats } from "../../stats";

export class MainRunner extends NodejsEnvRunner {
    #viteServer: ViteServer;

    constructor(config: Config, interceptors: Interceptor[]) {
        super(config, interceptors);

        this.#viteServer = ViteServer.create(config);
    }

    async run(testCollection: TestCollection, stats: RunnerStats): Promise<void> {
        try {
            await this.#viteServer.start();
        } catch (err) {
            throw new Error(`Vite server failed to start: ${(err as Error).message}`);
        }

        this.useBaseUrlFromVite();
        await super.run(testCollection, stats);
    }

    private useBaseUrlFromVite(): void {
        const viteBaseUrl = this.#viteServer.baseUrl!;

        this.config.baseUrl = viteBaseUrl;
        for (const broConfig of Object.values(this.config.browsers)) {
            broConfig.baseUrl = viteBaseUrl;
        }
    }

    cancel(): void {
        super.cancel();

        this.#viteServer.close();
    }
}
