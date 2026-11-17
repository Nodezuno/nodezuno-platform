import { HttpProblem } from "./http.ts";
import {
  normalizedRuntimeSecret,
  requestClientAddress,
  runtimeEnvironmentValue,
} from "./runtime-config.ts";

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

export async function privateHash(
  purpose: string,
  value: string,
): Promise<string> {
  const secret = normalizedRuntimeSecret(
    await runtimeEnvironmentValue("RATE_LIMIT_SECRET"),
  );
  if (!secret) {
    throw new HttpProblem(
      503,
      "security_configuration_unavailable",
      "Secure submissions are temporarily unavailable.",
    );
  }
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`${purpose}\u0000${value}`),
    ),
  );
}

export async function reviewCapabilityHash(
  purpose: string,
  value: string,
): Promise<string> {
  const secret = normalizedRuntimeSecret(
    await runtimeEnvironmentValue("REVIEW_CAPABILITY_SECRET"),
  );
  if (!secret) {
    throw new HttpProblem(
      503,
      "review_security_unavailable",
      "Private review access is temporarily unavailable.",
    );
  }
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`${purpose}\u0000${value}`),
    ),
  );
}

export async function developerApiKeyHash(value: string): Promise<string> {
  const secret = normalizedRuntimeSecret(
    await runtimeEnvironmentValue("API_KEY_PEPPER"),
  );
  if (!secret) {
    throw new HttpProblem(
      503,
      "api_key_security_unavailable",
      "API key security is temporarily unavailable.",
    );
  }
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`developer-api-key\u0000${value}`),
    ),
  );
}

export function stableStringify(value: Record<string, unknown>): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [
          key,
          item && typeof item === "object" && !Array.isArray(item)
            ? JSON.parse(
                stableStringify(item as Record<string, unknown>),
              ) as unknown
            : item,
        ]),
    ),
  );
}

export async function requestFingerprint(request: Request): Promise<{
  ipHash: string;
  userAgentHash: string | null;
}> {
  const ip = requestClientAddress(request);
  const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? "";
  const dailySalt = new Date().toISOString().slice(0, 10);

  return {
    ipHash: await privateHash("ip", `${dailySalt}|${ip}`),
    userAgentHash: userAgent
      ? await privateHash("user-agent", `${dailySalt}|${userAgent}`)
      : null,
  };
}
