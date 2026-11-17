import {
  HttpProblem,
  parseAdminAllowlist,
} from "./http.ts";
import { accountIdentityFromRequest } from "./account-identity.ts";
import { requireFreshApplicationAccountSession } from "./account-data-export.ts";
import { runtimeEnvironmentValue } from "./runtime-config.ts";

export async function isAdminEmail(email: string): Promise<boolean> {
  return parseAdminAllowlist(
    await runtimeEnvironmentValue("NODEZUNO_ADMIN_EMAILS"),
  ).has(
    email.trim().toLowerCase(),
  );
}

export async function requireAdminRequest(
  request: Request,
): Promise<{ email: string }> {
  const user = await accountIdentityFromRequest(request);
  if (!user) {
    throw new HttpProblem(
      401,
      "authentication_required",
      "Sign in to access this endpoint.",
    );
  }
  const email =
    user.contactEmail ??
    (user.authMethod === "chatgpt" ? user.email : null);
  const normalizedEmail = email?.trim().toLowerCase() ?? "";
  if (!normalizedEmail || !(await isAdminEmail(normalizedEmail))) {
    throw new HttpProblem(
      403,
      "admin_access_denied",
      "This identity is not authorized for Nodezuno administration.",
    );
  }
  return { email: normalizedEmail };
}

export async function requireFreshAdminRequest(
  request: Request,
): Promise<{ email: string }> {
  const admin = await requireAdminRequest(request);
  await requireFreshApplicationAccountSession(request);
  return admin;
}
