# Open Workbook AI

An open-source AI assistant for analyzing and editing the active Excel worksheet.

> **Prerelease:** Open Workbook AI is under active development, requires sideloading,
> and is not yet recommended for production workbooks. Use a copy of important workbooks
> while evaluating it.

It demonstrates a compact Office.js workflow:

- Let Excel own the calculations, so edits in the workbook recalculate natively.
- Ask a sheet-aware assistant questions about the active worksheet.
- Allow the assistant to return sparse cell edits when a request should modify the workbook.

## Requirements

- Node.js 20.19+
- Excel for desktop, or Excel on the web through Microsoft 365
- An OpenRouter account when using the assistant

## Setup

```bash
npm install
npm run build
```

For a one-time development build:

```bash
npm run build:dev
```

## Checks

```bash
npm run lint
npm run test:unit
npm run validate
```

## Run

```bash
npm start
```

This starts the Vite HTTPS development server at `https://localhost:3000`. Sideload `manifest.xml` in Excel to open the add-in.

Open the add-in from Excel's Home ribbon, choose **Sign in with OpenRouter**, and complete sign-in in the separate window. The OpenRouter-created key is stored in the browser so OpenRouter remains linked after task-pane reloads.

## Project Map

```text
manifest.xml                              Add-in identity, permissions, ribbon, and URLs
src/taskpane/taskpane.html                  Task pane HTML entry point
src/taskpane/taskpane.ts                    Task pane application entry point
src/taskpane/pages/                         Persistent task pane pages
src/auth-dialog/openrouter-auth-dialog.html Authentication dialog HTML entry point
src/auth-dialog/openrouter-auth-dialog.ts   Authentication dialog application entry point
assets/                                     Manifest icons
vite.config.mts                             Build and development-server configuration
```

## Notes

The assistant sends the active sheet's values and formulas to OpenRouter. Do not use it
with workbook data that you are not permitted to share with that service. For modification
requests, the add-in previews sparse cell edits on a temporary worksheet before the user
chooses whether to apply them.

The production build writes deployable files and a production manifest to `dist/`. The
source `manifest.xml` retains localhost URLs for development.

## Current Limitations

- The add-in must be sideloaded and is not distributed through Microsoft Marketplace.
- Assistant behavior depends on the selected OpenRouter model and may be incorrect.
- The interface and workbook-editing workflow may change before the first stable release.

## License

Open Workbook AI is available under the MIT License. See `LICENSE`.
