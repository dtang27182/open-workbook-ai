# FIP: Taskpane Visual Redesign

## Behavior

### Scope and reference precedence

Recreate the visual language and applicable layouts of frames `m1`–`m6` in [the MVP handoff](../../design_handoff_taskpane_mvp/README.md), using the existing plain TypeScript components, raw HTML templates, and CSS. This plan changes presentation only: no new user actions, model requests, worksheet operations, persistence, or workflow outcomes.

A separate [follow-up plan stub](./review-footer-state-followup-fip.md) will remove the single Accept/Reject footer from the transcript model. The visual redesign retains `diff_review` entries as described below; that state-model refactor is subsequent work.

Use `design_handoff_taskpane_mvp/Task Pane MVP (Fluent-adjacent).dc.html` for measurements and the six supplied screenshots for visual comparison. The user's requirement to preserve functionality takes precedence over prototype behavior. Explicit handoff requirements take precedence over conflicting prototype examples; for example, inference cards must sit outside the assistant bubble even though the HTML and screenshot nest them inside it. Do not implement the future-features design, its reserved controls, the prototype runtime, or its example worksheet data.

The intended result is high visual fidelity within the current feature set, with the deliberate differences below. The prototype's Excel title bar, menu, close button, outside frame, and shadow belong to the host/reference presentation and are not part of the add-in UI.

### Screen mapping and deliberate differences

| Design element                       | Planned presentation and scope boundary                                                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| m1: signed out                       | Add the existing app mark, redesigned heading/copy, full-width sign-in button, disclosure card, and bottom prerelease caption. Preserve the existing sign-in status, error, and retry behavior.                                             |
| m2: header                           | Show the 20px app mark, title, and neutral `Sign out` button. Preserve the sign-out action and retained page instances.                                                                                                                     |
| m2: worksheet strip                  | Use the strip's geometry and quiet Clear chat button. Display the static scope caption `Active worksheet`; do not introduce live worksheet tracking. No current component subscribes to worksheet activation or retains a live active name. |
| m2: empty conversation               | Keep the existing initial assistant message, now using the new label and bubble treatment. Add no suggested prompts or buttons.                                                                                                             |
| m3: working                          | Restyle existing working entries as chips with a pulsing dot. Keep their actual text, ordering, appearance, and removal timing. Omit elapsed time because working entries contain no start timestamp.                                       |
| m3: inference                        | Render the existing confidence and region data as confidence bars and cards. Use only fields already returned by formula detection; do not invent short region names or alter inference timing.                                             |
| m4: pending review                   | Move the existing Accept/Reject controls to a footer, replacing the already-disabled composer visually. Show a warning using the actual diff name. Keep Clear chat visible and available, including during review.                          |
| m5: accepted                         | Restyle the existing acceptance message as a green confirmation strip using the known source sheet name. Keep subsequent analysis as ordinary sanitized Markdown; do not generate structured metric rows or infer better/worse colors.      |
| m5: restore                          | Restyle the existing divider and Restore button in their existing transcript position, before the request being rolled back. Use `Before this edit` as a caption; omit timestamps and the misleading after-edit placement/caption.          |
| m6: rejected                         | Restyle the existing rejection message as a neutral confirmation strip using the known source sheet name. Do not add the prototype's retry suggestion or another model response. Preserve preprocessing continuation when applicable.       |
| Footer build label                   | Show `Prerelease`. The repository supports both sideloaded and hosted builds; do not assert `sideloaded build` universally or add deployment detection.                                                                                     |

The active worksheet caption describes the existing submission scope, not a cached sheet identity. Actual diff/source names shown in review and decision strips come from existing workflow data. Do not infer those names from message text, transcript position, a workflow counter, or the currently activated sheet.

The m5 metric treatment cannot be reproduced reliably from today's free-form analysis string. Preserve any model-provided lists, code, and Markdown tables and style them consistently. Do not add a generated cell-by-cell diff table, and do not suppress content already returned by the model.

### Visual system

