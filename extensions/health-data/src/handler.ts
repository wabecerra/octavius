import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type { HealthDataConfig } from "./config-schema.js";
import type { RookWebhookPayload, AppleHealthPayload } from "./types.js";
import { verifyWebhookRequest } from "./verify.js";
import { normalizeRookPayload, normalizeAppleHealthPayload } from "./normalize.js";
import type { CanonicalReading } from "./normalize.js";

export type HealthHandlerDeps = {
  loadConfig: () => OpenClawConfig;
  log: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json;charset=UTF-8",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

/**
 * Resolves the health-data extension config from the full OpenClaw config.
 * Falls back to defaults for optional fields.
 */
function resolveHealthConfig(cfg: OpenClawConfig): HealthDataConfig | null {
  const ext = (cfg as Record<string, unknown>)["health-data"] as Record<string, unknown> | undefined;
  if (!ext) return null;
  return {
    enabled: ext.enabled !== false,
    rookWebhookPath: (ext.rookWebhookPath as string) ?? "/health/rook",
    appleHealthWebhookPath: (ext.appleHealthWebhookPath as string) ?? "/health/apple",
    webhookSecret: ext.webhookSecret as string,
    octaviusApiUrl: ext.octaviusApiUrl as string,
  };
}

/**
 * Forwards normalized readings to the Octavius /api/health/ingest endpoint.
 */
async function forwardToOctavius(
  readings: CanonicalReading[],
  source: "rook" | "apple_health",
  octaviusApiUrl: string,
  webhookSecret: string,
  log: HealthHandlerDeps["log"],
): Promise<{ ok: boolean; status?: number; data?: unknown }> {
  const url = `${octaviusApiUrl}/api/health/ingest`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${webhookSecret}`,
        "X-Health-Source": source,
      },
      body: JSON.stringify({ readings }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      log.error(`health-data: Octavius returned ${resp.status}: ${text}`);
      return { ok: false, status: resp.status };
    }
    const data = await resp.json().catch(() => ({}));
    return { ok: true, status: resp.status, data };
  } catch (err) {
    log.error(`health-data: failed to reach Octavius at ${url}: ${String(err)}`);
    return { ok: false };
  }
}

/**
 * Creates the HTTP handler for the health-data extension.
 * Routes requests to ROOK or Apple Health handler based on URL path.
 */
export function createHealthHttpHandler(deps: HealthHandlerDeps) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const cfg = deps.loadConfig();
    const healthCfg = resolveHealthConfig(cfg);

    // If no config, this handler doesn't match
    if (!healthCfg) return false;

    const rookPath = healthCfg.rookWebhookPath;
    const applePath = healthCfg.appleHealthWebhookPath;

    // Check if this request matches our paths
    const isRook = url.pathname === rookPath;
    const isApple = url.pathname === applePath;
    if (!isRook && !isApple) return false;

    // Only accept POST
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end("Method Not Allowed");
      return true;
    }

    // Check enabled flag
    if (!healthCfg.enabled) {
      sendJson(res, 503, { error: "Health data extension is disabled" });
      return true;
    }

    try {
      // Verify auth + body
      const verification = await verifyWebhookRequest(req, healthCfg.webhookSecret);
      if (!verification.ok) {
        sendJson(res, verification.status, { error: verification.reason });
        return true;
      }

      const payload = JSON.parse(verification.body);
      let readings: CanonicalReading[];
      let source: "rook" | "apple_health";

      if (isRook) {
        source = "rook";
        readings = normalizeRookPayload(payload as RookWebhookPayload);
        deps.log.info(`health-data: normalized ${readings.length} readings from ROOK webhook`);
      } else {
        source = "apple_health";
        readings = normalizeAppleHealthPayload(payload as AppleHealthPayload);
        deps.log.info(`health-data: normalized ${readings.length} readings from Apple Health webhook`);
      }

      if (readings.length === 0) {
        sendJson(res, 200, { stored: 0, duplicates: 0, message: "No readings extracted from payload" });
        return true;
      }

      // Forward to Octavius
      const result = await forwardToOctavius(
        readings,
        source,
        healthCfg.octaviusApiUrl,
        healthCfg.webhookSecret,
        deps.log,
      );

      if (!result.ok) {
        sendJson(res, 502, { error: "Upstream service unavailable" });
        return true;
      }

      sendJson(res, 200, result.data);
      return true;
    } catch (err) {
      deps.log.error(`health-data: handler error: ${String(err)}`);
      sendJson(res, 500, { error: "Internal error" });
      return true;
    }
  };
}
