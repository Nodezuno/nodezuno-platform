import { reviewPolicy } from "../../review-policy.ts";
import { isFixedPriceReviewTarget } from "../../review-targets.ts";

// Pure review-domain input validation. No database, identity, payment, or delivery side effects.
export type ReviewOrderInput = {
  contactName: string;
  workEmail: string;
  company: string;
  website: string | null;
  teamType: string;
  targetChain: string;
  auditedBaseline: string;
  proposedRelease: string;
  changeSummary: string;
  affectedContracts: number;
  changedLines: number;
  artifactReadyDate: string | null;
  targetReleaseDate: string | null;
  publicLinks: string | null;
  consent: true;
  sourcePath: string;
};

export function validateReviewOrderPayload(payload: unknown):
  | { ok: true; value: ReviewOrderInput }
  | { ok: false; fields: Record<string, string> } {
  if (!isRecord(payload)) {
    return { ok: false, fields: { body: "Send a JSON object." } };
  }
  const allowed = new Set([
    "contactName", "workEmail", "company", "website", "teamType",
    "targetChain", "auditedBaseline", "proposedRelease", "changeSummary",
    "affectedContracts", "changedLines", "artifactReadyDate",
    "targetReleaseDate", "publicLinks", "consent", "sourcePath",
  ]);
  if (Object.keys(payload).some((key) => !allowed.has(key))) {
    return { ok: false, fields: { body: "Remove unsupported fields." } };
  }
  const fields: Record<string, string> = {};
  const contactName = requiredText(payload.contactName, "contactName", 2, 100, fields);
  const workEmail = emailValue(payload.workEmail, fields);
  const company = requiredText(payload.company, "company", 2, 160, fields);
  const website = optionalUrl(payload.website, "website", fields);
  const teamType = requiredText(payload.teamType, "teamType", 2, 80, fields);
  const targetChain = requiredText(payload.targetChain, "targetChain", 2, 80, fields);
  if (targetChain && !isFixedPriceReviewTarget(targetChain)) {
    fields.targetChain = "Choose a supported blockchain network category.";
  }
  const auditedBaseline = requiredText(payload.auditedBaseline, "auditedBaseline", 3, 500, fields);
  const proposedRelease = requiredText(payload.proposedRelease, "proposedRelease", 3, 500, fields);
  const changeSummary = requiredText(payload.changeSummary, "changeSummary", 30, 5000, fields);
  const affectedContracts = boundedInteger(payload.affectedContracts, "affectedContracts", reviewPolicy.affectedComponents.min, reviewPolicy.affectedComponents.max, fields);
  const changedLines = boundedInteger(payload.changedLines, "changedLines", reviewPolicy.materiallyChangedLines.min, reviewPolicy.materiallyChangedLines.max, fields);
  const artifactReadyDate = optionalDate(payload.artifactReadyDate, "artifactReadyDate", fields);
  const targetReleaseDate = optionalDate(payload.targetReleaseDate, "targetReleaseDate", fields);
  const publicLinks = optionalText(payload.publicLinks, "publicLinks", 2000, fields);
  const sourcePath = sourcePathValue(payload.sourcePath, fields);
  if (payload.consent !== true) fields.consent = "Consent is required.";
  if (Object.keys(fields).length) return { ok: false, fields };
  return {
    ok: true,
    value: {
      contactName, workEmail, company, website, teamType, targetChain,
      auditedBaseline, proposedRelease, changeSummary, affectedContracts,
      changedLines, artifactReadyDate, targetReleaseDate, publicLinks,
      consent: true, sourcePath,
    },
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function requiredText(value: unknown, field: string, min: number, max: number, fields: Record<string, string>): string {
  const text = typeof value === "string" ? value.trim().replace(/\r\n?/g, "\n") : "";
  if (text.length < min || text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) fields[field] = `Use ${min} to ${max} plain-text characters.`;
  return text;
}
function optionalText(value: unknown, field: string, max: number, fields: Record<string, string>): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value)) { fields[field] = `Use no more than ${max} plain-text characters.`; return null; }
  return value.trim() || null;
}
function emailValue(value: unknown, fields: Record<string, string>): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fields.workEmail = "Enter a valid work email.";
  return email;
}
function optionalUrl(value: unknown, field: string, fields: Record<string, string>): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 500) { fields[field] = "Enter a public HTTPS URL."; return null; }
  try { const url = new URL(value); if (url.protocol !== "https:" || url.username || url.password) throw new Error(); return url.toString(); } catch { fields[field] = "Enter a public HTTPS URL."; return null; }
}
function boundedInteger(value: unknown, field: string, min: number, max: number, fields: Record<string, string>): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) { fields[field] = `Use a whole number from ${min} to ${max}.`; return min; }
  return value as number;
}
function optionalDate(value: unknown, field: string, fields: Record<string, string>): string | null {
  if (value === null || value === undefined || value === "") return null;
  const match = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) { fields[field] = "Use a valid calendar date."; return null; }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) { fields[field] = "Use a valid calendar date."; return null; }
  return match[0];
}
function sourcePathValue(value: unknown, fields: Record<string, string>): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.length > 200) { fields.sourcePath = "Use a valid same-site source path."; return "/review/start"; }
  return value.split("?", 1)[0];
}