- Use the handoff font stacks: `"Segoe UI Variable Text", "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, sans-serif`; use `Consolas, "Cascadia Mono", monospace` for references and source/evidence text.
- Use accent `#0F6CBD`, hover `#115EA3`, ink `#1B1B1B`, secondary ink `#5C5C5C`, and captions/placeholders `#616161`. Carry over the handoff's surface, border, success, warning, and disabled colors exactly. Do not lighten enabled label text below the specified caption color.
- Make the pane white and edge-to-edge. Give sections their own padding: header `10px 12px`, scope strip `7px 12px`, transcript `14px 12px`, composer `10px 12px 11px`, review footer `10px 12px`, and auth content `20px 16px`.
- Use 14px between transcript entries, 8px inside ordinary message groups, and 6px between inference cards. Buttons have 4px radii; cards, composer field, and strips have 6px radii. Use the handoff's asymmetric 8px/3px message corners and no in-pane shadows.
- Render assistant labels outside bubbles as `Assistant`, styled uppercase at 11px/700 with `.08em` tracking. Hide the visible human role label. Preserve the internal `system` and `human` source values. Assistant bubbles use 13.5px/1.5 and a 92% maximum width; human bubbles use 13.5px/1.45 and an 86% maximum width.
- Target 350px width and reflow from approximately 300px to 500px without fixed content widths or pane-level horizontal scrolling. Preserve content-local scrolling for wide code/tables and the textarea's existing overflow at its height cap. The transcript remains the main vertical scroll region; allow auth content to remain reachable at short heights or enlarged text.
- Keep visible keyboard focus using `outline: 2px solid #0F6CBD; outline-offset: 1px`. Keep live status/error semantics and hide decorative dots/discs from assistive technology. Reduced motion makes the working dot static at full opacity.

### Functional invariants

- Sign-in still uses the existing OpenRouter exchange and key storage. Sign-out still clears the key and switches the retained page mount; it does not acquire new reset behavior.
- Clear chat still resets chat/restore state and sheet counters, retains the unsent draft and input instance, and does not change worksheet contents. Its availability during running workflows and pending review is unchanged; do not fix or redesign concurrent-clear behavior in this work.
- Send and plain Enter submit once. Shift+Enter, modified Enter, IME composition, draft clearing, and disabled input behavior remain as implemented.
- Preserve the textarea's 34px minimum and existing cap: `maxHeight = observed #chat-window content height / 2`; its effective minimum remains `min(34px, maxHeight)`. Keep width-triggered remeasurement and scroll-at-cap behavior. The handoff's 8px vertical padding plus 18px line height and two 1px borders requires 36px; retain 7px vertical padding, with the new 10px horizontal padding, to preserve the 34px minimum without clipping.
- Preserve streaming updates, auto-scroll, clarification, preprocessing, regular edits, scenario creation/comparison, acceptance analysis, error handling, and checkpoint semantics. The six design frames do not cover all these states.
- Both `pending_edit` and `pending_edit_preprocessed` receive the review presentation. Controls retain their existing `disabled` flags. Accept/reject currently remove the review entry when their workflow starts; the new footer disappears at that same point and the disabled composer returns while work continues.
- Restore remains a rollback to the snapshot before the associated request. Do not move its entry after the analysis, introduce dates, change IDs, or change what gets restored.

Confidence is a display of the existing categorical value: low fills one bar, medium two, and high three. It is not a new score or calculation. There is no change to model or spreadsheet simulation behavior.

## Interface Points

The changes follow the existing path from templates to transcript rendering to workflow-produced content. Component ownership and event routing stay the same; the interfaces below change only how existing information reaches the screen.

### Existing interface points to change

The templates and styles establish the shared visual system and page layouts:

- `taskpane.html` and `taskpane.css`: replace the outer inset/Fabric visual treatment with shared design tokens and an edge-to-edge pane.
- `openrouter-auth-page.html` and `.css`: rebuild the signed-out presentation while preserving the IDs consumed by `OpenRouterAuthPage.createElement()`.
- `chat-page.html` and `chat-page.css`: restyle the existing heading, scope row, messages, form, and controls.

The DOM helpers apply that layout to the conversation, including moving review controls into the footer within the same owning component:

