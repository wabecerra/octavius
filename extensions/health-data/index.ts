import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { createHealthHttpHandler } from "./src/handler.js";
import { setHealthDataRuntime } from "./src/runtime.js";

const plugin = {
  id: "health-data",
  name: "Health Data",
  description: "Receives health data webhooks from ROOK SDK and Health Auto Export",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setHealthDataRuntime(api.runtime);

    const handler = createHealthHttpHandler({
      loadConfig: () => api.runtime.config.loadConfig(),
      log: {
        info: (msg) => api.logger.info(msg),
        warn: (msg) => api.logger.warn(msg),
        error: (msg) => api.logger.error(msg),
      },
    });

    api.registerHttpHandler(handler);
  },
};

export default plugin;
