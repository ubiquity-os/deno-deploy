# deno-deploy

Provisions Deno Deploy apps, syncs Deno environment variables, and maintains `dist/*` manifest artifacts for UbiquityOS plugins.

## Behavior

- One Deno Deploy app is managed per repository.
- `provision` creates a missing Deno app with a one-time local-source bootstrap, patches dashboard build/runtime config, syncs runtime and build env vars, runs one explicit production bootstrap deploy from the current workspace, generates `manifest.json` in GitHub Actions, and publishes it to `dist/<branch>`.
- `publish-manifest` handles `repository_dispatch` `deno_deploy.build.routed` events and only updates `homepage_url` in the already-published `dist/<branch>/manifest.json`.
- `delete` only removes the paired `dist/<branch>` branch. It never deletes the Deno app.
- Successful `provision` runs append a Deno settings link to the GitHub Actions job summary so the app can be linked to GitHub for automated Deno builds.
- The first bootstrap run for a newly created app now attempts one explicit production deploy, but `homepage_url` in `dist/*` can still remain empty until the app is linked to GitHub in Deno and a later routed build completes.

## Inputs

- `action`: `provision`, `publish-manifest`, or `delete`.
- `token`: Deno Deploy token used for app management, env sync, timeline lookups, and `deno deploy switch`.
- `organization`: Optional Deno Deploy organization slug. When omitted, `provision` first tries to infer it from the token by switching to an accessible Deno app.
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
- `syncEnv: false` disables workflow runtime env upload only. The internal build metadata vars above are still managed.
- Reserved `DENO_*` names from the workflow environment are excluded automatically.

## Build Config

The action treats the Deno dashboard config as the source of truth. It applies:

- `install`: repo-specific `deno eval ...` command that resolves the checked-out branch from local refs first, falls back to GitHub's `branches-where-head` API for the current commit, then runs `deno install` with `PLUGIN_MANIFEST_REPOSITORY`, `PLUGIN_MANIFEST_PRODUCTION_BRANCH=main`, and `PLUGIN_MANIFEST_REF_NAME` injected into the child environment.
- `build`: repo-specific `deno eval ...` command that uses the same branch resolution flow and then runs `deno x -y @ubiquity-os/plugin-manifest-tool@1.3.0 --repository <owner>/<repo> --production-branch main [--ref-name <branch>]`, while still injecting the same manifest env for compatibility.
- `predeploy`: `deno install`

Do not commit a `deploy` block in tracked `deno.json` or `deno.jsonc`. `provision` will fail fast if it finds one, because source config would override the action-managed dashboard config.

## Workspace Mutation

During `provision`, the action runs:

- `deno deploy create --source local ...` when the app does not exist yet
- `deno deploy . --config .deno-bootstrap.jsonc --prod` once after creating a missing app
- `deno install`
- `deno x -y @ubiquity-os/plugin-manifest-tool@latest`
- `deno deploy switch --app <slug>` with `DENO_DEPLOY_TOKEN` in the child environment

This can create or update `manifest.json`, `deno.jsonc`, `.deno-bootstrap.jsonc`, `node_modules`, and related install artifacts in the checked-out workspace. Before the one-time bootstrap deploy, the action removes `node_modules` so Deno uploads only the workspace source, then deletes `.deno-bootstrap.jsonc` after the deploy attempt.

## Requirements

- Run `actions/checkout@v4` before `provision`.
- Grant `contents: write` so the action can create/update `dist/*` branches.
- Use a Deno Deploy token with access to the target organization.
- Link the created app to GitHub in the Deno UI before expecting automated Deno branch builds and routed `publish-manifest` events.
- Keep the `repository_dispatch` / `publish-manifest` workflow on the consumer repo's default branch. GitHub only runs repository dispatch workflows from the default branch.

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
