import vinext from "vinext";
import { defineConfig } from "vite";
import { sites } from "./build/sites-vite-plugin.ts";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

export default defineConfig(async ({ command, mode }) => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  const bindingConfig = {
    main: "./worker/index.ts",
    // The Cloudflare Vite plugin writes local secrets beside generated preview
    // config. A production build must not carry .dev.vars into dist, even as a
    // local-only file. Runtime production secrets are injected by Cloudflare.
    ...(command === "build" ? { secrets: { required: [] } } : {}),
    ...(command === "serve" && mode === "development"
      ? {
          vars: {
            RATE_LIMIT_SECRET:
              process.env.RATE_LIMIT_SECRET ??
              "local-development-only-nodezuno-rate-limit-secret",
            BETTER_AUTH_SECRET:
              process.env.BETTER_AUTH_SECRET ??
              "local-development-only-nodezuno-auth-secret-change-me",
            BETTER_AUTH_URL:
              process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
            NODEZUNO_LOCAL_PREVIEW:
              process.env.NODEZUNO_LOCAL_PREVIEW ?? "true",
            GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "",
            GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "",
            // Local preview may intentionally run without outbound email.
            // Do not inject a half-configured SMTP host when no password is
            // present, because readiness correctly rejects partial delivery
            // configuration outside this local-only case.
            ZOHO_SMTP_HOST: process.env.ZOHO_SMTP_HOST ?? "",
            NODEZUNO_ADMIN_EMAILS:
              process.env.NODEZUNO_ADMIN_EMAILS ?? "",
            NODEZUNO_ENABLE_LEGACY_HOSTING_IDENTITY:
              process.env.NODEZUNO_ENABLE_LEGACY_HOSTING_IDENTITY ?? "false",
            NODEZUNO_LEGAL_LAUNCH_APPROVED:
              process.env.NODEZUNO_LEGAL_LAUNCH_APPROVED ?? "false",
            NODEZUNO_PUBLIC_INDEXING:
              process.env.NODEZUNO_PUBLIC_INDEXING ?? "false",
          },
        }
      : {}),
  };

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: bindingConfig,
      }),
    ],
  };
});
