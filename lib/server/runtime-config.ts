const ORIGIN_SECRET_HEADER = "x-nodezuno-origin-secret";
const ZOHO_SMTP_HOSTS = new Set([
  "smtp.zoho.com",
  "smtp.zoho.eu",
  "smtp.zoho.in",
  "smtp.zoho.com.au",
  "smtp.zoho.jp",
  "smtp.zoho.ca",
  "smtp.zoho.com.cn",
  "smtp.zoho.ae",
  "smtp.zoho.sa",
]);
export const INTERNAL_CLIENT_IP_HEADER = "x-nodezuno-client-ip";
export const INTERNAL_ORIGIN_VERIFIED_HEADER =
  "x-nodezuno-origin-verified";

export type ContainerDatabaseDriver = "d1-rest" | "sqlite";
export type ContainerIngressMode = "direct" | "trusted-gateway";
export type TrustedIngressKind = "sites" | ContainerIngressMode;

export function isContainerRuntime(): boolean {
  return process.env.NODEZUNO_RUNTIME === "container";
}

export async function runtimeEnvironmentValue(
  name: string,
): Promise<string | undefined> {
  if (isContainerRuntime()) {
    return process.env[name];
  }
  try {
    const { siteEnvironmentValue } = await import(
      "./sites-environment.ts"
    );
    return (await siteEnvironmentValue(name)) ?? process.env[name];
  } catch (error) {
    if (isUnsupportedCloudflareModuleError(error)) {
      return process.env[name];
    }
    throw error;
  }
}

function isUnsupportedCloudflareModuleError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Received protocol 'cloudflare:'") ||
    message.includes('Cannot find package "cloudflare:workers"') ||
    message.includes("Cannot find module 'cloudflare:workers'")
  );
}

export function configuredPublicOrigin(): string | null {
  if (!isContainerRuntime()) return null;
  return normalizeApplicationOrigin(process.env.PUBLIC_ORIGIN);
}

export function requestClientAddress(request: Request): string {
  return (
    normalizeClientAddress(
      request.headers.get(INTERNAL_CLIENT_IP_HEADER),
    ) ?? "unknown"
  );
}

export function clientAddressFromTrustedIngress(
  request: Request,
  ingress: TrustedIngressKind,
): string | null {
  if (ingress === "sites") {
    return normalizeClientAddress(
      request.headers.get("cf-connecting-ip"),
    );
  }

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded !== null) {
    if (forwarded.length > 4096) return null;
    return normalizeClientAddress(forwarded.split(",").at(-1) ?? null);
  }
  return normalizeClientAddress(request.headers.get("x-real-ip"));
}

export function hasValidOriginGatewaySecret(request: Request): boolean {
  if (!isContainerRuntime()) return true;
  const expected = normalizedRuntimeSecret(
    process.env.NODEZUNO_ORIGIN_SECRET,
  );
  const provided =
    request.headers.get(ORIGIN_SECRET_HEADER)?.trim() ?? "";
  return expected !== null && constantTimeStringEqual(provided, expected);
}

export function hasValidDirectIngressRequest(
  request: Request,
): boolean {
  if (
    !isContainerRuntime() ||
    containerIngressMode(process.env.NODEZUNO_INGRESS_MODE) !==
      "direct"
  ) {
    return false;
  }
  return hasValidPublicOriginRequest(request);
}

export function hasValidPublicOriginRequest(
  request: Request,
): boolean {
  if (!isContainerRuntime()) return false;
  const expectedOrigin = configuredPublicOrigin();
  if (!expectedOrigin) return false;
  let requestUrl: URL;
  let expected: URL;
  try {
    requestUrl = new URL(request.url);
    expected = new URL(expectedOrigin);
  } catch {
    return false;
  }
  const forwardedHost =
    request.headers.get("x-forwarded-host")?.trim() ?? "";
  const host = forwardedHost || request.headers.get("host")?.trim() || "";
  if (
    !host ||
    host.includes(",") ||
    host.toLowerCase() !== expected.host.toLowerCase()
  ) {
    return false;
  }
  const forwardedProtocol =
    request.headers.get("x-forwarded-proto")?.trim() ?? "";
  if (forwardedProtocol.includes(",")) return false;
  const protocol = forwardedProtocol
    ? `${forwardedProtocol.toLowerCase()}:`
    : requestUrl.protocol;
  return protocol === expected.protocol;
}

