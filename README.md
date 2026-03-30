# deno-deploy

Provisions a Deno Deploy app through API v2, deploys git-tracked repository assets, syncs environment variables, and keeps `manifest.json` published on `dist/*` branches.

## Behavior

- One Deno Deploy app is managed per repository.
- App management, env sync, deploys, revision polling, and timeline lookups use the public Deno API v2.
- `provision` creates or updates the app, deploys the current checkout, waits for the revision, and publishes the routed revision URL to `manifest.json.homepage_url` on `dist/<branch>` inline.
- Successful `provision` runs append a job-summary reminder that links to the Deno app settings page for GitHub linking.
- `delete` only removes the paired `dist/*` branch. It never deletes the Deno app.
- API-driven preview deploys currently expose routed revision URLs rather than GitHub `git-branch/*` timelines, so preview `homepage_url` values are revision-scoped.

## Inputs

- `action`: `provision` or `delete`.
- `token`: Deno API v2 Bearer token (`ddo_...`) used for app management and deploys.
- `app`: Optional Deno Deploy app slug override. Defaults to the sanitized repository name.
- `entrypoint`: Entrypoint used for the app runtime configuration. Defaults to `src/deno.ts`.
- `syncEnv`: Whether to sync workflow environment variables during `provision`. Defaults to `true`.

## Outputs

- `app_slug`: Resolved Deno Deploy app slug.
- `revision_id`: Created revision id.
- `homepage_url`: Routed URL written to `manifest.json` when the revision exposes a routed timeline.

## Environment sync

- The repository default branch syncs variables to the `production` context.
- All other branches sync variables to the shared `preview` context.
- Non-default branches share one preview context, so later runs can replace preview-scoped values from earlier runs.
- Reserved `DENO_*` names are excluded automatically before env sync.

## Summary Link

- After a successful `provision`, the action runs `deno deploy switch --app <resolved-app>` in the checked-out workspace and appends a settings URL to the GitHub Actions job summary.
- This can create or update `deno.jsonc` in the workspace. The action does not restore that file afterward.
- If summary generation fails, provisioning still succeeds and the reminder is skipped.

## Requirements

- Run `actions/checkout` before `provision`; the action deploys git-tracked files from the current workspace.
- Grant `contents: write` so the action can create or update `dist/*` branches.
- Provide a Deno API v2 token scoped to the target Deno organization.

## Example workflow

```yaml
name: Deno Deploy

on:
  push:
    branches-ignore:
      - dist/**
  delete:

jobs:
  provision:
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4

      - uses: ubiquity-os/deno-deploy@main
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          KERNEL_PUBLIC_KEY: ${{ secrets.KERNEL_PUBLIC_KEY }}
        with:
          action: provision
          token: ${{ secrets.DENO_2_DEPLOY_TOKEN }}
          app: ${{ vars.DENO_PROJECT_NAME }}
          entrypoint: src/worker.ts

  delete-dist-branch:
    if: github.event_name == 'delete'
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: ubiquity-os/deno-deploy@main
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          action: delete
```

## Local debugging

```bash
deno run \
  --allow-env \
  --allow-read=.,../command-start-stop,./local.env \
  --allow-run=git \
  --allow-net=api.deno.com,api.github.com \
  ./scripts/provision.js \
  --repo-root ../command-start-stop \
  --token "$DENO_API_TOKEN" \
  --github-owner ubiquity-os-marketplace \
  --github-repo command-start-stop \
  --ref-name test-branch \
  --default-branch development \
  --entrypoint src/worker.ts \
  --env-file ./local.env \
  --dry-run
```
