# deno-deploy

Provisions Deno Deploy apps, syncs Deno environment variables, and maintains `dist/*` manifest artifacts for UbiquityOS plugins.

## Behavior

- One local-source Deno Deploy app is managed per Git branch.
- `main` uses the unsuffixed base app slug. Every other branch uses `<base-app>-<branch-suffix>`, capped at 32 total characters.
- Long branch names are truncated to fit the 32-character cap. No hash or other disambiguator is appended, so collisions are accepted by design.
- `provision` creates a missing branch app through the Deno API when needed, always syncs runtime and build env vars to Deno `production`, deploys the branch app from the current workspace with `--prod`, generates `manifest.json` in GitHub Actions, and publishes it to `dist/<branch>`.
- After a successful deploy, `provision` updates `dist/<branch>/manifest.json` inline with the stable branch app URL `https://<app-slug>.<org-slug>.deno.net`.
- `delete` removes both the paired Deno branch app and the paired `dist/<branch>` branch.

## Inputs

- `action`: `provision` or `delete`.
- `token`: Deno Deploy token used for app management, env sync, deploys, and deletion.
- `organization`: Optional Deno Deploy organization slug. When omitted, `provision` first infers it from the token and then falls back to `DENO_ORG_NAME` when available.
- `app`: Optional base Deno Deploy app slug override. Defaults to the sanitized repository name. `main` uses this value directly; all other branches append a truncated branch suffix within the 32-character total slug cap.
- `entrypoint`: App runtime entrypoint. Defaults to `src/deno.ts`.

## Outputs

- `app_slug`: Resolved Deno app slug.
- `homepage_url`: Published stable branch app URL written into `dist/*/manifest.json` when available.

## Environment Sync

- Runtime env vars always go to Deno `production` in this branch-per-app model.
- Runtime env vars are always synced during `provision`.
- GitHub environment selection still happens in the consumer workflow:
  - `main` and `demo` should use the GitHub `main` environment
  - all other branches should use the GitHub `development` environment
- Managed manifest identity env vars are always synced:
  - `REF_NAME` to both runtime `production` and build
- Build-only env vars are always synced:
  - `PLUGIN_MANIFEST_REPOSITORY`
  - `PLUGIN_MANIFEST_PRODUCTION_BRANCH=main`
- Reserved `DENO_*` names from the workflow environment are excluded automatically.

## Build Config

The action treats the Deno dashboard config as the source of truth. It applies:

- `install`: `deno install`
- `build`: `deno x -y @ubiquity-os/plugin-manifest-tool@latest --repository <owner>/<repo> --production-branch main`
- `predeploy`: `deno install`

Repository identity for Deno builds comes from the persisted Build-context variable `PLUGIN_MANIFEST_REPOSITORY`.

Do not commit a `deploy` block in tracked `deno.json` or `deno.jsonc`. `provision` will fail fast if it finds one, because source config would override the action-managed dashboard config.

## Workspace Mutation

During `provision`, the action runs:

- `POST /v2/apps` when the app does not exist yet, using the managed config and synced env vars as app defaults
- `PATCH /v2/apps/{slug}` for existing apps before deploy
- `deno deploy . --config .deno-branch-app.jsonc --prod` as the single production deployment step for both newly created and existing branch apps
- `deno install`
- `deno x -y @ubiquity-os/plugin-manifest-tool@latest`
This can create or update `manifest.json`, `.deno-branch-app.jsonc`, `node_modules`, and related install artifacts in the checked-out workspace. Before each direct deploy, the action removes `node_modules` so Deno uploads only the workspace source, then deletes `.deno-branch-app.jsonc` after the deploy attempt.

On first provision, this metadata-first create path avoids the extra bootstrap build that `deno deploy create --source local` would otherwise start before the explicit `--prod` deploy.

## Requirements

- Run `actions/checkout@v6` before `provision`.
- Grant `contents: write` so the action can create/update `dist/*` branches.
- Use a Deno Deploy token with access to the target organization.
- Optionally wire `DENO_ORG_NAME` from `${{ vars.DENO_ORG_NAME }}` if you want a deterministic fallback when token-based organization inference is unavailable.
- Configure consumer workflows so `main` and `demo` use the GitHub `main` environment, while all other branches use the GitHub `development` environment.

## Example Workflow

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
    environment: ${{ (github.ref == 'refs/heads/main' || github.ref == 'refs/heads/demo') && 'main' || 'development' }}
    steps:
      - uses: actions/checkout@v6

      - uses: ubiquity-os/deno-deploy@main
        env:
          DENO_ORG_NAME: ${{ vars.DENO_ORG_NAME }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          action: provision
          token: ${{ secrets.DENO_DEPLOY_TOKEN }}
          app: ${{ vars.DENO_PROJECT_NAME }}
          entrypoint: src/worker.ts

  delete-branch-app:
    if: github.event_name == 'delete'
    runs-on: ubuntu-latest
    permissions:
      contents: write
    environment: ${{ (github.event.ref == 'main' || github.event.ref == 'demo') && 'main' || 'development' }}
    steps:
      - uses: ubiquity-os/deno-deploy@main
        env:
          DENO_ORG_NAME: ${{ vars.DENO_ORG_NAME }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          action: delete
          token: ${{ secrets.DENO_DEPLOY_TOKEN }}
          app: ${{ vars.DENO_PROJECT_NAME }}
```

## Local Debugging

```bash
deno run \
  --allow-env \
  --allow-read=.,../command-start-stop,./local.env \
  --allow-write=.,./summary.md \
  --allow-run=git,deno \
  --allow-net=api.deno.com,api.github.com,console.deno.com \
  ./scripts/provision.js \
  --repo-root ../command-start-stop \
  --token "$DENO_DEPLOY_TOKEN" \
  --github-owner ubiquity-os-marketplace \
  --github-repo command-start-stop \
  --ref-name demo \
  --default-branch development \
  --app command-start-stop-demo \
  --entrypoint src/worker.ts \
  --env-file ./local.env \
  --dry-run
```

If token-based organization inference is unavailable locally, set `DENO_ORG_NAME=ubiquity-os` instead of passing `--organization`.

For cross-repo local testing before publishing `@ubiquity-os/plugin-manifest-tool`, you can point `provision` at a local checkout by setting `PLUGIN_MANIFEST_TOOL_PATH=/abs/path/to/plugin-manifest-tool/bin/plugin-manifest-tool.js` and adding `node` to `--allow-run`.
