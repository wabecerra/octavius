import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setHealthDataRuntime(r: PluginRuntime): void {
  runtime = r;
}

export function getHealthDataRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Health data runtime not initialized");
  }
  return runtime;
}
