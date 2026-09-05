# Fixing the GitHub Actions deploy (Workload Identity Federation)

Handoff notes. Everything needed is here; no prior conversation required.

## The problem

`.github/workflows/deploy.yml` authenticates to Google Cloud via Workload
Identity Federation and then runs `firebase deploy`. Every run on `main` fails
at the authentication step with:

```
google-github-actions/auth failed with: failed to generate Google Cloud
federated token for //iam.googleapis.com/projects/989373044067/locations/global/
workloadIdentityPools/github-pool/providers/github-provider:
{"error":"unauthorized_client","error_description":"The given credential is
rejected by the attribute condition."}
```

Two things are wrong, and the second is the immediate cause:

1. **The pool is in the wrong project.** `989373044067` is the project number of
   `downe-companion`. This repo deploys to `dow-new-eden-console`, which is
   project number `299811605673`. The WIF configuration was copied from the
   other repo.

2. **The attribute condition rejects this repo.** A WIF provider carries a CEL
   guard naming which GitHub repositories may mint credentials — without it any
   repo on GitHub could authenticate as this service account. The existing
   condition does not name `emerald-pham/den-of-wolves-new-eden-console`, so the
   token is refused. The error is the guard working correctly, not a fault.

## Decision already made

Create a **dedicated pool in `dow-new-eden-console`** rather than widening the
`downe-companion` one. Two projects then cannot break each other's deploys, and
no cross-project IAM is needed. If you prefer to reuse the central pool instead,
skip section 2 below and only add an attribute condition and a
`workloadIdentityUser` binding for this repo on the existing service account —
but the service account will then also need the section 3 roles on
`dow-new-eden-console`.

## 0. Inventory before you build anything

`dow-new-eden-console` may already have its own pool and service account — the
Firebase project itself certainly exists and was deployed to successfully by
hand. What is *certain* from the error is only that the
`GCP_WORKLOAD_IDENTITY_PROVIDER` variable in GitHub points into
`downe-companion` (`989373044067`). That is consistent with two different
situations, and they need different fixes:

- **A pool already exists here** → skip to section 6 and simply re-point the
  variable at it, then check its attribute condition names this repo
  (section 4's condition, applied with `providers update-oidc`).
- **No pool exists here** → run sections 2 through 6 in full.

Find out which, before creating anything:

```bash
gcloud iam workload-identity-pools list \
  --project=dow-new-eden-console --location=global

gcloud iam workload-identity-pools providers list \
  --project=dow-new-eden-console --location=global \
  --workload-identity-pool=github-pool

gcloud iam service-accounts list --project=dow-new-eden-console
```

If a provider is found, print its condition and check it names this repo:

```bash
gcloud iam workload-identity-pools providers describe github-provider \
  --project=dow-new-eden-console --location=global \
  --workload-identity-pool=github-pool \
  --format='value(name,attributeCondition)'
```

Creating something that already exists is harmless — the commands below fail
with `ALREADY_EXISTS` rather than clobbering anything — but re-pointing a
variable is a great deal less work than building a second pool.

## Facts you will need

| Thing | Value |
|---|---|
| GitHub repo | `emerald-pham/den-of-wolves-new-eden-console` (private) |
| Target project id | `dow-new-eden-console` |
| Target project number | `299811605673` |
| Region already in use | `us-central1` |

## 1. Prerequisites

`gcloud` is **not installed** on this machine. Install and authenticate as the
project owner (`emhaste@gmail.com`):

```bash
brew install --cask google-cloud-sdk
gcloud auth login
```

Then set the shell variables every later command uses:

```bash
export PROJECT_ID=dow-new-eden-console
export PROJECT_NUMBER=299811605673
export REPO=emerald-pham/den-of-wolves-new-eden-console
export SA_NAME=github-deployer
export SA_EMAIL=${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com
```

Enable the APIs that federation and deployment need:

```bash
gcloud services enable \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  cloudresourcemanager.googleapis.com \
  --project="$PROJECT_ID"
```

## 2. Create the deploy service account

```bash
gcloud iam service-accounts create "$SA_NAME" \
  --project="$PROJECT_ID" \
  --display-name="GitHub Actions deployer"
```

## 3. Grant it the roles the deploy actually uses

The workflow deploys hosting, Firestore rules and indexes, and 2nd-gen
functions. That last one pulls in Cloud Run, Cloud Build and Artifact Registry.

```bash
for ROLE in \
  roles/firebase.admin \
  roles/firebasehosting.admin \
  roles/firebaserules.admin \
  roles/datastore.owner \
  roles/cloudfunctions.admin \
  roles/run.admin \
  roles/artifactregistry.admin \
  roles/cloudbuild.builds.editor \
  roles/serviceusage.serviceUsageConsumer \
  roles/iam.serviceAccountUser
do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$ROLE" \
    --condition=None \
    --quiet
done
```

## 4. Create the pool and the GitHub OIDC provider

```bash
gcloud iam workload-identity-pools create github-pool \
  --project="$PROJECT_ID" \
  --location=global \
  --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc github-provider \
  --project="$PROJECT_ID" \
  --location=global \
  --workload-identity-pool=github-pool \
  --display-name="GitHub OIDC" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository=='${REPO}'"
```

The attribute condition is the security boundary — it must name this repo
exactly. Google rejects a provider that maps `assertion.repository` with no
condition, for exactly the reason above.

## 5. Let this repo impersonate the service account

```bash
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project="$PROJECT_ID" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/attribute.repository/${REPO}"
```

## 6. Set the three GitHub repository variables

The workflow reads `vars.*`, so these are **variables**, not secrets.

> The PAT currently on this machine returns HTTP 403 for Actions endpoints, so
> `gh variable set` will fail until a token with repo admin rights is used, or
> until they are set by hand at
> Settings → Secrets and variables → Actions → Variables.

```bash
gh variable set FIREBASE_PROJECT_ID \
  --repo "$REPO" --body "dow-new-eden-console"

gh variable set GCP_SERVICE_ACCOUNT \
  --repo "$REPO" --body "$SA_EMAIL"

gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER \
  --repo "$REPO" \
  --body "projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/providers/github-provider"
```

Confirm the provider resource name matches what was actually created:

```bash
gcloud iam workload-identity-pools providers describe github-provider \
  --project="$PROJECT_ID" --location=global \
  --workload-identity-pool=github-pool --format='value(name)'
```

## 7. Verify

```bash
gh workflow run Deploy --repo "$REPO"
gh run watch --repo "$REPO"
```

Green means the federation works. The deploy step itself is already known-good —
hosting, Firestore rules and all four callables were deployed by hand from a
local login on 2026-09-04, so any failure after the auth step is a permissions
gap in section 3, not a federation problem.

## Notes

- Do **not** fix this by putting a service-account JSON key in a GitHub secret.
  The repo moved to federation deliberately (commit `f328191`), and `CLAUDE.md`
  forbids committing or storing a key. Federation issues short-lived
  credentials and stores nothing.
- `CLAUDE.md` still mentions a `FIREBASE_SERVICE_ACCOUNT` secret. That line is
  stale, predating the move to federation, and should be corrected.