- `createInitialDom()` in `chat-window-dom.ts`: create a permanent review-footer container next to the existing composer and prepare the scope/warning strip within `ChatWindow`.
- `renderChatTranscript()`: render structured inference entries, route review entries to the footer, and retain transcript order and auto-scroll.
- `createChatMessage()`: render human/assistant bubbles and dispatch explicitly annotated decision messages to their presentation helper.
- `createWorkingMessage()`: render the new working-chip appearance without a timer or a changed lifecycle.
- `createDiffReviewDivider()`: render full-width primary Accept and neutral Reject buttons in the footer while retaining existing handlers and disabled flags.
- `createRestoreDivider()`: apply the quiet accent button and checkpoint caption without moving the checkpoint or changing its ID binding.

The transcript interfaces carry explicit presentation data so renderers can distinguish inference plans and completed decisions without interpreting message text:

- `ChatTranscriptItem` / `ChatMessageTranscriptItem`: add a structured inference entry with no Markdown copy, plus decision presentation data on messages and the diff name on review entries.
- `appendMessageAndRender()`: accept optional typed decision presentation data while retaining the existing text, source, workflow ID, append order, and return value.
- `appendDiffReviewTranscriptItemAndRender()`: accept the actual diff sheet name alongside the existing workflow ID so review chrome needs no additional state lookup.

The existing workflow producers supply that data where it is already available, preserving their operations and completion timing:

- `runPreprocessWorkflow()`: replace the detection message's Markdown representation with one structured inference entry containing the already-produced `FormulaInferencePlan`.
- `formatFormulaInferencePlan()`: remove this redundant Markdown formatter and its import now that the renderer formats the structured plan directly.
- `finalizeTransition()` in `workflows/preprocess.ts` and `processModelResponse()` in `chat-window.ts`: pass the created diff's actual sheet name when appending review entries.
- `finalize()` in `workflows/accept-diff.ts` and `workflows/reject-diff.ts`: attach decision presentation data to the existing completion message after the existing successful worksheet operations.

Verification covers the boundaries where presentation changes could affect existing behavior:

- Existing unit tests and `tests/implementation-spec.md`: cover review placement and presentation annotations where they can affect existing controls, content, or restore behavior.

### New interface points to create

The additions store inference data once and render it directly, alongside a separate annotation for completed decisions, all within existing modules:

- `ChatFormulaInferenceTranscriptItem` type in `transcript-helpers.ts`: store the structured plan and workflow ID as a dedicated transcript entry.
- `appendFormulaInferencePlanAndRender()` in `transcript-helpers.ts`: append that entry at the existing detection-complete point and render the transcript.
- `ChatMessagePresentation` type in `transcript-helpers.ts`: describe an existing edit decision for visual rendering.
- `createFormulaInferenceMessage()` in `chat-window-dom.ts`: create the assistant summary/confidence bubble and sibling region cards from existing typed plan fields.
- `createEditDecisionMessage()` in `chat-window-dom.ts`: create a success or neutral strip from an explicitly tagged completed decision and its source sheet name.

No new component class, component update event, service, Office subscription, timer, model response schema, or public component method is required. Keep rendering helpers private to their module. No framework, icon package, or dependency change is planned.

## Implementation Details

### Component hierarchy and DOM ownership

The TypeScript component hierarchy is identical before and after:

```text
TaskpaneComponent
|-- OpenRouterAuthPage
`-- ChatPage
    |-- ChatHeader
    `-- ChatWindow
        `-- ChatInput
