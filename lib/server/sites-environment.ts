import { env } from "cloudflare:workers";

type SiteEnvironment = Record<string, unknown> & {
  DB?: D1Database;
  DELIVERABLES?: R2Bucket;
};

export async function siteEnvironmentValue(
  name: string,
): Promise<string | undefined> {
  const value = (env as SiteEnvironment)[name];
  return typeof value === "string" ? value : undefined;
}

export async function siteDatabaseBinding(): Promise<
  D1Database | undefined
> {
  return (env as SiteEnvironment).DB;
}

export async function siteDeliverablesBucket(): Promise<R2Bucket | undefined> {
  return (env as SiteEnvironment).DELIVERABLES;
}
