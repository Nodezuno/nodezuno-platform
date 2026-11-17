import { sha256Hex } from "./crypto.ts";

export async function deterministicNotificationDeliveryId(
  topic: string,
  ...identityParts: string[]
): Promise<string> {
  const digest = await sha256Hex(
    ["nodezuno-notification-delivery-v1", topic, ...identityParts].join(
      "\u0000",
    ),
  );
  const bytes = digest.slice(0, 32).split("");
  bytes[12] = "4";
  bytes[16] = (8 + (Number.parseInt(bytes[16], 16) & 3)).toString(16);
  const value = bytes.join("");
  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20, 32),
  ].join("-");
}

export async function sealedNotificationPayload(
  payload: Record<string, string>,
): Promise<{ hash: string; json: string }> {
  const json = JSON.stringify(
    Object.fromEntries(
      Object.keys(payload)
        .sort()
        .map((key) => [key, payload[key]]),
    ),
  );
  return { hash: await sha256Hex(json), json };
}