```

The layout changes are confined to DOM owned by the same component:

| Owner                 | Current owned layout                                      | Planned owned layout                                                                                    |
| --------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `OpenRouterAuthPage`  | Heading, copy, button, status/error                       | Mark, heading, copy, button, status/error, disclosure, footer                                           |
| `ChatHeader`          | Title and Sign Out                                        | Mark, title, Sign out in the same header mount                                                          |
| `ChatWindow`          | Provider/Clear row, transcript, composer with input mount | Scope/warning and Clear row, transcript, composer with the same input mount, permanent review container |
| `ChatInput`           | Form, textarea, Send                                      | The same form, textarea, and Send, restyled                                                             |

Systematic rules for the DOM move:

1. Construct the scope row, transcript, composer, input mount, and review container once in `createInitialDom()` beneath the existing `ChatWindow` mount.
2. Keep the `ChatInput` instance and its mount in the composer throughout its lifetime. Hide/show the parent-owned composer wrapper; never rebuild, reparent, or replace the child's form to show review actions.
3. Render Accept/Reject into the sibling review container rather than into `#chat-messages`. This moves DOM between regions owned by `ChatWindow`; it does not move a component between parents.
4. Keep existing callbacks: sign-out follows `TaskpaneComponent → ChatPage → ChatHeader`; Clear, submit, Accept, Reject, and Restore still enter `ChatWindow.updateState()` through the existing handlers. No callback is rerouted through a sibling or a new coordinator.
5. Restrict subsequent rendering to construction or existing `updateState()` call paths. Do not let CSS/layout changes introduce independent state writers.

`TaskpaneComponent`, `ChatPage`, `ChatHeader`, their constructors, mount lifetimes, and event types need no TypeScript changes. `ChatHeader` picks up its new contents from the existing cloned template. `ChatInput` needs no TypeScript changes under this plan. If implementation discovers a need to change any parent/child relationship, update this plan with the exact before/after tree, mount lifetime, handler path, and state ownership before making that change; hierarchy changes are not implicit in this plan.

### Shared shell, tokens, and assets

- Define shared CSS custom properties in `taskpane.css` using the handoff's exact values; express page-specific geometry in page CSS. Update `.btn`, `.btn-secondary`, and `.btn-compact` instead of introducing a parallel button system. Apply scoped variants for Clear, Send, Restore, and review actions.
- Remove the obsolete `assistant-chat` class from the taskpane root and remove its now-unused styling if it has no other consumer. Remove the root's inherited card border, tinted background, gap, and padding. Retain the hidden startup state and `Office.onReady()` behavior.
- Replace the taskpane's Fabric font classes and the two template heading font classes with owned CSS. Remove the taskpane's now-unused Fabric stylesheet link once those usages are removed; do not change the auth dialog or unrelated stylesheets.
- Keep the full-height flex chain and `min-height: 0` through the pane, chat page, chat window, and transcript. Add `min-width: 0` to flexible text containers and use scoped box sizing. Make `[hidden]` win over flex display for the composer/review regions.
- Use `/assets/icon-32.png`, which is already available in development and copied to `dist/assets` by the existing Vite build. Raw template image paths resolve relative to the document, so do not use the design's relative `assets/icon-32.png` path unchanged. No duplicate asset or build plugin is necessary.
- Do not ship `support.js`, prototype HTML, screenshots, or inline prototype styles with the taskpane bundle. Leave the handoff files intact.

### Authentication template and CSS

- Preserve `#openrouter-sign-in`, `#openrouter-auth-status`, and `#openrouter-auth-error`, including their existing status/alert roles and hidden behavior. Keep the existing button text updates, autofocus behavior, and callback binding in `OpenRouterAuthPage.createElement()` untouched.
- Add the decorative 32px mark; reproduce the handoff heading, explanatory copy, and disclosure card. Keep error text at 12px in `#A4262C` directly beneath the button, with the status message in the same control area.
- Make the auth section occupy available height and push the `Prerelease` caption down with `margin-top: auto`. At reduced height, allow content to flow/scroll rather than covering the sign-in button or error.

### Chat template and CSS

