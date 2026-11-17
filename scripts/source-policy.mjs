// Shared by release verification and source export. Example exceptions are narrow.
const safeTemplates = new Set([
  ".env.example",
  ".env.container.example",
  ".env.production.example",
  "deploy/aws/terraform/bootstrap/terraform.tfvars.example",
]);

const forbidden = [
  [/(^|\/)(?:node_modules|\.next|\.vinext|\.terraform|\.wrangler|\.runtime|dist|out|outputs|work|coverage|playwright-report|test-results)(\/|$)/, "generated or runtime state"],
  [/(^|\/)\.tmp-[^/]*(\/|$)/, "temporary state"],
  [/(^|\/)\.dev\.vars(?:\.|$)/, "runtime secrets"],
  [/(^|\/)\.env(?:\.|$)/, "environment configuration"],
  [/(^|\/)(?:backend\.hcl|config\.env|\.DS_Store)$/, "local configuration or OS metadata"],
  [/\.(?:tfstate(?:\..*)?|tfplan|tfvars(?:\..*)?)$/, "Terraform state, plans, or inputs"],
  [/\.(?:db|sqlite|sqlite3)(?:[-.]|$)/, "database state"],
  [/\.(?:pem|key|p12|pfx|keystore|jks)(?:\.|$)/i, "private key or credential material"],
  [/(^|\/)(?:id_rsa|id_ed25519|credentials)(?:\.|$)/, "credential material"],
  [/\.(?:log|zip|tar|tgz|gz|bak)(?:\.|$)/i, "logs, archives, or backups"],
];

export function forbiddenSourceReason(file) {
  if (safeTemplates.has(file)) return null;
  for (const [pattern, reason] of forbidden) {
    if (pattern.test(file)) return reason;
  }
  return null;
}
