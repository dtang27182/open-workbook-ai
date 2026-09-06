# Open Workbook AI

Open Workbook AI is an open-source Excel task-pane assistant for analyzing the active
worksheet, proposing model updates, and building what-if scenarios. Excel remains the
calculation engine: the add-in reads the worksheet's used range and lets Excel recalculate
any formulas it writes.

> **Prerelease:** Open Workbook AI is under active development, requires sideloading,
> and is not yet recommended for production workbooks. Use a copy of important workbooks
> while evaluating it.

## Current Features

- **Sheet-aware analysis:** ask questions about the active worksheet's values and formulas.
- **Contextual chat:** ask follow-up questions, answer clarifying questions from the
  assistant, and receive streamed Markdown responses.
- **Formula inference:** on the first request for a worksheet in a chat session, the
  assistant checks for hardcoded calculated values and can propose formulas to replace
  them. The original request continues after the proposal is accepted or rejected.
- **Reviewable in-place edits:** requested updates are made on a temporary `Diff N` copy
  first. Proposed cells are highlighted in green, and the original worksheet changes only
  after you choose **Accept**. Choosing **Reject** deletes the diff without changing the
  original.
- **Post-edit analysis:** after an in-place edit is accepted and Excel recalculates, the
  assistant compares the original and updated results and summarizes the impact.
- **Scenario modeling:** requests for a separate scenario create a `Scenario N` copy,
  highlight changed inputs or formulas, add a baseline-versus-scenario comparison below
  the copied model, and return an analysis in chat. Exploratory what-if questions create a
  scenario when no edit destination is specified.
- **Restore checkpoints:** accepted in-place and formula-inference edits add a **Restore**
  control. Restoring writes back the saved worksheet and chat state. It does not roll back
  other worksheets or delete scenario sheets.
- **OpenRouter account controls:** sign in through OpenRouter using PKCE or sign out.
  The generated key is retained in browser local storage across task-pane reloads.

## Get Started in Excel

Follow these steps to add Open Workbook AI to Excel and start asking questions about
your worksheets. No coding or developer tools are needed.

### What you need

- A Microsoft 365 account with access to Excel in your browser and permission to upload
  custom add-ins. If your organization restricts this, ask your Microsoft 365 administrator.
- An OpenRouter account, which provides access to the AI models used by the add-in

### Add Open Workbook AI to Excel

