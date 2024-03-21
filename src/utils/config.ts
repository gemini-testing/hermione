import { NODEJS_TEST_RUN_ENV } from "../constants/config";
import type { CommonConfig } from "../config/types";

export const isRunInNodeJsEnv = (config: CommonConfig): boolean => {
    return config.system.testRunEnv === NODEJS_TEST_RUN_ENV;
};
