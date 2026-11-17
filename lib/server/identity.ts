import type { ParsedUser } from "./http.ts";
import { HttpProblem, userFromRequest } from "./http.ts";
import {
  isContainerRuntime,
  normalizeAccessTeamDomain,
  runtimeEnvironmentValue,
} from "./runtime-config.ts";

type HeaderReader = {
  get(name: string): string | null;
};

type AccessJsonWebKey = JsonWebKey & {
  alg?: string;
  kid?: string;
  use?: string;
};

type JsonWebKeySet = {
  keys: AccessJsonWebKey[];
};

type AccessClaims = {
  aud?: string | string[];
  email?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  nbf?: number;
};

const jwksCache = new Map<
  string,
  { expiresAt: number; keys: JsonWebKey[] }
>();
const JWKS_CACHE_MS = 10 * 60 * 1000;
const CLOCK_SKEW_SECONDS = 30;

export async function verifiedUserFromRequest(
  request: Request,
): Promise<ParsedUser | null> {
  if (!isContainerRuntime()) {
    if (!(await legacyHostingIdentityEnabled())) return null;
    return userFromRequest(request);
  }
  return verifiedContainerUser(request.headers);
}

export async function verifiedUserFromHeaders(
  requestHeaders: HeaderReader,
): Promise<ParsedUser | null> {
  if (!isContainerRuntime()) {
    if (!(await legacyHostingIdentityEnabled())) return null;
    return userFromHeaderReader(requestHeaders);
  }
  return verifiedContainerUser(requestHeaders);
}

async function legacyHostingIdentityEnabled(): Promise<boolean> {
  return (
    (await runtimeEnvironmentValue(
      "NODEZUNO_ENABLE_LEGACY_HOSTING_IDENTITY",
    ))?.trim() === "true"
  );
}

export async function verifyCloudflareAccessJwt(options: {
  token: string;
  teamDomain: string;
  audience: string;
  jwks?: JsonWebKeySet;
  now?: number;
}): Promise<ParsedUser> {
  const teamDomain = normalizeAccessTeamDomain(options.teamDomain);
  if (!teamDomain || options.audience.trim().length < 16) {
    throw authenticationConfigurationProblem();
  }

  const parts = options.token.split(".");
  if (parts.length !== 3 || options.token.length > 16_384) {
    throw authenticationProblem();
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = parseJsonSegment<{
    alg?: string;
    kid?: string;
    typ?: string;
  }>(encodedHeader);
  const payload = parseJsonSegment<AccessClaims>(encodedPayload);
  if (
    header.alg !== "RS256" ||
    typeof header.kid !== "string" ||
    header.kid.length < 1 ||
    header.kid.length > 256
  ) {
    throw authenticationProblem();
  }

  let jwks =
    options.jwks ?? (await loadCloudflareAccessKeys(teamDomain));
  let signingKey = findSigningKey(jwks, header.kid);
  if (!signingKey && !options.jwks) {
    jwks = await loadCloudflareAccessKeys(teamDomain, true);
    signingKey = findSigningKey(jwks, header.kid);
  }
  if (!signingKey) throw authenticationProblem();

  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      "jwk",
      signingKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    throw authenticationProblem();
  }

  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    Uint8Array.from(decodeBase64Url(encodedSignature)).buffer,
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!verified) throw authenticationProblem();

  const now = Math.floor((options.now ?? Date.now()) / 1000);
  const audienceMatches = Array.isArray(payload.aud)
    ? payload.aud.includes(options.audience)
    : payload.aud === options.audience;
  const email = payload.email?.trim().toLowerCase() ?? "";
  if (
    payload.iss !== teamDomain ||
    !audienceMatches ||
    typeof payload.exp !== "number" ||
    payload.exp <= now - CLOCK_SKEW_SECONDS ||
    (typeof payload.nbf === "number" &&
      payload.nbf > now + CLOCK_SKEW_SECONDS) ||
    (typeof payload.iat === "number" &&
      payload.iat > now + CLOCK_SKEW_SECONDS) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
  ) {
    throw authenticationProblem();
  }

  return {
    email,
    fullName: null,
    displayName: email,
  };
}

function findSigningKey(
  jwks: JsonWebKeySet,
  keyId: string,
): AccessJsonWebKey | undefined {
  return jwks.keys.find(
    (key) =>
      key.kid === keyId &&
      key.kty === "RSA" &&
      (!key.alg || key.alg === "RS256") &&
      (!key.use || key.use === "sig"),
  );
}

async function verifiedContainerUser(
  requestHeaders: HeaderReader,
): Promise<ParsedUser | null> {
  const token =
    requestHeaders.get("cf-access-jwt-assertion")?.trim() ?? "";
  if (!token) return null;

  const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN ?? "";
  const audience = process.env.CF_ACCESS_AUDIENCE?.trim() ?? "";
  return verifyCloudflareAccessJwt({
    token,
    teamDomain,
    audience,
  });
}

async function loadCloudflareAccessKeys(
  teamDomain: string,
  forceRefresh = false,
): Promise<JsonWebKeySet> {
  const cached = jwksCache.get(teamDomain);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return { keys: cached.keys };
  }

  let response: Response;
  try {
    response = await fetch(`${teamDomain}/cdn-cgi/access/certs`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw authenticationConfigurationProblem();
  }
  if (!response.ok) throw authenticationConfigurationProblem();

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw authenticationConfigurationProblem();
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    !Array.isArray((payload as { keys?: unknown }).keys)
  ) {
    throw authenticationConfigurationProblem();
  }

  const keys = (payload as JsonWebKeySet).keys.filter(
    (key) =>
      key &&
      typeof key === "object" &&
      key.kty === "RSA" &&
      typeof key.kid === "string",
  );
  if (keys.length === 0) throw authenticationConfigurationProblem();
  jwksCache.set(teamDomain, {
    keys,
    expiresAt: Date.now() + JWKS_CACHE_MS,
  });
  return { keys };
}

function userFromHeaderReader(
  requestHeaders: HeaderReader,
): ParsedUser | null {
  const email =
    requestHeaders
      .get("oai-authenticated-user-email")
      ?.trim()
      .toLowerCase() ?? "";
  if (!email) return null;

  const encodedName = requestHeaders.get(
    "oai-authenticated-user-full-name",
  );
  const fullName =
    encodedName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? safeDecode(encodedName)
      : null;
  return {
    email,
    fullName,
    displayName: fullName ?? email,
  };
}

function parseJsonSegment<T>(value: string): T {
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        decodeBase64Url(value),
      ),
    ) as T;
  } catch {
    throw authenticationProblem();
  }
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw authenticationProblem();
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  try {
    return Uint8Array.from(atob(padded), (character) =>
      character.charCodeAt(0),
    );
  } catch {
    throw authenticationProblem();
  }
}

function authenticationProblem(): HttpProblem {
  return new HttpProblem(
    401,
    "authentication_invalid",
    "Authentication could not be verified.",
  );
}

function authenticationConfigurationProblem(): HttpProblem {
  return new HttpProblem(
    503,
    "authentication_unavailable",
    "Verified identity is temporarily unavailable.",
  );
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
