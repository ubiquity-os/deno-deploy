# deno-deploy

Provisions a GitHub-linked Deno Deploy app, syncs environment variables, and keeps generated `manifest.json` updates on `dist/*` branches.

## Behavior

- One Deno Deploy app is managed per repository.
- Deno Deploy handles branch timelines after the app is linked to GitHub.
- Source branch `R` maps to artifact branch `dist/R`.
- `publish-manifest` updates `manifest.json.homepage_url` with the routed branch timeline URL and writes it to `dist/R`.
- `delete` only removes the paired `dist/*` branch. It never deletes the Deno app.

## Inputs

- `action`: `provision`, `publish-manifest`, or `delete`.
- `token`: Deno Deploy token used for provisioning, environment sync, and revision timeline lookups.
- `organization`: Deno Deploy organization slug. Required for `provision`.
- `app`: Optional Deno Deploy app slug override. Defaults to the sanitized repository name.
- `entrypoint`: Entrypoint used when creating the Deno Deploy app. Defaults to `src/deno.ts`.
- `syncEnv`: Whether to sync workflow environment variables during `provision`. Defaults to `true`.

## Environment sync

- The repository default branch syncs variables to the `Production` context.
- All other branches sync variables to the shared `Preview` context.
- Non-default branches share one preview context, so later runs can replace preview-scoped values from earlier runs.

## Example workflow

```yaml
name: Deno Deploy

on:
  push:
    branches-ignore:
      - dist/**
  repository_dispatch:
    types: [deno_deploy.build.routed]
  delete:

jobs:
  provision:
    if: github.event_name == 'push'
    runs-on: ubuntu-latest

    steps:
      - uses: ubiquity-os/deno-deploy@main
        env:
          KERNEL_PUBLIC_KEY: ${{ secrets.KERNEL_PUBLIC_KEY }}
        with:
          action: provision
          token: ${{ secrets.DENO_2_DEPLOY_TOKEN }}
          organization: ${{ vars.DENO_ORG_NAME }}

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
          organization: ${{ vars.DENO_ORG_NAME }}

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
