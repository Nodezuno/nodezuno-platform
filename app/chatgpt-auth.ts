import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
} from "@/lib/auth-paths";
import { verifiedUserFromHeaders } from "@/lib/server/identity";
import {
  isContainerRuntime,
  normalizeAccessTeamDomain,
} from "@/lib/server/runtime-config";

export { chatGPTSignInPath, chatGPTSignOutPath } from "@/lib/auth-paths";

export type ChatGPTUser = {
  displayName: string;
  email: string;
  fullName: string | null;
};

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  return verifiedUserFromHeaders(requestHeaders);
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(
    isContainerRuntime()
      ? `/identity-required?return_to=${encodeURIComponent(returnTo)}`
      : chatGPTSignInPath(returnTo),
  );
}

export function identitySignOutPath(returnTo = "/"): string {
  if (!isContainerRuntime()) return chatGPTSignOutPath(returnTo);
  const teamDomain = normalizeAccessTeamDomain(
    process.env.CF_ACCESS_TEAM_DOMAIN,
  );
  return teamDomain ? `${teamDomain}/cdn-cgi/access/logout` : "/";
}
