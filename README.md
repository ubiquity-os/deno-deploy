# deno-deploy

Provisions Deno Deploy apps, syncs Deno environment variables, and maintains `dist/*` manifest artifacts for UbiquityOS plugins.

## Behavior

- One local-source Deno Deploy app is managed per Git branch.
- `main` uses the unsuffixed base app slug. Every other branch uses `<base-app>-<branch-suffix>`, capped at 32 total characters.
- Long branch names are truncated to fit the 32-character cap. No hash or other disambiguator is appended, so collisions are accepted by design.
- `provision` creates a missing branch app when needed, patches dashboard build/runtime config, syncs runtime and build env vars to Deno `production`, deploys existing branch apps from the current workspace, generates `manifest.json` in GitHub Actions, and publishes it to `dist/<branch>`.
- After a successful deploy, `provision` updates `dist/<branch>/manifest.json` inline with the stable branch app URL `https://<app-slug>.<org-slug>.deno.net`.
- `delete` removes both the paired Deno branch app and the paired `dist/<branch>` branch.
- The first scaffold run for a missing branch app does not run a deploy, so `homepage_url` in `dist/*` can legitimately remain empty until the next successful deploy for that branch app.

## Inputs

- `action`: `provision` or `delete`.
- `token`: Deno Deploy token used for app management, env sync, deploys, and deletion.
- `organization`: Optional Deno Deploy organization slug. When omitted, `provision` first tries to infer it from the token by switching to an accessible Deno app.
- `app`: Optional base Deno Deploy app slug override. Defaults to the sanitized repository name. `main` uses this value directly; all other branches append a truncated branch suffix within the 32-character total slug cap.
- `entrypoint`: App runtime entrypoint. Defaults to `src/deno.ts`.
- `syncEnv`: Whether to sync workflow runtime env vars during `provision`. Defaults to `true`.

## Outputs

- `app_slug`: Resolved Deno app slug.
- `homepage_url`: Published stable branch app URL written into `dist/*/manifest.json` when available.

## Environment Sync

- Runtime env vars always go to Deno `production` in this branch-per-app model.
- GitHub environment selection still happens in the consumer workflow:
  - `main` and `demo` should use the GitHub `main` environment
  - all other branches should use the GitHub `development` environment
- Build-only env vars are always synced:
  - `PLUGIN_MANIFEST_REPOSITORY`
  - `PLUGIN_MANIFEST_PRODUCTION_BRANCH=main`
- `syncEnv: false` disables workflow runtime env upload only. The internal build metadata vars above are still managed.
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

- `deno deploy create --source local ...` when the app does not exist yet
- `deno deploy . --config .deno-branch-app.jsonc --prod` for existing branch apps
- `deno install`
- `deno x -y @ubiquity-os/plugin-manifest-tool@latest`
- `deno deploy switch --app <slug>` with `DENO_DEPLOY_TOKEN` in the child environment when it needs to infer the organization for an existing app

This can create or update `manifest.json`, `deno.jsonc`, `.deno-branch-app.jsonc`, `node_modules`, and related install artifacts in the checked-out workspace. Before each direct deploy, the action removes `node_modules` so Deno uploads only the workspace source, then deletes `.deno-branch-app.jsonc` after the deploy attempt.

## Requirements

- Run `actions/checkout@v4` before `provision`.
- Grant `contents: write` so the action can create/update `dist/*` branches.
- Use a Deno Deploy token with access to the target organization.
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
      - uses: actions/checkout@v4

      - uses: ubiquity-os/deno-deploy@main
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          action: provision
          token: ${{ secrets.DENO_2_DEPLOY_TOKEN }}
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
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          action: delete
          token: ${{ secrets.DENO_2_DEPLOY_TOKEN }}
          app: ${{ vars.DENO_PROJECT_NAME }}
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
  --ref-name demo \
  --default-branch development \
  --app command-start-stop-demo \
  --entrypoint src/worker.ts \
  --env-file ./local.env \
  --dry-run
```

For cross-repo local testing before publishing `@ubiquity-os/plugin-manifest-tool`, you can point `provision` at a local checkout by setting `PLUGIN_MANIFEST_TOOL_PATH=/abs/path/to/plugin-manifest-tool/bin/plugin-manifest-tool.js` and adding `node` to `--allow-run`.
