import { NextRequest, NextResponse } from "next/server.js";
import { permanentPublicRedirectTarget } from "./lib/public-navigation.ts";
import {
  clientAddressFromTrustedIngress,
  containerIngressMode,
  hasValidDirectIngressRequest,
  hasValidOriginGatewaySecret,
  hasValidPublicOriginRequest,
  INTERNAL_CLIENT_IP_HEADER,
  INTERNAL_ORIGIN_VERIFIED_HEADER,
  isContainerRuntime,
} from "./lib/server/runtime-config.ts";

export function proxy(request: NextRequest) {
  const containerRuntime = isContainerRuntime();
  if (!containerRuntime) {
    const redirectResponse = permanentNavigationRedirect(request);
    if (redirectResponse) return redirectResponse;

    const requestHeaders = sanitizedIngressHeaders(
      request,
      clientAddressFromTrustedIngress(request, "sites"),
    );
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const unauthenticatedProbe =
    request.nextUrl.pathname === "/api/v1/live" ||
    request.nextUrl.pathname === "/api/v1/ready";
  const ingressMode = containerIngressMode(
    process.env.NODEZUNO_INGRESS_MODE,
  );
  const gatewayVerified =
    (ingressMode === "direct"
      ? hasValidDirectIngressRequest(request)
      : ingressMode === "trusted-gateway" &&
        hasValidOriginGatewaySecret(request) &&
        hasValidPublicOriginRequest(request)) ||
    isLocalPreview(request);
  if (!unauthenticatedProbe && !gatewayVerified) {
    const response = NextResponse.json(
      {
        type: "https://nodezuno.com/problems/ingress_boundary_required",
        title: "The configured ingress boundary is required.",
        status: 403,
        code: "ingress_boundary_required",
      },
      { status: 403 },
    );
    response.headers.set("Cache-Control", "no-store");
    applySecurityHeaders(response, request, null);
    return response;
  }

  const nonce = createNonce();
  const contentSecurityPolicy = createContentSecurityPolicy(nonce);
  const redirectResponse = permanentNavigationRedirect(request);
  if (redirectResponse) {
    applySecurityHeaders(
      redirectResponse,
      request,
      contentSecurityPolicy,
    );
    return redirectResponse;
  }

  const clientAddress =
    gatewayVerified && ingressMode
      ? clientAddressFromTrustedIngress(request, ingressMode)
      : null;
  const requestHeaders = sanitizedIngressHeaders(
    request,
    clientAddress,
  );
  requestHeaders.set(
    INTERNAL_ORIGIN_VERIFIED_HEADER,
    gatewayVerified ? "1" : "0",
  );
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  applySecurityHeaders(response, request, contentSecurityPolicy);
  return response;
}

function permanentNavigationRedirect(
  request: NextRequest,
): NextResponse | null {
  const target = permanentPublicRedirectTarget(request.nextUrl.pathname);
  if (!target) return null;

  const destination = request.nextUrl.clone();
  const fragmentIndex = target.indexOf("#");
  destination.pathname =
    fragmentIndex === -1 ? target : target.slice(0, fragmentIndex);
  destination.hash =
    fragmentIndex === -1 ? "" : target.slice(fragmentIndex);
  return NextResponse.redirect(destination, 308);
}

function sanitizedIngressHeaders(
  request: NextRequest,
  clientAddress: string | null,
): Headers {
  const headers = new Headers(request.headers);
  headers.delete("x-nodezuno-origin-secret");
  headers.delete(INTERNAL_ORIGIN_VERIFIED_HEADER);
  headers.delete(INTERNAL_CLIENT_IP_HEADER);
  if (clientAddress) {
    headers.set(INTERNAL_CLIENT_IP_HEADER, clientAddress);
  }
  return headers;
}

function createNonce(): string {
  return btoa(crypto.randomUUID()).replaceAll("=", "");
}

function createContentSecurityPolicy(nonce: string): string {
  const scriptDevelopment =
    process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  const deliverableOrigin = deliverableUploadOrigin();
  return [
    "default-src 'self'",
    "base-uri 'self'",
    `connect-src 'self'${deliverableOrigin ? ` ${deliverableOrigin}` : ""}`,
    "font-src 'self'",
    "form-action 'self' mailto:",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "img-src 'self' data: blob:",
    "manifest-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}'${scriptDevelopment}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self'",
    ...(process.env.PUBLIC_ORIGIN?.startsWith("https://")
      ? ["upgrade-insecure-requests"]
      : []),
  ].join("; ");
}

function deliverableUploadOrigin(): string | null {
  const bucket = process.env.NODEZUNO_DELIVERABLE_BUCKET?.trim() ?? "";
  const region = process.env.AWS_REGION?.trim() ?? "";
  if (
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) ||
    !/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region)
  ) {
    return null;
  }
  return `https://${bucket}.s3.${region}.amazonaws.com`;
}

function applySecurityHeaders(
  response: NextResponse,
  request: NextRequest,
  contentSecurityPolicy: string | null,
): void {
  if (contentSecurityPolicy) {
    response.headers.set(
      "Content-Security-Policy",
      contentSecurityPolicy,
    );
  }
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  );
  response.headers.set(
    "Referrer-Policy",
    "strict-origin-when-cross-origin",
  );
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  if (
    process.env.PUBLIC_ORIGIN?.startsWith("https://") ||
    request.headers.get("x-forwarded-proto") === "https" ||
    request.nextUrl.protocol === "https:"
  ) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000",
    );
  }
}

function isLocalPreview(request: NextRequest): boolean {
  if (process.env.NODEZUNO_LOCAL_PREVIEW !== "true") return false;
  let publicOrigin: URL;
  try {
    publicOrigin = new URL(process.env.PUBLIC_ORIGIN ?? "");
  } catch {
    return false;
  }
  return (
    publicOrigin.protocol === "http:" &&
    (publicOrigin.hostname === "localhost" ||
      publicOrigin.hostname === "127.0.0.1") &&
    (request.nextUrl.hostname === "localhost" ||
      request.nextUrl.hostname === "127.0.0.1")
  );
}

export const config = {
  matcher: "/:path*",
};