1. Download the [add-in setup file](https://open-workbook-ai-addin.pages.dev/manifest.xml)
   and save it as `manifest.xml`. This small file tells Excel where to load the add-in.
   If your browser displays text instead of downloading the file, use **Save As** or
   right-click the link and choose **Save Link As**.

2. Sign in to Excel on the web and open a workbook. Select **Home Ribbon > Add-ins >
   More Add-ins > My Add-ins > Manage My Add-ins > Upload My Add-ins**.
   Select the downloaded `manifest.xml` and choose **Upload**.

3. Open **Open Workbook AI** from the Home ribbon and choose **Sign in with OpenRouter**.
   Finish signing in through the separate window. Select the worksheet you want help with,
   then type a question or request in the chat.

You're ready to use the add-in. You can skip the developer instructions below.

## Data and Security

The add-in sends the active worksheet's used-range values and formulas, the current user
request, and relevant conversation history to OpenRouter. Scenario comparisons also send
selected recalculated baseline and scenario ranges. Do not use the add-in with workbook
data that you are not permitted to share with OpenRouter or the configured model provider.

The OpenRouter key created during sign-in is stored in the task pane's browser local
storage and sent to OpenRouter for model requests. **Sign Out** removes the local copy;
manage or revoke the key through your OpenRouter account.

## Current Limitations

- The add-in must be sideloaded and is not distributed through Microsoft Marketplace.
- Requests use only the active worksheet's used range, not the entire workbook.
- Model selection is fixed in the source; there is no model picker or settings page.
- Formula inference, edits, comparisons, and analysis are model-generated and may be
  incomplete or incorrect. Review every proposed change and scenario before relying on it.
- Large worksheets may exceed model context or output limits.
- Chat history, preprocessing status, and restore checkpoints are not persisted across a
  task-pane reload. **Clear** also resets that in-memory state but does not change workbook
  contents.
- Scenario worksheets are created immediately and have no in-app restore control.

## For Developers

This section is for developers who want to run or modify the add-in's source code.
To use the add-in with your worksheets, follow [Get Started in Excel](#get-started-in-excel) above.

### Run Locally

#### Prerequisites

- A Microsoft 365 account with access to Excel on the web and permission to sideload
  add-ins (upload a custom `manifest.xml`)
- Node.js 20.19+ (20.x), 22.12+ (22.x), or 24+ (see `engines.node` in `package.json`)
- An OpenRouter account with access to the models configured in the source

#### How the local setup works

Sideloading registers the add-in with Excel by uploading its manifest. The `manifest.xml`
in the repository's top-level directory tells Excel to load the add-in entry point at
`https://localhost:3000/src/taskpane/taskpane.html`.

Excel then loads the add-in's HTML, JavaScript, and CSS from the development server on
your computer. The add-in runs entirely client-side in your browser, using the Excel API
to interact with the workbook and making model requests directly to OpenRouter. The
localhost server serves the frontend files; it provides no application backend.

#### Set up and sideload

1. Install dependencies from the repository's top-level directory:

   ```bash
   npm install
   ```

2. Start the HTTPS development server and leave it running while using the add-in:

   ```bash
   npm start
   ```

3. Open the [local task pane](https://localhost:3000/src/taskpane/taskpane.html) in the
   same browser you use for Excel on the web. If a certificate warning appears, open its
   advanced options and choose to proceed to localhost. Excel 365 may not load the task
   pane until you accept this warning. Only bypass it for your own development server.

4. Sign in to Excel on the web and open a workbook. Select **Home Ribbon > Add-ins >
   More Add-ins > My Add-ins > Manage My Add-ins > Upload My Add-ins**.
   Select the repository's top-level `manifest.xml`
   (not `dist/manifest.xml`) and choose **Upload**. See Microsoft's
   [sideloading instructions](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/sideload-office-add-ins-for-testing#manually-sideload-an-add-in-to-office-on-the-web)
   for the upload flow.

5. Open **Open Workbook AI** from the Home ribbon and choose **Sign in with OpenRouter**.
   Complete authorization in the separate window, then submit a request with the worksheet
   you want to use active.

### Host Your Own Deployment

Use this option to publish your own copy of the add-in, separate from the
[project-maintained deployment](https://open-workbook-ai-addin.pages.dev).
It is not needed to use the existing add-in or to develop locally.

1. Choose an HTTPS static host and set `PRODUCTION_URL` in `vite.config.mts` to your
   deployment's URL, including the trailing slash (for example, `https://addin.example.com/`).
   Host at the domain root, not a subdirectory, because the sign-in flow uses a root-relative
   callback path.

2. Install dependencies and build from the repository's top-level directory:

   ```bash
   npm install
   npm run build
   ```

   The build writes the add-in's HTML, bundled JavaScript, CSS, and icons to `dist/`.
   It also generates `dist/manifest.xml` with URLs pointing to your deployment.

3. Publish the entire contents of `dist/` at your deployment URL, preserving the directory
   structure. Host both the manifest and the application files; the manifest alone is not
   the add-in. No application backend is required.

4. Download `manifest.xml` from your deployment and upload it to Excel using the
   [setup steps above](#add-open-workbook-ai-to-excel). Use your manifest instead of the
   project-maintained one or the repository's localhost manifest.

To publish changes to your copy, rebuild and redeploy `dist/` to your host.

### Checks

```bash
npm run lint
npm run test:unit
npm run validate
```

See [Testing](docs/testing.md) for the testing approach and live integration test setup.

### Developer Documentation

- [Application Architecture](docs/application-architecture.md): module responsibilities, workflow transitions, and restore semantics.
- [Component Architecture](docs/component-architecture.md): the component contract and event ownership.
- [Component Implementation Guide](docs/component-architecture-implementation-guide.md): recommended component structure.
- [Testing](docs/testing.md): test setup, coverage boundaries, and contribution guidance.
- [Production Hosting](docs/production-hosting.md): project-maintained hosting and automatic GitHub-to-Cloudflare deployment.

## License

Open Workbook AI is available under the MIT License. See `LICENSE`.
