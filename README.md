# deno-deploy

Provisions GitHub-linked Deno Deploy apps, syncs Deno environment variables, and maintains `dist/*` manifest artifacts for UbiquityOS plugins.

## Behavior

- One Deno Deploy app is managed per repository.
- `provision` creates a missing GitHub-linked Deno app, patches dashboard build/runtime config, syncs runtime and build env vars, generates `manifest.json` in GitHub Actions, and publishes it to `dist/<branch>`.
- `publish-manifest` handles `repository_dispatch` `deno_deploy.build.routed` events and only updates `homepage_url` in the already-published `dist/<branch>/manifest.json`.
- `delete` only removes the paired `dist/<branch>` branch. It never deletes the Deno app.
- Successful `provision` runs append a Deno settings link to the GitHub Actions job summary by running `deno deploy switch` and reading the generated `deno.jsonc`.

## Inputs

- `action`: `provision`, `publish-manifest`, or `delete`.
- `token`: Deno Deploy token used for app management, env sync, timeline lookups, and `deno deploy switch`.
- `organization`: Optional Deno Deploy organization slug. Required only when `provision` has to create a missing app.
- `app`: Optional Deno Deploy app slug override. Defaults to the sanitized repository name.
- `entrypoint`: App runtime entrypoint. Defaults to `src/deno.ts`.
- `syncEnv`: Whether to sync workflow runtime env vars during `provision`. Defaults to `true`.

## Outputs

- `app_slug`: Resolved Deno app slug.
- `revision_id`: Routed Deno revision id when `publish-manifest` runs.
- `homepage_url`: Published routed URL written into `dist/*/manifest.json` when available.

## Environment Sync

- Runtime env vars go to:
  - `production` on the repository default branch
  - `preview` on all other branches
- Build-only env vars are always synced so Deno-owned builds can regenerate manifests:
  - `PLUGIN_MANIFEST_REPOSITORY`
  - `PLUGIN_MANIFEST_PRODUCTION_BRANCH=main`
  - `PLUGIN_MANIFEST_SWITCH_TOKEN`
- `syncEnv: false` disables workflow runtime env upload only. The internal build metadata vars above are still managed.
- Reserved `DENO_*` names from the workflow environment are excluded automatically.

## Build Config

The action treats the Deno dashboard config as the source of truth. It applies:

- `install`: `deno install`
- `build`: `APP_SLUG="${DENO_DEPLOY_APPLICATION_SLUG:-${DENO_DEPLOY_APP_SLUG:-}}"; if [ -z "$APP_SLUG" ]; then echo "Missing Deno app slug in build environment. Expected DENO_DEPLOY_APPLICATION_SLUG or DENO_DEPLOY_APP_SLUG."; exit 1; fi; deno deploy switch --token "$PLUGIN_MANIFEST_SWITCH_TOKEN" --app "$APP_SLUG" && deno x -y @ubiquity-os/plugin-manifest-tool@latest`
- `predeploy`: `deno install`

Do not commit a `deploy` block in tracked `deno.json` or `deno.jsonc`. `provision` will fail fast if it finds one, because source config would override the action-managed dashboard config.

## Workspace Mutation

During `provision`, the action runs:

- `deno install`
- `deno x -y @ubiquity-os/plugin-manifest-tool@latest`
- `deno deploy switch --token <token> --app <slug>`

This can create or update `manifest.json`, `deno.jsonc`, `node_modules`, and related install artifacts in the checked-out workspace.

## Requirements

- Run `actions/checkout@v4` before `provision`.
- Grant `contents: write` so the action can create/update `dist/*` branches.
- Use a GitHub-linked Deno user token if `provision` needs to create the app from GitHub source.

## Example Workflow

```yaml
name: Deno Deploy

on:
  push:
    branches-ignore:
      - dist/**
  repository_dispatch:
    types:
      - deno_deploy.build.routed
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
        with:
          action: provision
          token: ${{ secrets.DENO_2_DEPLOY_TOKEN }}
          organization: ${{ vars.DENO_ORG_NAME }}
          app: ${{ vars.DENO_PROJECT_NAME }}
          entrypoint: src/worker.ts

  publish-manifest:
    if: github.event_name == 'repository_dispatch'
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: ubiquity-os/deno-deploy@main
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          action: publish-manifest
          token: ${{ secrets.DENO_2_DEPLOY_TOKEN }}

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

## Local Debugging

```bash
deno run \
  --allow-env \
  --allow-read=.,../command-start-stop,./local.env \
  --allow-write=.,./summary.md \
  --allow-run=git,deno \
  --allow-net=api.deno.com,api.github.com \
  ./scripts/provision.js \
  --repo-root ../command-start-stop \
  --token "$DENO_API_TOKEN" \
  --organization ubiquity-os \
  --github-owner ubiquity-os-marketplace \
  --github-repo command-start-stop \
  --ref-name test-branch \
  --default-branch development \
  --entrypoint src/worker.ts \
  --env-file ./local.env \
  --dry-run
```

For cross-repo local testing before publishing `@ubiquity-os/plugin-manifest-tool`, you can point `provision` at a local checkout by setting `PLUGIN_MANIFEST_TOOL_PATH=/abs/path/to/plugin-manifest-tool/bin/plugin-manifest-tool.js` and adding `node` to `--allow-run`.