- Retain `.chat-heading`, `.provider-link-details`, `#chat-messages`, and `#chat-form` so the existing template clone selectors continue to work. Preserve button/input IDs and input labels. Add only the wrappers/classes needed for new visual treatments.
- Insert the decorative 20px mark into `.chat-heading`, change the visible sign-out capitalization, and remove the `OpenRouter linked` copy in favor of the scope caption in the existing row.
- Give the scope row a dedicated text region. `renderChatTranscript()` can replace its caption with warning content without replacing or rebinding Clear chat. Keep Clear at the right; allow long warning text to wrap at 300px without pushing the button out of view.
- Separate assistant group styling from bubble styling: the group owns the label and spacing; `.chat-message-text` owns the bubble. Human text continues to use `textContent` and `white-space: pre-wrap`. Assistant Markdown retains `marked` plus DOMPurify and the existing paragraph/list spacing rules.
- Style inline code chips separately from `pre code`, so a code block does not become a series of highlighted chips. Keep long code and Markdown tables accessible in local overflow regions without horizontal page overflow.
- Restyle the composer and form with the handoff's surfaces, borders, horizontal padding, and Send button. Retain the ordinary placeholder while disabled; omitting `Working…` avoids conflating the existing pending-review disabled state with active work or adding another input state channel. Preserve drafts exactly.
- Apply button hover/active treatments only when enabled; preserve visible disabled treatments for neutral and accent controls. Do not change when any control becomes disabled.

### Transcript presentation data

Store an inference plan as its own transcript entry, with no `text` field or additional presentation copy. Keep decision annotations separate on ordinary message entries:

```ts
type ChatFormulaInferenceTranscriptItem = {
  kind: "formula_inference";
  plan: FormulaInferencePlan;
  workflowId: number;
};

type ChatMessagePresentation = {
  kind: "edit_decision";
  decision: "accepted" | "rejected";
  sourceSheetName: string;
};
```

- Add `ChatFormulaInferenceTranscriptItem` to the transcript union. It replaces the Markdown detection message at the same position; it does not add a second entry. Its plan is the sole stored representation of the inference result, and its renderer supplies the Assistant label.
- Add `presentation?: ChatMessagePresentation` only to ordinary message entries and required `diffSheetName: string` only to review entries. Keep their existing workflow IDs, `disabled` flags, and message text.
- Add `appendFormulaInferencePlanAndRender(mount, transcript, handlers, plan, workflowId)` to append the structured entry and invoke the existing transcript render path. Keep the ordinary message append/upsert helpers restricted to text messages.
- Add the optional decision presentation argument at the end of `appendMessageAndRender()`; ordinary calls remain unchanged. Add the required diff-name argument to the review append helper and update its two production call sites and any affected test fixtures.
- These fields preserve values already available at the message's producer. They are not new workflow state or an independent cache. Do not derive semantic meaning by matching `Accepted changes.`, parsing generated Markdown, or treating every message sharing a workflow ID as the same kind of message.
- Existing `structuredClone()` operations in transcript rendering and `RestoreManager.copyChatState()` carry this plain data with the transcript. No new restore-manager code, serializer, map, counter, or second source of truth is needed.
- Remove `formatFormulaInferencePlan()` from `llm/preprocess-formula-inference.ts` and its import in `workflows/preprocess.ts`; its only current call site is the detection-message append being replaced. Keep `FormulaInferencePlan`, `formatFormulaInferenceRegionResult()`, and inference logic unchanged.
- Keep the structured transcript entry and decision annotations out of `llmConversationMessages` and model request construction. The current detection-message text is not added to LLM history, so removing its Markdown representation does not change model context. Keep ordinary message text, including acceptance/rejection strings, unchanged.

### Review rendering in `chat-window-dom.ts`

- At each `renderChatTranscript()` call, clear/rebuild the transcript contents as today and clear the review container. Render message, formula-inference, working, and restore entries in their existing relative order. Render the existing review entry only into the review container.
- Derive review visibility and the warning from the current `diff_review` entry. Use its supplied `diffSheetName`, not a guessed relation to another entry or a lingering `pendingEdit` object. Do not select a review by transcript index or use a last-message heuristic.
- When a review entry exists, hide the composer wrapper, show the action container, and show `Changes staged on <actual diff name> — original untouched`. Keep Clear chat in the row. When no review entry exists, hide/empty the action container, show the composer wrapper, and restore the static scope caption.
- Keep the existing single-pending-review invariant; add no queue, selection behavior, or deduplication mechanism. `createDiffReviewDivider()` returns the footer's two buttons with unchanged `onAccept`, `onReject`, and `disabled` values; remove its decorative transcript rule.
- Leave `disableChatControls()` and `configChatControls()` logic unchanged. Their calls to `renderChatTranscript()` now update the footer as well. Removing review entries during accept/reject, clear, restore, or errors removes the review chrome on the existing render path.
- Keep the `ResizeObserver` attached to the same `#chat-window` element and supplying the same height formula. The review container stays inside that element. Verify hide/show and width changes remeasure the retained textarea correctly; do not change the sizing algorithm preemptively.

