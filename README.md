# deno-deploy
Deploys a plugin to Deno, and deletes it if the related branch is deleted.

## Requirements
- your plugin should be written for ESM
- imports should not be shortened (e.g. `./myFolder` containing `index.ts` should be written as `./myFolder/index`)
- imports of external files like `.json` should have a type check (`import myJson from "./myJson.json" with { type: "json" }`)
- there should be an entry point for `fetch`, exported as a default

## Example

Here is a valid Action that would compile and publish to Deno.

```yaml
name: Deno Deploy

on:
  workflow_dispatch:
  push:
  delete:

jobs:
  deploy:
    runs-on: ubuntu-latest
    name: Deploy
    environment: ${{ (github.event.ref == 'refs/heads/main' || github.ref == 'refs/heads/main' || github.event.workflow_run.head_branch == 'main') && 'main' || 'development' }}
    permissions:
      contents: write
      # Required from Deno CLI to be able to publish the project to your account
      id-token: write

    steps:
      - uses: ubiquity-os/deno-deploy@main
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # Add all the environment variables required by your plugin here
          KERNEL_PUBLIC_KEY: ${{ secrets.KERNEL_PUBLIC_KEY }}
        with:
          # Get this token from the Deno dashboard
          token: ${{ secrets.DENO_DEPLOY_TOKEN }}
          action: ${{ github.event_name == 'delete' && 'delete' || 'deploy' }}
```