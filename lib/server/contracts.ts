export const submissionKinds = [
  "sales",
  "workspace_access",
  "support",
  "startup_program",
  "press",
  "career_interest",
  "security_contact",
  "event_interest",
] as const;

export type SubmissionKind = (typeof submissionKinds)[number];

export const teamTypes = [
  "DeFi protocol",
  "Stablecoin issuer",
  "RWA / tokenized assets",
  "Audit / security firm",
  "Protocol engineering team",
  "Governance / risk team",
  "Protocol foundation",
  "New L1 core team",
  "L2 / rollup team",
  "Appchain team",
  "Validator / node operator",
  "Wallet",
  "Exchange / brokerage",
  "DEX / perps / trading",
  "Stablecoin / payments",
  "Chain / rollup",
  "Fintech",
  "Infrastructure / developer tools",
  "Media / analyst",
  "Independent researcher",
  "Other",
] as const;

export type TeamType = (typeof teamTypes)[number];

export type SubmissionInput = {
  kind: SubmissionKind;
  name: string;
  email: string;
  company: string;
  team: TeamType;
  message: string;
  consent: true;
  sourcePath: string;
  website: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
};

export type NewsletterInput = {
  email: string;
  name: string | null;
  consent: true;
  sourcePath: string;
  website: string;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; fields: Record<string, string> };

const controlCharacters = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function cleanRequiredText(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
  fields: Record<string, string>,
): string {
  if (typeof value !== "string") {
    fields[field] = "This field is required.";
    return "";
  }

  const normalized = value.trim().replace(/\r\n?/g, "\n");
  if (normalized.length < minimum) {
    fields[field] = `Use at least ${minimum} characters.`;
  } else if (normalized.length > maximum) {
    fields[field] = `Use no more than ${maximum} characters.`;
  } else if (controlCharacters.test(normalized)) {
    fields[field] = "Remove unsupported control characters.";
  }
  return normalized;
}

function cleanOptionalText(
  value: unknown,
  field: string,
  maximum: number,
  fields: Record<string, string>,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    fields[field] = "Use plain text.";
    return null;
  }
  const normalized = value.trim();
  if (normalized.length > maximum) {
    fields[field] = `Use no more than ${maximum} characters.`;
  } else if (controlCharacters.test(normalized)) {
    fields[field] = "Remove unsupported control characters.";
  }
  return normalized || null;
}

function cleanEmail(
  value: unknown,
  fields: Record<string, string>,
): string {
  if (typeof value !== "string") {
    fields.email = "Enter a work email.";
    return "";
  }
  const email = value.trim().toLowerCase();
  if (
    email.length > 254 ||
    !emailPattern.test(email) ||
    email.startsWith(".") ||
    email.endsWith(".")
  ) {
    fields.email = "Enter a valid email address.";
  }
  return email;
}

function cleanSourcePath(
  value: unknown,
  fields: Record<string, string>,
): string {
  if (typeof value !== "string" || value.length > 4096) {
    fields.sourcePath = "Use a valid source path.";
    return "/";
  }
  if (!value.startsWith("/") || value.startsWith("//")) {
    fields.sourcePath = "Use a same-site source path.";
    return "/";
  }
  try {
    const parsed = new URL(value, "https://nodezuno.com");
    if (
      parsed.origin !== "https://nodezuno.com" ||
      parsed.pathname.startsWith("/api/")
    ) {
      fields.sourcePath = "Use a same-site source path.";
      return "/";
    }
    if (parsed.pathname.length > 200) {
      fields.sourcePath = "Use a valid source path.";
      return "/";
    }
    return parsed.pathname;
  } catch {
    fields.sourcePath = "Use a valid source path.";
    return "/";
  }
}

function cleanAttribution(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, maximum);
  return normalized || null;
}

export function validateSubmissionPayload(
  payload: unknown,
): ValidationResult<SubmissionInput> {
  if (!isRecord(payload)) {
    return { ok: false, fields: { body: "Send a JSON object." } };
  }

  const allowed = [
    "kind",
    "name",
    "email",
    "company",
    "team",
    "message",
    "consent",
    "sourcePath",
    "website",
    "utmSource",
    "utmMedium",
    "utmCampaign",
  ] as const;
  if (!hasOnlyKeys(payload, allowed)) {
    return {
      ok: false,
      fields: { body: "Remove unsupported fields from the request." },
    };
  }

  const fields: Record<string, string> = {};
  const kind = submissionKinds.includes(payload.kind as SubmissionKind)
    ? (payload.kind as SubmissionKind)
    : null;
  if (!kind) fields.kind = "Choose a supported request type.";

  const name = cleanRequiredText(payload.name, "name", 2, 100, fields);
  const email = cleanEmail(payload.email, fields);
  const company = cleanRequiredText(
    payload.company,
    "company",
    2,
    160,
    fields,
  );
  const team = teamTypes.includes(payload.team as TeamType)
    ? (payload.team as TeamType)
    : null;
  if (!team) fields.team = "Choose a supported team type.";
  const message = cleanRequiredText(
    payload.message,
    "message",
    20,
    kind === "security_contact" ? 1500 : 5000,
    fields,
  );
  if (payload.consent !== true) {
    fields.consent = "Consent is required so Nodezuno can respond.";
  }
  const sourcePath = cleanSourcePath(payload.sourcePath, fields);
  const website =
    typeof payload.website === "string"
      ? payload.website.trim().slice(0, 200)
      : "";
  const utmSource = cleanAttribution(payload.utmSource, 100);
  const utmMedium = cleanAttribution(payload.utmMedium, 100);
  const utmCampaign = cleanAttribution(payload.utmCampaign, 100);

  if (Object.keys(fields).length > 0 || !kind || !team) {
    return { ok: false, fields };
  }

  return {
    ok: true,
    value: {
      kind,
      name,
      email,
      company,
      team,
      message,
      consent: true,
      sourcePath,
      website,
      utmSource,
      utmMedium,
      utmCampaign,
    },
  };
}

