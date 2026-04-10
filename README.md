# deno-deploy

Provisions Deno Deploy apps, syncs Deno environment variables, and optionally maintains `dist/*` manifest artifacts for UbiquityOS plugins.

## Behavior

- One local-source Deno Deploy app is managed per Git branch.
- `main` uses the unsuffixed base app slug. Every other branch uses `<base-app>-<branch-suffix>`, capped at 32 total characters.
- Long branch names are truncated to fit the 32-character cap. No hash or other disambiguator is appended, so collisions are accepted by design.
- `provision` creates a missing branch app through the Deno API when needed, always syncs runtime env vars to Deno `production`, deploys the branch app from the current workspace with `--prod`, and always outputs the stable branch app URL `https://<app-slug>.<org-slug>.deno.net`.
- When `buildManifest=true`, `provision` also syncs manifest build env vars, generates `manifest.json` in GitHub Actions, updates its `homepage_url`, and publishes it to `dist/<branch>`.
- When `buildManifest=false`, manifest generation, manifest homepage updates, and `dist/<branch>` manifest publication are skipped.
- `delete` removes both the paired Deno branch app and the paired `dist/<branch>` branch.

## Inputs

- `action`: `provision` or `delete`.
- `token`: Deno Deploy token used for app management, env sync, deploys, and deletion.
- `organization`: Optional Deno Deploy organization slug. When omitted, `provision` first infers it from the token and then falls back to `DENO_ORG_NAME` when available.
- `app`: Optional base Deno Deploy app slug override. Defaults to the sanitized repository name. `main` uses this value directly; all other branches append a truncated branch suffix within the 32-character total slug cap.
- `entrypoint`: App runtime entrypoint. Defaults to `src/deno.ts`.
- `buildManifest`: Whether plugin manifest generation, `homepage_url` writes, and `dist/*` manifest publication should run. Defaults to `true`. Set this to `false` for non-plugin Deno apps such as `ubiquity-os-kernel`.

## Outputs

- `app_slug`: Resolved Deno app slug.
- `homepage_url`: Resolved stable branch app URL. Written into `dist/*/manifest.json` only when `buildManifest=true`.

## Environment Sync

- Runtime env vars always go to Deno `production` in this branch-per-app model.
- Runtime env vars are always synced during `provision`.
- GitHub environment selection still happens in the consumer workflow:
  - `main` and `demo` should use the GitHub `main` environment
  - all other branches should use the GitHub `development` environment
- Managed branch identity env vars are always synced:
  - `REF_NAME` to both runtime `production` and build
- Manifest-specific build env vars are synced only when `buildManifest=true`:
  - `PLUGIN_MANIFEST_REPOSITORY`
  - `PLUGIN_MANIFEST_PRODUCTION_BRANCH=main`
- Reserved `DENO_*` names from the workflow environment are excluded automatically.

## Build Config

The action treats the Deno dashboard config as the source of truth. It always applies:

- `runtime.type=dynamic`
- `runtime.entrypoint=<input entrypoint>`
- `unstable` merged with `kv`

When `buildManifest=true`, it also applies:

- `install`: `deno install`
- `build`: `deno x -y @ubiquity-os/plugin-manifest-tool@latest --repository <owner>/<repo> --production-branch main`
- `predeploy`: `deno install`

Repository identity for Deno manifest builds comes from the persisted Build-context variable `PLUGIN_MANIFEST_REPOSITORY`.

Do not commit a `deploy` block in tracked `deno.json` or `deno.jsonc`. `provision` will fail fast if it finds one, because source config would override the action-managed dashboard config.

## Workspace Mutation

During `provision`, the action runs:

- `POST /v2/apps` when the app does not exist yet, using the managed config and synced env vars as app defaults
- `PATCH /v2/apps/{slug}` for existing apps before deploy
- `deno --unstable-kv deploy . --config <temporary deno.json|deno.jsonc> --prod` as the single production deployment step for both newly created and existing branch apps
- `deno install` and `deno x -y @ubiquity-os/plugin-manifest-tool@latest` only when `buildManifest=true`
When `buildManifest=true`, this can create or update `manifest.json`, a temporary workspace `deno.json` or `deno.jsonc`, `node_modules`, and related install artifacts in the checked-out workspace. Before each direct deploy, the action removes `node_modules` so Deno uploads only the workspace source, stages a standard Deno config file into the workspace for the upload itself, then restores the original config state after the deploy attempt. The staged config preserves the repo's tracked non-`deploy` Deno settings and always includes `unstable: ["kv"]` so `Deno.openKv()` is available during the deploy runtime.

On first provision, this metadata-first create path avoids the extra bootstrap build that `deno deploy create --source local` would otherwise start before the explicit `--prod` deploy. The deploy step always includes `--unstable-kv` so workers that call `Deno.openKv()` can build without extra consumer-side workflow flags.

## Requirements

- Run `actions/checkout@v6` before `provision`.
- Grant `contents: write` so the action can create/update `dist/*` branches when `buildManifest=true`, and so `delete` can remove paired `dist/*` branches.
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
          buildManifest: true

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
  --build-manifest=true \
  --env-file ./local.env \
  --dry-run
```

If token-based organization inference is unavailable locally, set `DENO_ORG_NAME=ubiquity-os` instead of passing `--organization`.

For cross-repo local testing before publishing `@ubiquity-os/plugin-manifest-tool`, you can point `provision` at a local checkout by setting `PLUGIN_MANIFEST_TOOL_PATH=/abs/path/to/plugin-manifest-tool/bin/plugin-manifest-tool.js` and adding `node` to `--allow-run`.
