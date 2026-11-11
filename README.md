# Jev PR Quality

[![CI](https://github.com/rawtreedb/jev-pr-quality/actions/workflows/ci.yml/badge.svg)](https://github.com/rawtreedb/jev-pr-quality/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

**Add Jev-assisted pull request reviews and a live quality dashboard.**

This fork changes the GitHub Actions integration so review events are written to RawTree using **Workload Identity Federation (WIF)** instead of a permanent RawTree API key.

## How it works

```text
Pull request
    |
    v
Jev review ---> PR comment + quality check
    |
    v
GitHub Actions requests a GitHub OIDC identity token
    |
    v
RawTree exchanges it for a short-lived access token
    |
    v
Jev review event ---> RawTree database ---> Live dashboard
```

GitHub Actions does not store a permanent RawTree API key. The OIDC assertion and short-lived RawTree access token are kept in the running job and are never printed to the workflow log.

## Setup

### 1. Configure RawTree

In the RawTree cluster where you want to store review events:

1. Make sure the cluster is running.
2. Reuse or create a GitHub OIDC issuer with this issuer URL:
   `https://token.actions.githubusercontent.com`
3. Create a federation rule for this repository.
4. Set the rule's audience to `rawtree`.
5. Select the RawTree principal that should own the writes.
6. Grant read/write access to the database you will use (the workflow variable below defaults to `analytics`).
7. Use this exact subject condition for the GitHub Environment configured in the workflow:

```text
repo:zouine755@309949477/jev-pr-quality@1453848976:environment:workload-federation-demo
```

The federation rule ID is shown in RawTree after the rule is created. Put that ID in the GitHub Environment variable in the next step. Do not use the federation rule ID from a different repository.

### 2. Configure GitHub

In this repository, open **Settings → Environments** and create an environment named:

```text
workload-federation-demo
```

Add these variables to that environment:

| Variable | Value |
| --- | --- |
| `RAWTREE_FEDERATION_RULE_ID` | The ID of the new RawTree federation rule |
| `RAWTREE_AUDIENCE` | `rawtree` |
| `RAWTREE_JEV_DATABASE` | The RawTree database name, for example `analytics` |
| `RAWTREE_JEV_TABLE` | `jev_pr_reviews` |
| `RAWTREE_JEV_BASE_URL` | `https://api.rawtree.com` |

Add one GitHub Actions secret:

| Secret | Purpose |
| --- | --- |
| `JEV_API_KEY` | Jev evaluation key from the TypeSafe console |

There is no `RAWTREE_JEV_API_KEY` secret in this WIF setup.

### 3. Run a review

Open a pull request in this repository. The **Jev Review with RawTree WIF** workflow will:

1. Evaluate the pull request with Jev.
2. Publish the review comment and quality check.
3. Request a GitHub OIDC token.
4. Exchange it with RawTree for a short-lived access token.
5. Append the structured review event to `jev_pr_reviews`.

RawTree creates the table automatically on its first insert. The cluster and target database must already exist and be available.

## Configuration

| Setting | Default |
| --- | --- |
| Minimum score | `7` |
| RawTree API | `https://api.rawtree.com` |
| Table | `jev_pr_reviews` |
| Audience | `rawtree` |
| Database | Set with `RAWTREE_JEV_DATABASE` |

The action can still run Jev reviews without RawTree logging if no federation rule ID is configured. To enable RawTree logging, set `RAWTREE_FEDERATION_RULE_ID` and grant the workflow `id-token: write` permission.

## Dashboard

The dashboard is available at [jev-pr-quality.rawtree.tech](https://jev-pr-quality.rawtree.tech). It can connect through Vercel Connect or a RawTree read-only API key. The GitHub Actions workflow does not need a dashboard credential.

The frontend contains no shared write credential. Data access is controlled by the RawTree access method selected by each viewer.

## What Jev receives

The action sends the PR title and body, the complete three-dot Git diff with 20 lines of context, and root `AGENTS.md` when present. It does not execute PR code or upload the full repository. Changed binary files and generated dependency lockfiles are listed as not assessed in the PR comment and report.

Jev is an advisory review signal that complements tests and human review. Scores are model judgments, not proof of correctness.

## Development

Requirements: Node.js 24 and npm.

```sh
npm ci
npm run lint
npm run build
npm test
npm ci --ignore-scripts --prefix scripts/jev-review
npm test --prefix scripts/jev-review
```

## Attribution and licenses

Rubric data and question wording are adapted from [NiazMorshed2007/jev-review](https://github.com/NiazMorshed2007/jev-review), commit `57690af54ef7d862c2483342c1e61c14dffcf727`, under MIT. Its notice is retained in [`scripts/jev-review/LICENSE`](scripts/jev-review/LICENSE). The rest of this repository is licensed under Apache-2.0.
