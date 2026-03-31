# deno-deploy

Deploys a plugin to Deno (new platform at [console.deno.com](https://console.deno.com)) and keeps generated `manifest.json` updates on paired artifact branches.

> **Note:** This action has been upgraded to use the new Deno Deploy platform. Deno Deploy Classic (dash.deno.com) is being sunset on July 20, 2026. See the [migration guide](https://docs.deno.com/deploy/migration_guide/) for details.

## Artifact branch model

- Source branch `R` maps to artifact branch `dist/R`.
- If `R` already starts with `dist/`, it is used as-is.
- On `deploy`, this action updates `homepage_url` and publishes `manifest.json` to the artifact branch root.
- On `delete`, this action deletes both the Deno project and the paired artifact branch.
- Source branches no longer receive generated manifest commits.

## Requirements

- Your plugin should be written for ESM.
- Imports should not be shortened (for example `./myFolder/index` instead of `./myFolder`).
- There should be an entrypoint for `fetch`, exported as default.
- Node imports must be explicit (for example `import { Buffer } from "node:buffer"`).
- Uses Deno 2 with native Node.js compatibility - no deno-node adapter step required.

## Key inputs

- `action`: `deploy` or `delete`.
- `token`: Deno Deploy token.
- `entrypoint`: Entrypoint file to deploy.
- `project_name`: Optional override for the generated Deno project name.
- `sourceRef`: Source branch ref used for deterministic project naming and artifact-branch mapping (defaults to delete-aware branch resolution).
- `artifactPrefix`: Artifact branch prefix (default `dist/`).

## Example

```yaml
name: Deno Deploy

on:
  workflow_dispatch:
  push:
  delete:

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write

    steps:
      - uses: actions/checkout@v5

      - uses: ubiquity-os/deno-deploy@main
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          KERNEL_PUBLIC_KEY: ${{ secrets.KERNEL_PUBLIC_KEY }}
        with:
          token: ${{ secrets.DENO_DEPLOY_TOKEN }}
          action: ${{ github.event_name == 'delete' && 'delete' || 'deploy' }}
```