export function runtimeConfigurationSnapshot(): {
  runtime: "sites" | "container";
  publicOrigin: boolean;
  rateLimitSecret: boolean;
  apiKeyPepper: boolean;
  reviewCapabilitySecret: boolean;
  secretIsolation: boolean;
  administratorAllowlist: boolean;
  accountAuthentication: boolean;
  databaseConnection: boolean;
  ingressBoundary: boolean;
  accessIdentity: boolean;
  notificationDelivery: boolean;
  deliverableStorage: boolean;
} {
  const rateLimitSecret = normalizedRuntimeSecret(
    process.env.RATE_LIMIT_SECRET,
  );
  const apiKeyPepper = normalizedRuntimeSecret(
    process.env.API_KEY_PEPPER,
  );
  const betterAuthSecret = normalizedRuntimeSecret(
    process.env.BETTER_AUTH_SECRET,
  );
  const reviewCapabilitySecret = normalizedRuntimeSecret(
    process.env.REVIEW_CAPABILITY_SECRET,
  );
  const originGatewaySecret = normalizedRuntimeSecret(
    process.env.NODEZUNO_ORIGIN_SECRET,
  );
  const ingressMode = containerIngressMode(
    process.env.NODEZUNO_INGRESS_MODE,
  );
  const rawOriginGatewaySecret =
    process.env.NODEZUNO_ORIGIN_SECRET;
  const ingressBoundary =
    ingressMode === "direct"
      ? rawOriginGatewaySecret === undefined ||
        rawOriginGatewaySecret === ""
      : ingressMode === "trusted-gateway" &&
        originGatewaySecret !== null;
  const grpcAuthSecret = normalizedRuntimeSecret(
    process.env.NODEZUNO_GRPC_AUTH_SECRET,
  );
  const grpcAuthConfigured = Boolean(
    process.env.NODEZUNO_GRPC_AUTH_SECRET?.trim(),
  );
  const publicOrigin = configuredPublicOrigin();
  const deploymentDomain = normalizeApplicationDomain(
    process.env.NODEZUNO_DOMAIN,
    process.env.NODEZUNO_LOCAL_PREVIEW === "true",
  );
  const publicOriginMatchesDomain = Boolean(
    publicOrigin &&
      deploymentDomain &&
      new URL(publicOrigin).hostname.toLowerCase() === deploymentDomain,
  );
  const authenticationOrigin = normalizeApplicationOrigin(
    process.env.BETTER_AUTH_URL ?? process.env.PUBLIC_ORIGIN,
  );
  const administratorEmails = (process.env.NODEZUNO_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(isOperationalEmailAddress);
  const googleConfigurationValid = optionalGoogleConfigurationIsValid(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  const emailConfigurationValid =
    optionalEmailDeliveryConfigurationIsValid(
      process.env.ZOHO_SMTP_PASSWORD,
      process.env.ZOHO_SMTP_HOST,
    );
  const notificationDelivery =
    Boolean(
      process.env.ZOHO_SMTP_PASSWORD?.trim() &&
        process.env.ZOHO_SMTP_HOST?.trim(),
    ) && optionalNotificationDeliveryConfigurationIsValid(
      process.env.ZOHO_SMTP_PASSWORD,
      process.env.ZOHO_SMTP_HOST,
    );
  const emailAuthenticationAvailable =
    emailConfigurationValid &&
    (Boolean(
      process.env.ZOHO_SMTP_PASSWORD?.trim() &&
        process.env.ZOHO_SMTP_HOST?.trim(),
    ) ||
      allowsLocalUnverifiedEmailAuthentication(
        process.env.BETTER_AUTH_URL ??
          process.env.PUBLIC_ORIGIN,
        process.env.NODEZUNO_LOCAL_PREVIEW,
      ));
  const accessIdentity = optionalAccessIdentityConfigurationIsValid(
    process.env.CF_ACCESS_TEAM_DOMAIN,
    process.env.CF_ACCESS_AUDIENCE,
  );
  const databaseDriver = containerDatabaseDriver(
    process.env.NODEZUNO_DATABASE_DRIVER,
  );
  const sqliteDatabasePath = normalizeSqliteDatabasePath(
    process.env.NODEZUNO_SQLITE_PATH,
  );
  const d1DatabaseConnection =
    /^[a-f0-9]{32}$/i.test(
      process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "",
    ) &&
    /^[a-f0-9-]{36}$/i.test(
      process.env.CLOUDFLARE_D1_DATABASE_ID?.trim() ?? "",
    ) &&
    normalizedRuntimeIdentifier(
      process.env.CLOUDFLARE_D1_API_TOKEN,
      40,
    ) !== null;
  const deliverableStorage =
    /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(
      process.env.NODEZUNO_DELIVERABLE_BUCKET?.trim() ?? "",
    ) &&
    /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(
      process.env.AWS_REGION?.trim() ?? "",
    ) &&
    /^arn:aws(?:-us-gov)?:kms:[a-z0-9-]+:\d{12}:key\/[0-9a-f-]{36}$/i.test(
      process.env.NODEZUNO_DELIVERABLE_KMS_KEY_ARN?.trim() ?? "",
    );

  return {
    runtime: isContainerRuntime() ? "container" : "sites",
    publicOrigin: publicOriginMatchesDomain,
    rateLimitSecret: rateLimitSecret !== null,
    apiKeyPepper: apiKeyPepper !== null,
    reviewCapabilitySecret: reviewCapabilitySecret !== null,
    secretIsolation:
      allValuesAreDistinct(
        ingressMode === "trusted-gateway"
          ? [
              rateLimitSecret,
              apiKeyPepper,
              betterAuthSecret,
              reviewCapabilitySecret,
              originGatewaySecret,
            ]
          : [rateLimitSecret, apiKeyPepper, betterAuthSecret, reviewCapabilitySecret],
      ) &&
      (!grpcAuthConfigured ||
        (grpcAuthSecret !== null &&
          ![
            rateLimitSecret,
            apiKeyPepper,
            betterAuthSecret,
            reviewCapabilitySecret,
            ...(ingressMode === "trusted-gateway"
              ? [originGatewaySecret]
              : []),
          ].includes(grpcAuthSecret))),
    administratorAllowlist: administratorEmails.length > 0,
    accountAuthentication:
      betterAuthSecret !== null &&
      authenticationOrigin !== null &&
      authenticationOrigin === publicOrigin &&
      googleConfigurationValid &&
      emailAuthenticationAvailable,
    databaseConnection:
      databaseDriver === "sqlite"
        ? sqliteDatabasePath !== null
        : databaseDriver === "d1-rest" && d1DatabaseConnection,
    ingressBoundary,
    accessIdentity,
    notificationDelivery,
    deliverableStorage,
  };
}

export function containerIngressMode(
  value: string | undefined,
): ContainerIngressMode | null {
  if (value === undefined || value === "") return "trusted-gateway";
  if (value !== value.trim()) return null;
  return value === "direct" || value === "trusted-gateway"
    ? value
    : null;
}

export function containerDatabaseDriver(
  value: string | undefined,
): ContainerDatabaseDriver | null {
  if (value === undefined || value === "") return "d1-rest";
  if (value !== value.trim()) return null;
  return value === "d1-rest" || value === "sqlite" ? value : null;
}

export function normalizeSqliteDatabasePath(
  value: string | undefined,
): string | null {
  const raw = value?.trim();
  if (
    !raw ||
    raw !== value ||
    raw.length > 1024 ||
    !raw.startsWith("/") ||
    raw === "/" ||
    /[\u0000-\u001f\u007f]/.test(raw)
  ) {
    return null;
  }
  const segments = raw.split("/");
  if (
    segments.some(
      (segment, index) =>
        index > 0 &&
        (segment.length === 0 || segment === "." || segment === ".."),
    ) ||
    !/\.(?:db|sqlite|sqlite3)$/i.test(raw)
  ) {
    return null;
  }
  return raw;
}

export function normalizedRuntimeSecret(
  value: string | undefined,
): string | null {
  const normalized = normalizedRuntimeIdentifier(value, 32);
  if (!normalized) return null;
  const distinctCharacters = new Set(normalized).size;
  return distinctCharacters >= 8 ? normalized : null;
}

export function normalizedRuntimeIdentifier(
  value: string | undefined,
  minimumLength: number,
): string | null {
  const raw = value?.trim();
  if (
    !raw ||
    raw !== value ||
    raw.length < minimumLength ||
    raw.length > 4096 ||
    /[\u0000-\u0020\u007f]/.test(raw) ||
    /(?:change[-_ ]?me|replace[-_ ]?with|example|your[-_ ]|<[^>]+>)/i.test(
      raw,
    )
  ) {
    return null;
  }
  return raw;
}

export function allValuesAreDistinct(
  values: Array<string | null>,
): boolean {
  return (
    values.every((value): value is string => value !== null) &&
    new Set(values).size === values.length
  );
}

export function optionalPairIsComplete(
  left: string | undefined,
  right: string | undefined,
): boolean {
  const leftConfigured = Boolean(left?.trim());
  const rightConfigured = Boolean(right?.trim());
  return leftConfigured === rightConfigured;
}

export function optionalAccessIdentityConfigurationIsValid(
  teamDomain: string | undefined,
  audience: string | undefined,
): boolean {
  if (!optionalPairIsComplete(teamDomain, audience)) return false;
  if (!teamDomain?.trim() && !audience?.trim()) return true;
  return Boolean(
    normalizeAccessTeamDomain(teamDomain) &&
      normalizedRuntimeIdentifier(audience, 16),
  );
}

export function optionalGoogleConfigurationIsValid(
  clientId: string | undefined,
  clientSecret: string | undefined,
): boolean {
  if (!optionalPairIsComplete(clientId, clientSecret)) return false;
  if (!clientId?.trim() && !clientSecret?.trim()) return true;
  return Boolean(
    normalizedRuntimeIdentifier(clientId, 8) &&
      normalizedRuntimeIdentifier(clientSecret, 16),
  );
}

export function optionalEmailDeliveryConfigurationIsValid(
  password: string | undefined,
  host: string | undefined,
): boolean {
  if (!optionalPairIsComplete(password, host)) return false;
  if (!password?.trim() && !host?.trim()) return true;
  const normalizedPassword = password?.trim() ?? "";
  const normalizedHost = host?.trim() ?? "";
  return Boolean(
    normalizedPassword === password &&
      normalizedPassword.length >= 8 &&
      normalizedPassword.length <= 512 &&
      !/[\r\n\u0000]/.test(normalizedPassword) &&
      normalizedHost === host &&
      ZOHO_SMTP_HOSTS.has(normalizedHost),
  );
}

export function optionalNotificationDeliveryConfigurationIsValid(
  password: string | undefined,
  host: string | undefined,
): boolean {
  return optionalEmailDeliveryConfigurationIsValid(password, host);
}

export function allowsLocalUnverifiedEmailAuthentication(
  origin: string | undefined,
  localPreview: string | undefined,
): boolean {
  if (localPreview !== "true") return false;
  const normalized = normalizeApplicationOrigin(origin, true);
  if (!normalized || normalized !== origin) return false;
  const url = new URL(normalized);
  return (
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  );
}

export function normalizeApplicationOrigin(
  value: string | undefined,
  allowLocalPreview = process.env.NODEZUNO_LOCAL_PREVIEW === "true",
): string | null {
  const raw = value?.trim();
  if (!raw || raw !== value) return null;
  try {
    const url = new URL(raw);
    const localPreview =
      allowLocalPreview &&
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (
      (url.protocol !== "https:" && !localPreview) ||
      url.username ||
      url.password ||
      (!localPreview && !isPublicApplicationHostname(url.hostname)) ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function normalizeApplicationDomain(
  value: string | undefined,
  allowLocalPreview = process.env.NODEZUNO_LOCAL_PREVIEW === "true",
): string | null {
  const raw = value?.trim().toLowerCase();
  if (!raw || raw !== value || raw.length > 253) return null;
  if (allowLocalPreview && (raw === "localhost" || raw === "127.0.0.1")) {
    return raw;
  }
  return isPublicApplicationHostname(raw) ? raw : null;
}

function isPublicApplicationHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized.includes(".") &&
    /^[a-z0-9.-]+$/.test(normalized) &&
    !normalized.startsWith(".") &&
    !normalized.endsWith(".") &&
    !normalized.includes("..") &&
    !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(normalized) &&
    !/(?:^|\.)(?:local|internal|localhost|invalid|test|example|onion)(?:\.|$)/.test(
      normalized,
    )
  );
}

export function isOperationalEmailAddress(email: string): boolean {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return false;
  const domain = email.slice(email.lastIndexOf("@") + 1);
  return (
    domain !== "example.com" &&
    !domain.endsWith(".example") &&
    !domain.endsWith(".invalid") &&
    !domain.endsWith(".test") &&
    domain !== "localhost"
  );
}

export function normalizeAccessTeamDomain(
  value: string | undefined,
): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      !url.hostname.endsWith(".cloudflareaccess.com")
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function normalizeClientAddress(value: string | null): string | null {
  const raw = value?.trim();
  if (!raw || raw.length > 64 || /[\s,]/.test(raw)) return null;

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(raw)) {
    const segments = raw.split(".");
    if (
      segments.some(
        (segment) =>
          Number(segment) > 255 ||
          (segment.length > 1 && segment.startsWith("0")),
      )
    ) {
      return null;
    }
    return segments.map(Number).join(".");
  }

  if (
    !raw.includes(":") ||
    !/^[0-9a-f:.]+$/i.test(raw)
  ) {
    return null;
  }
  try {
    const hostname = new URL(`http://[${raw}]/`).hostname;
    return hostname.slice(1, -1).toLowerCase();
  } catch {
    return null;
  }
}

function constantTimeStringEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |=
      (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}
