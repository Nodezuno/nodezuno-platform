# Nodezuno security policy

## Report a vulnerability

Email `security@nodezuno.com` with a short, non-sensitive summary. Do not send
private keys, credentials, personal data, customer data, or complete exploit
material in the first message. Nodezuno will provide a restricted channel for
evidence when one is available.

Include:

- the affected hostname, route, component, or source path;
- the security impact and required attacker access;
- a minimal reproduction that does not affect other users;
- whether the issue is currently being exploited; and
- a safe way to contact you.

Do not test denial of service, social engineering, physical access, third-party
providers, or any system you do not own or have explicit permission to test.
Stop testing if you encounter customer data or credentials.

The canonical reporting metadata is published at
`https://nodezuno.com/.well-known/security.txt`.

## Supported releases

Only the current production deployment and the current default branch receive
security fixes. Product pages marked planned, preview, or configuration-only
do not represent a deployed product surface.

## Response expectations

Nodezuno aims to acknowledge a complete report promptly, assess impact, and
coordinate remediation and disclosure. This repository does not promise a
fixed response time, reward, safe-harbor agreement, or bounty amount. Any
future program terms will be published before they apply.