### Message rendering and narrowly scoped producer changes

- `renderChatTranscript()` dispatches `formula_inference` entries directly to `createFormulaInferenceMessage()`. `createChatMessage()` selects ordinary or decision rendering based on the explicit presentation field. Missing presentation intentionally means ordinary message rendering. Keep human text escaping and sanitized assistant Markdown.
- `createFormulaInferenceMessage()` displays the existing required/not-required decision and summary in an assistant bubble, followed by confidence bars with a readable Low/Medium/High label. Region cards are siblings outside that bubble, within the same message group.
- Map each card directly: `targetRange` to the code chip, `structure` to the adjacent descriptive heading, `relationship` to its body, and `sourceRanges` / `evidenceCells` to the final reference line. Preserve all supplied regions and field contents. Empty regions produce no cards. Do not extract imagined business names such as `Incidence Pop` from arbitrary text. Use safe DOM text insertion for structured values and sanitized Markdown wherever Markdown rendering is retained.
- In `runPreprocessWorkflow()`, replace the `detection_complete` call to `appendMessageAndRender()` with `appendFormulaInferencePlanAndRender()`, passing `event.plan` once with the existing workflow ID. Do not generate Markdown for this entry. Keep region-complete messages and streaming/event ordering unchanged. `finalizeTransition()` supplies `diff.sheetName` at the existing review append.
- In `processModelResponse()`, supply `diff.sheetName` at the existing review append; leave response processing, pending-edit assignment, Excel calls, and workflow transitions untouched.
- In accept/reject `finalize()`, annotate only the existing `Accepted changes.` or `Rejected changes.` append with its explicit decision and `pendingEdit.sourceSheetName`. Do not move this append across worksheet operations, change LLM decision messages, add another transcript entry, or change continuation/analysis calls.
- `createEditDecisionMessage()` renders the handoff's green acceptance or neutral rejection strip, using the actual source name and decorative check/cross disc. These strips appear only at the existing successful completion point. Errors and ordinary model text must never receive a success style through string matching.
- `createWorkingMessage()` preserves its own transcript entry and `role="status"`, changes the visible source label to Assistant, and applies the working-chip style with a 7px dot. Do not merge working/message entries or add elapsed-time tracking.
- `createRestoreDivider()` preserves its existing entry position and exact `restorePointId` callback, adds `Before this edit`, and applies the handoff's rule and quiet accent button. It does not read worksheet state or invent a date.

### Implementation sequence and change boundaries

1. Implement shared tokens, outer layout, auth screen, and static chat templates/CSS. Confirm retained IDs and the unchanged component tree.
2. Restyle ordinary messages, working entries, composer, and Restore. Verify keyboard behavior and input geometry before changing review placement.
3. Add the diff-name presentation field and move review rendering to the permanent footer. Verify both review states, transitions, and Clear availability.
4. Replace the inference Markdown message with a structured entry and remove its formatter; add decision annotations and the render helpers. Verify that all inference information remains visible and that ordinary message text, requests, worksheets, and restored conversation state retain their prior behavior.
5. Run focused regression checks and compare all six visual states, then check states absent from the prototype in Excel.

Leave `ExcelManager`, `LLMManager`, `OpenRouterClient`, formula generation/detection logic and prompts, `RestoreManager`, authentication/key exchange, package dependencies, and deployment configuration unchanged. Do not refactor existing workflow branches while attaching presentation data. Component Architecture and its implementation guide need no updates because their contract is unchanged; adjust only the provider-row wording in Application Architecture if needed to reflect the scope/review strip.

## Verification

### Automated behavior checks

Use the existing jsdom/component test infrastructure; no new test runner or permanent prototype route. Add focused tests for the DOM relocation and typed rendering, not snapshots of every CSS value or incidental ID formats. Update `tests/implementation-spec.md` with the presentation behavior covered by those tests.