export function validateNewsletterPayload(
  payload: unknown,
): ValidationResult<NewsletterInput> {
  if (!isRecord(payload)) {
    return { ok: false, fields: { body: "Send a JSON object." } };
  }
  if (
    !hasOnlyKeys(payload, [
      "email",
      "name",
      "consent",
      "sourcePath",
      "website",
    ])
  ) {
    return {
      ok: false,
      fields: { body: "Remove unsupported fields from the request." },
    };
  }

  const fields: Record<string, string> = {};
  const email = cleanEmail(payload.email, fields);
  const name = cleanOptionalText(payload.name, "name", 100, fields);
  if (payload.consent !== true) {
    fields.consent = "Consent is required to save this subscription.";
  }
  const sourcePath = cleanSourcePath(payload.sourcePath, fields);
  const website =
    typeof payload.website === "string"
      ? payload.website.trim().slice(0, 200)
      : "";

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return {
    ok: true,
    value: {
      email,
      name,
      consent: true,
      sourcePath,
      website,
    },
  };
}

function decimalToScaledInteger(
  value: unknown,
  scale: number,
  maximumWholeDigits: number,
): bigint | null {
  const text =
    typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : "";
  const pattern =
    scale === 0
      ? new RegExp(`^\\d{1,${maximumWholeDigits}}$`)
      : new RegExp(
          `^\\d{1,${maximumWholeDigits}}(?:\\.\\d{1,${scale}})?$`,
        );
  if (!pattern.test(text)) {
    return null;
  }
  const [whole, fraction = ""] = text.split(".");
  return BigInt(`${whole}${fraction.padEnd(scale, "0")}`);
}

function formatUnits(
  value: bigint,
  scale: number,
  maximumFractionDigits = scale,
): string {
  const text = value.toString().padStart(scale + 1, "0");
  const whole = text.slice(0, -scale) || "0";
  const fraction = text
    .slice(-scale)
    .slice(0, maximumFractionDigits)
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export type GasEstimate = {
  gasUnits: string;
  gasPriceGwei: string;
  assetPriceUsd: string;
  wei: string;
  totalGwei: string;
  nativeAsset: string;
  fiatUsd: string;
  calculatedAt: string;
  disclaimer: string;
};

export function calculateGasEstimate(
  payload: unknown,
  now = new Date(),
): ValidationResult<GasEstimate> {
  if (!isRecord(payload)) {
    return { ok: false, fields: { body: "Send a JSON object." } };
  }
  if (!hasOnlyKeys(payload, ["gasUnits", "gwei", "assetPrice"])) {
    return {
      ok: false,
      fields: { body: "Remove unsupported fields from the request." },
    };
  }

  const fields: Record<string, string> = {};
  const gasUnits = decimalToScaledInteger(payload.gasUnits, 0, 9);
  const weiPerGas = decimalToScaledInteger(payload.gwei, 9, 7);
  const priceMicroUsd = decimalToScaledInteger(payload.assetPrice, 6, 9);
  if (gasUnits === null || gasUnits < 1n || gasUnits > 100_000_000n) {
    fields.gasUnits = "Use an integer from 1 to 100,000,000.";
  }
  if (weiPerGas === null || weiPerGas > 1_000_000n * 1_000_000_000n) {
    fields.gwei = "Use a gas price from 0 to 1,000,000 gwei.";
  }
  if (
    priceMicroUsd === null ||
    priceMicroUsd > 100_000_000n * 1_000_000n
  ) {
    fields.assetPrice = "Use an asset price from 0 to 100,000,000.";
  }
  if (
    Object.keys(fields).length > 0 ||
    gasUnits === null ||
    weiPerGas === null ||
    priceMicroUsd === null
  ) {
    return { ok: false, fields };
  }

  const wei = gasUnits * weiPerGas;
  const fiatMicroUsd =
    (wei * priceMicroUsd + 500_000_000_000_000_000n) /
    1_000_000_000_000_000_000n;

  return {
    ok: true,
    value: {
      gasUnits: gasUnits.toString(),
      gasPriceGwei: formatUnits(weiPerGas, 9, 9),
      assetPriceUsd: formatUnits(priceMicroUsd, 6, 6),
      wei: wei.toString(),
      totalGwei: formatUnits(wei, 9, 9),
      nativeAsset: formatUnits(wei, 18, 18),
      fiatUsd: formatUnits(fiatMicroUsd, 6, 6),
      calculatedAt: now.toISOString(),
      disclaimer:
        "Planning estimate only. Actual cost depends on chain state, fee mechanics, calldata, and execution.",
    },
  };
}
