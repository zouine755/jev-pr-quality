# PR Quality Event Demo

This fork demonstrates GitHub Actions authenticating to RawTree with **Workload Identity Federation (WIF)**. It creates a clearly labeled sample PR quality event and writes it to RawTree. It does not run an AI code review.

## How it works

1. A pull request is opened or updated in this repository.
2. GitHub Actions creates a deterministic sample quality event using PR metadata.
3. The workflow requests a GitHub OIDC identity token.
4. RawTree exchanges that identity for a short-lived access token.
5. The workflow inserts the sample event into the configured RawTree table.

No permanent RawTree API key is stored in GitHub. The OIDC assertion and short-lived RawTree token are used only inside the running job and are never printed.

## 1. Configure RawTree

In the RawTree cluster where you want to store events:

1. Make sure the cluster is running.
2. Reuse or create a GitHub OIDC issuer with issuer URL `https://token.actions.githubusercontent.com`.
3. Create a new federation rule specifically for this repository.
4. Set its audience to `rawtree`.
5. Select the RawTree principal that should own the writes.
6. Grant read/write access to the database you will use, for example `analytics`.
7. Set the subject condition to this exact value:

```text
repo:zouine755@309949477/jev-pr-quality@1453848976:environment:workload-federation-demo
```

Copy the new federation rule ID. Do not reuse a rule belonging to another repository.

## 2. Configure GitHub

In **Settings → Environments**, create an environment named `workload-federation-demo`.

Add these environment variables:

| Variable | Value |
| --- | --- |
| `RAWTREE_FEDERATION_RULE_ID` | The ID of the new RawTree federation rule |
| `RAWTREE_AUDIENCE` | `rawtree` |
| `RAWTREE_JEV_DATABASE` | Your RawTree database, for example `analytics` |
| `RAWTREE_JEV_TABLE` | `jev_pr_reviews` |
| `RAWTREE_JEV_BASE_URL` | `https://api.rawtree.com` |

No GitHub secrets are required for this sample-event workflow. You do not need `JEV_API_KEY` or a permanent RawTree API key.

## 3. Run the demo

Open or update a pull request in this repository. The **PR Event Demo with RawTree WIF** workflow will write one sample event to `jev_pr_reviews`.

The sample uses fixed illustrative scores and sets `data_source` to `demo_fixture`. These are demonstration values, not an actual AI assessment of the pull request.

RawTree creates the table automatically on its first insert. The cluster and target database must already exist and be available.

## Dashboard

The example dashboard is available at [jev-pr-quality.rawtree.tech](https://jev-pr-quality.rawtree.tech). Dashboard access is separate from the GitHub Actions write workflow.
