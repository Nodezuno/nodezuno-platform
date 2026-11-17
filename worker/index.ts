/** Cloudflare Worker entry point for the Nodezuno application. */
import handler from "vinext/server/app-router-entry";
import { processOneCloudflareNotification } from "../lib/server/cloudflare-notification-worker";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  DELIVERABLES: R2Bucket;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ScheduledController {
  cron: string;
  scheduledTime: number;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const nonce = createNonce();
    const contentSecurityPolicy = createContentSecurityPolicy(nonce);
    const applicationRequest = withContentSecurityPolicy(
      request,
      contentSecurityPolicy,
    );

    return withSecurityHeaders(
      await handler.fetch(applicationRequest, env, ctx),
      request,
      contentSecurityPolicy,
    );
  },

  async scheduled(
    controller: ScheduledController,
  ): Promise<void> {
    if (controller.cron !== "* * * * *") return;
    try {
      const state = await processOneCloudflareNotification();
      console.log(JSON.stringify({
        event: "cloudflare_outbox_pass",
        scheduledTime: controller.scheduledTime,
        state,
      }));
      if (state === "failed") {
        throw new Error("Cloudflare outbox item reached terminal failure.");
      }
    } catch (error) {
      console.error(JSON.stringify({
        event: "cloudflare_outbox_failed",
        scheduledTime: controller.scheduledTime,
        error: error instanceof Error ? error.name : "UnknownError",
      }));
      throw new Error("Cloudflare outbox scheduled pass failed.");
    }
  },
};

function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes));
}

function createContentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'self' mailto:",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "img-src 'self' data:",
    "manifest-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}'`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

function withContentSecurityPolicy(
  request: Request,
  contentSecurityPolicy: string,
): Request {
  const headers = new Headers(request.headers);
  headers.set("Content-Security-Policy", contentSecurityPolicy);
  return new Request(request, { headers });
}

function withSecurityHeaders(
  response: Response,
  request: Request,
  contentSecurityPolicy: string,
): Response {
  const secured = new Response(response.body, response);
  const headers = secured.headers;
  if (!headers.has("Content-Security-Policy")) {
    headers.set("Content-Security-Policy", contentSecurityPolicy);
  }
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set(
    "Permissions-Policy",
    "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  );
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  if (new URL(request.url).protocol === "https:") {
    headers.set("Strict-Transport-Security", "max-age=31536000");
  }
  return secured;
}

export default worker;