- Both regular and preprocessing diffs show exactly one Accept and one Reject in the footer, outside the transcript and input form. The actual diff name is displayed. Activating these controls reaches the existing workflows once, and the source/diff worksheet effects are unchanged.
- The review footer preserves each entry's disabled state and vanishes when the entry is removed. Check ordinary completion, accepted/rejected preprocessing continuation, clear, restore while a diff is pending, and errors; stale `pendingEdit` data must not leave a false warning or active review buttons.
- Clear chat remains usable in its existing states, retains an unsent multiline draft, and retains the same input instance/form across review show/hide. Submission and restore keep the existing disabled semantics.
- Each detection result produces one structured inference entry that exposes every existing region field, renders low/medium/high confidence accurately, and handles no regions. Ordinary Markdown mentioning confidence or acceptance remains ordinary Markdown. Structured text containing HTML-like characters renders safely.
- Acceptance/rejection strips appear only for explicitly tagged successful decisions. Confirm that `llmConversationMessages`, ordinary message text, model request counts, and worksheet outcomes remain unchanged for equivalent mocked workflows; inference information is now represented by the structured entry.
- Restore still appears before the initiating request, invokes the same checkpoint ID, removes the same later context, and retains earlier presentation data through the existing clone path. Reject creates no new checkpoint. Include preprocessing followed by a regular edit within the same workflow to avoid incorrectly grouping decisions by workflow ID.
- Keep existing unit coverage for Send/Enter, modifiers, IME, drafts, clear, and sizing. Do not weaken functional assertions to accommodate the redesign.

Run `npm run test:unit` (includes TypeScript checking), `npm run lint`, and `npm run build`. Run `npm run validate` as the repository's manifest check. Check production asset resolution, including both icon sizes. The build is not a substitute for type checking. Live model tests are not needed for this presentation change; do not change integration tests or introduce real requests solely to produce screenshots.

### Visual and accessibility checks

- Capture m1–m6 equivalents using deterministic existing test doubles/fixtures and the real components. Keep fixture data and screenshot helpers out of production UI. Compare at 350px width, matching usable content height after excluding the prototype's host title bar, border, and outside shadow. Account for the supplied PNGs' approximately 2× scale.
- Record the planned differences explicitly: static scope caption, retained Clear during review, no timer, cards outside bubbles, existing Markdown analysis, retained restore placement/no date, ordinary disabled placeholder, 34px textarea geometry, and no invented rejection follow-up. Do not reproduce the prototype's horizontal overflow or clipped content.
- Check 300px, 350px, and 500px widths, short and tall panes, browser zoom/enlarged text, long sheet names, long messages, code blocks, tables, many inference regions, and a long transcript. Header/footer controls remain reachable; textarea growth does not displace them beyond the pane.
- Verify actual font metrics, padding, borders, radii, bubble alignment, button hover/disabled styles, live streaming repaint, transcript auto-scroll, and absence of page-level horizontal scrolling. jsdom cannot establish these results.
- Tab through sign-in, sign-out, Clear, Restore, input, Send, and review controls in their visible reading order. Hidden composer/review controls are not focusable. Verify focus rings, readable statuses, reduced motion, and announcement of streamed/error content without changing existing focus behavior.

### Sideloaded Excel checks

Follow the existing [local setup instructions](../../README.md#run-locally) and exercise sign-in success/failure, sign-out/sign-in with retained page instances, empty chat, streaming, clarification, both preprocessing decisions, both regular edit decisions, accepted-edit analysis, scenario creation/comparison, restore, and failure states. Confirm that the host supplies its own title bar, assets load, textarea resize observers work, and workflow/worksheet outcomes match the current add-in.

Changing worksheets must still affect subsequent requests exactly as before; the static scope caption makes no claim to display a live sheet name. Do not add activation/rename listeners during verification to make it resemble the prototype more closely.

Completion requires the applicable visual states to match the agreed design treatment, the documented differences to remain explicit, the TypeScript component tree to remain unchanged, and functional regression checks to pass. This document is a plan only; it does not claim those implementation checks have already run.
