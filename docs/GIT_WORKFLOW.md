# Git and GitHub workflow

Git is Nodezuno's source record. Cloudflare secrets, databases, buckets, DNS,
and local runtime state are not source files and must never be copied into a
commit.

## Repository setup

Before pushing, confirm that the checkout is connected to the intended private
GitHub repository:

```sh
git branch --show-current
git remote -v
```

If no remote is listed, stop and obtain the exact repository URL from the owner.
Do not guess an organization or repository name, change remotes, or force-push
to make a checkout appear connected.

## Keep machine state out of Git

The following are local or generated state, not release source:

- `.dev.vars` and populated `.env*` files
- `.wrangler/` state, local D1 databases, and Wrangler credentials
- `node_modules/`, build output, logs, and temporary files
- `**/.runtime/`, including local downloaded runtimes, databases, logs, and PID files
- Terraform state, plans, credentials, and populated variable files

Check that sensitive local paths are ignored and not tracked:

```sh
git check-ignore -v .dev.vars .wrangler node_modules ops/ethereum-light/.runtime
git ls-files -- .dev.vars .env.production .wrangler node_modules ops/ethereum-light/.runtime
```

The second command should print nothing. Never add a populated environment file,
database, secret, access token, private key, or customer export to GitHub.

## Review and stage deliberately

First inspect the working tree and diff:

```sh
git status --short
git diff --check
git diff --stat
git diff
```

Stage only files reviewed for the current change. Avoid `git add -A` when the
working tree contains unrelated or unknown files:

```sh
git add -- path/to/reviewed-file another/reviewed-file
git diff --cached --check
git diff --cached --name-only
git diff --cached
```

Stop if the staged list includes secrets, `.dev.vars`, a populated `.env` file,
database exports, `.wrangler/`, generated builds, dependencies, or local runtime
files. Unstage an accidental file with `git restore --staged -- path`; this
keeps its local contents unchanged.

## Commit and review

Use a short, specific commit message. Push a topic branch and open a pull
request; do not push directly to `main`. Require the repository's configured
CI and security checks before merge. Review the final diff and confirm the
target repository, branch, migration impact, and secret scan result before
merging.

Cloudflare resource deletion, database migrations, and production deployment
are separate operational changes. A code commit must not silently delete or
recreate DNS records, D1 data, R2 objects, or account secrets. Record the exact
target environment and rollback boundary before applying those changes.

## Current deployment boundary

The current CI workflow validates the application and deployment artifacts.
This checkout does not yet configure an automatic Cloudflare deployment from
GitHub. Until a reviewed deployment workflow is added, do not describe a push
to GitHub as a production deployment. Use the Cloudflare release runbook for
the current manual deployment path.
