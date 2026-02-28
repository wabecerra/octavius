import type { IncomingMessage } from "node:http";

export type VerifyResult = { ok: true; body: string } | { ok: false; reason: string; status: number };

const MAX_BODY_SIZE = 5 * 1024 * 1024; // 5 MB

function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    req.on("data", (chunk: Uint8Array) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error("body_too_large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

export async function verifyWebhookRequest(
  req: IncomingMessage,
  secret: string,
  maxBodyBytes: number = MAX_BODY_SIZE,
): Promise<VerifyResult> {
  // Check bearer token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { ok: false, reason: "Missing or invalid Authorization header", status: 401 };
  }
  const token = authHeader.slice(7);
  if (token !== secret) {
    return { ok: false, reason: "Invalid webhook secret", status: 401 };
  }

  // Read and validate body
  let body: string;
  try {
    body = await readBody(req, maxBodyBytes);
  } catch (err) {
    if (err instanceof Error && err.message === "body_too_large") {
      return { ok: false, reason: "Request body exceeds size limit", status: 413 };
    }
    return { ok: false, reason: "Failed to read request body", status: 400 };
  }

  // Validate JSON
  try {
    JSON.parse(body);
  } catch {
    return { ok: false, reason: "Invalid JSON body", status: 400 };
  }

  return { ok: true, body };
}
