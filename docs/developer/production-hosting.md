# Project-Maintained Production Hosting

The project-maintained add-in is hosted on Cloudflare Pages at
[open-workbook-ai-addin.pages.dev](https://open-workbook-ai-addin.pages.dev).
Users download the [production manifest](https://open-workbook-ai-addin.pages.dev/manifest.xml)
and upload it to Excel using the [README setup instructions](../../README.md#get-started-in-excel).

Cloudflare serves the manifest, HTML, JavaScript, CSS, and icons. The add-in runs in the
user's browser and calls OpenRouter directly; this deployment has no application backend.

## Automatic Deployment

The [GitHub Actions workflow](../../.github/workflows/deploy-cloudflare-pages.yml) runs on
pushes to `main`, including merged pull requests:

1. Check out the source and install dependencies with `npm ci`.
2. Run `npm run build` to generate `dist/`, including a manifest pointing to the
   `PRODUCTION_URL` in [vite.config.mts](../../vite.config.mts).
3. Deploy all of `dist/` to the Cloudflare Pages project `open-workbook-ai-addin` using Wrangler.

No manual build or upload is needed for this deployment. Pushes to other branches do not
trigger this workflow. The workflow currently builds and deploys without running tests.

## Maintainer Configuration

The workflow requires these GitHub repository settings:

- Secret: `CLOUDFLARE_API_TOKEN`
- Variable: `CLOUDFLARE_ACCOUNT_ID`

Check the **Deploy add-in to Cloudflare Pages** run in GitHub Actions for build or deployment
failures. Hosting a separate copy is covered by [Host Your Own Deployment](../../README.md#host-your-own-deployment).
