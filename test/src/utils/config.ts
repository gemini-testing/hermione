import { isRunInNodeJsEnv } from "../../../src/utils/config";
import { NODEJS_TEST_RUN_ENV, BROWSER_TEST_RUN_ENV } from "../../../src/constants/config";
import type { CommonConfig } from "../../../src/config/types";

describe("config-utils", () => {
    describe("isRunInNodeJsEnv", () => {
        it("should return 'true' if running in node environment", () => {
            const config = {
                system: {
                    testRunEnv: NODEJS_TEST_RUN_ENV,
                },
            } as CommonConfig;

            assert.isTrue(isRunInNodeJsEnv(config));
        });

        it("should return 'false' if running in browser environment", () => {
            const config = {
                system: {
                    testRunEnv: BROWSER_TEST_RUN_ENV,
                },
            } as CommonConfig;

            assert.isFalse(isRunInNodeJsEnv(config));
        });
    });
});
