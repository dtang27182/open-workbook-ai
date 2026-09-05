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
  assistant, and receive streamed Markdown responses that can be copied as Markdown.
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
  control. Restoring writes back the pre-edit worksheet snapshot and removes that turn and
  all later conversation context.
- **OpenRouter account controls:** sign in through OpenRouter using PKCE, open the linked
  key's management page, or sign out. The generated key is retained in browser local
  storage across task-pane reloads.

## Requirements

- Node.js 20.19 or newer
- Excel for desktop, or Excel on the web through Microsoft 365
- Excel JavaScript API 1.7 or newer
- An OpenRouter account with access to the models configured in the source

## Run Locally

Install dependencies:

```bash
npm install
```

Start the HTTPS development server at `https://localhost:3000`:

```bash
npm start
```

Sideload `manifest.xml` in Excel, open **Open Workbook AI** from the Home ribbon, and
choose **Sign in with OpenRouter**. Complete authorization in the separate window, then
submit a request while the worksheet you want to use is active.

Example requests:

```text
Summarize the key drivers and outputs in this worksheet.
Update the revenue forecast to use a 7% growth assumption.
Create a separate downside scenario with volume 10% below the baseline.
```

The first request for a worksheet may pause at a formula-inference diff. Review the green
cells on the temporary sheet and choose **Accept** or **Reject** in the task pane. Regular
in-place updates use the same review flow. Separate scenarios are created directly on a
new worksheet and do not modify the baseline worksheet.

## Build and Checks

```bash
npm run build
npm run build:dev
npm run lint
npm run test:unit
npm run validate
```

- `npm run build` writes deployable assets and a manifest using the configured production
  URL to `dist/`.
- `npm run build:dev` writes the same artifacts with localhost URLs.
- `npm run test:live` runs the integration behavior suite against OpenRouter and requires
  an `OPEN_ROUTER_TOKEN` environment variable. It makes real model requests and may incur
  usage charges.

## How Workbook Changes Work

For an in-place edit, the add-in copies the active worksheet to `Diff N`, applies only the
proposed cell changes there, highlights those cells, and activates the diff for review.
Accepting copies the diff's formulas and values back to the source worksheet and deletes
the diff; rejecting only deletes the diff.

For a separate scenario, the add-in copies the active worksheet to `Scenario N`, applies
the scenario changes, lets Excel recalculate, and adds a comparison section using selected
baseline and scenario ranges. Scenario creation does not use the Accept/Reject flow because
the baseline worksheet is left unchanged.

Restore checkpoints are held only in the current task-pane session. They apply to accepted
in-place or formula-inference edits, not to newly created scenario worksheets.

## Project Map

```text
manifest.xml                               Add-in identity, permissions, ribbon, and URLs
src/taskpane-fsm/taskpane.html              Task-pane HTML entry point and styles
src/taskpane-fsm/taskpane.ts                Component initialization
src/taskpane-fsm/taskpane-component.ts      Page selection and authentication handling
src/taskpane-fsm/pages/openrouter-auth/     OpenRouter sign-in and local key storage
src/taskpane-fsm/pages/chat/chat-page.ts    Chat component composition
src/taskpane-fsm/pages/chat/chat-window/   Conversation, model, Excel, and DOM workflows
src/auth-dialog/                           OpenRouter authorization callback dialog
assets/                                    Manifest icons
tests/                                     Unit and live integration behavior tests
vite.config.mts                            Build and development-server configuration
```

## Data and Security

The add-in sends the active worksheet's used-range values and formulas, the current user
request, and relevant conversation history to OpenRouter. Scenario comparisons also send
selected recalculated baseline and scenario ranges. Do not use the add-in with workbook
data that you are not permitted to share with OpenRouter or the configured model provider.

The OpenRouter key created during sign-in is stored in the task pane's browser local
storage and sent to OpenRouter for model requests. **Sign Out** removes the local copy;
use **Manage OpenRouter key** to manage or revoke the key at OpenRouter.

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

## License

Open Workbook AI is available under the MIT License. See `LICENSE`.
