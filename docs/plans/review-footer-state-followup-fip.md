# FIP: Separate Review Footer State from the Transcript

## Behavior

Use one reusable Accept/Reject footer for the current pending edit, independent of transcript history. Preserve the [visual redesign](./taskpane-visual-redesign-fip.md), worksheet operations, model requests, and checkpoint behavior.

- In `pending_edit` or `pending_edit_preprocessed`, show the footer and hide/disable the textarea and Send. The user must accept or reject before submitting another message in that conversation.
- In `answered`, `awaiting_clarification`, or `errored`, hide the footer and enable input. Clarification submissions continue the existing request.
- While an asynchronous action runs, hide/disable the footer, show disabled input, and disable Restore. Transcript updates must not re-enable controls. After processing, use the resulting workflow state.
- Either preprocessing decision continues the original request with input disabled. If another edit needs review, reuse the same footer.
- Show the actual diff name in the warning strip only during review; otherwise show `Active worksheet`. Retained pending-edit data after an error must not display review controls.
- Preserve Clear, Restore, and sign-out behavior. Clear and Restore remain explicit ways to leave review without choosing Accept/Reject; concurrent Clear and cancellation behavior are outside scope. Confirmation messages, inference results, working messages, and Restore dividers remain in the transcript.

## Interface Points

### Existing interface points to change

The control lifecycle needs six existing functions to change plus one helper rename; only `configChatControls()` needs different parameters. `ChatWindow` supplies the workflow state and diff name at its existing completion/reset call sites:

- `ChatWindow.updateState()`: retain the workflow-state argument and additionally pass `pendingEdit?.diffSheetName` to `configChatControls()` in the existing `finally` block.
- `ChatWindow.reset()`: retain the workflow-state argument and pass `undefined` for the diff name because reset creates an answered conversation.

DOM construction retains the buttons, control configuration updates them, and transcript rendering stops managing them:

- `createInitialDom()`: append `createReviewButtons(true, handlers)` once inside the hidden footer.
- `createDiffReviewDivider()`: rename it to `createReviewButtons()` while retaining its parameters and button-construction logic.
- `disableChatControls()`: hide/disable review actions at action start while preserving input and Restore disabling.
- `configChatControls()`: retain its workflow-state argument and pending-state check, adding a diff-name argument for the review warning.
- `renderChatTranscript()`: remove footer, input-visibility, and scope-strip updates and the `diff_review` branch.

Removing the transcript representation also requires the following deletions; the affected workflows keep their signatures and existing state transitions:

- `ChatTranscriptItem`, `appendDiffReviewTranscriptItemAndRender()`, and `removeDiffReviewTranscriptItem()`: delete the review variant and its two dedicated helpers.
- `processModelResponse()` in `chat-window.ts` and `finalizeTransition()` in `workflows/preprocess.ts`: delete their review-entry append calls and imports.
- `setup()` in `workflows/accept-diff.ts` and `workflows/reject-diff.ts`: delete their review-entry removal calls and imports.
- `ChatWindow.appendErrorMessage()`: delete the review-entry condition from transcript cleanup.

### New interface points to create

None. The existing control functions update the footer directly. Test and specification updates are covered under Verification.

## Implementation Details

### State and component ownership

Retain the existing component tree:

```text
ChatPage
|-- ChatHeader
`-- ChatWindow
    `-- ChatInput
```

`ChatWindow` continues to own the scope strip, transcript, input mount, and review footer. `ChatInput` owns the form below its permanent mount. The input mount itself carries the composer styling; do not reintroduce a composer wrapper.

Use the existing state without adding fields:

- `ChatState.workflowState` determines whether review is legal when an action finishes.
- `ChatState.pendingEdit` supplies the worksheet names and workflow ID required by the existing edit workflows. Both pending states require this object under the existing invariant.
- The existing action-start/completion call paths determine when controls are temporarily disabled. Do not encode that temporary presentation in transcript entries or restore snapshots.

Keep `isPendingEditState()` private to `ChatWindow`, with its existing implementation and validation usage. `configChatControls()` retains its existing pending-state check. `ChatWindow` passes the current workflow state and `this.state.chatState.pendingEdit?.diffSheetName`; `reset()` passes its new answered state and `undefined`. No predicate is exported or moved to `chat-window-state.ts`.

Do not combine `workflowState` and `pendingEdit` into a new discriminated state model in this change. In particular, errors may retain pending-edit data for existing cleanup behavior even though Accept/Reject is no longer legal. Preserve that distinction.

### `ChatWindow` event boundary

For the existing asynchronous event branch in `updateState()`, use this order:

1. Call `disableChatControls()` synchronously before the first awaited operation. It disables input/Restore and hides/disables the review footer.
2. Keep `validateInputForCurrentState(event)` in its existing position inside the `try` block, followed by the same submit, accept, reject, or restore workflow.
3. Preserve the existing catch and `appendErrorMessage()` path unchanged.
4. In `finally`, pass the current transcript, workflow state, and `this.state.chatState.pendingEdit?.diffSheetName` to `configChatControls()`. This includes a replacement state produced by restore; do not capture the old state before awaiting the workflow.

The `clear` branch retains its existing `reset()` path. `reset()` creates the same initial conversation and passes `undefined` for the review diff name. Do not add footer-specific reset state.

Keep the existing submission rules: `answered`, `errored`, and `awaiting_clarification` permit submission; the two pending states permit Accept/Reject. Keep `isTerminalTurnState()` and the existing Restore validation behavior. Validation and invalid-event handling remain unchanged.

Input and review event handlers still enter `ChatWindow.updateState()`. Native disabled controls suppress repeated clicks and form submissions while an action runs. This plan does not add scheduling or support for overlapping programmatic workflow calls, which the existing implementation does not serialize.

### `chat-window-dom.ts`: construct review buttons once

In `createInitialDom()`:

- Create the existing `.chat-review-footer` once, with `hidden = true`.
- Append `createReviewButtons(true, handlers)` once. The existing helper creates the Accept/Reject buttons, initializes both as disabled, and binds `handlers.onAccept` / `handlers.onReject`.
- Keep the footer outside the input mount and transcript. Keep the same `ChatInput` constructor and `ResizeObserver` wiring.

Rename `createDiffReviewDivider()` to `createReviewButtons()`, retaining its parameters and body. Move its call site from transcript rendering to initial construction. No CSS or template changes are needed.

Retain the same footer and button elements through streaming, repeated reviews, Clear, and Restore. Do not empty the footer, replace its buttons, bind handlers again, or store duplicate DOM references in another object.

### `chat-window-dom.ts`: update controls from the action lifecycle

Add the diff name to the existing control-configuration signature:

```ts
configChatControls(
  mount: HTMLElement,
  entries: ChatTranscriptEntry[],
  state: ChatWorkflowStateVals,
  handlers: ChatWindowDomHandlers,
  chatInput: ChatInput,
  diffSheetName: string | undefined
): void;
```

Both existing control functions query the retained footer, its buttons, the input mount, and the scope strip and update them directly. They do not recreate the buttons or call a separate footer-rendering helper.

`disableChatControls()` keeps its current signature. It:

- marks only Restore transcript entries disabled;
- sends `ChatInput.updateState({ type: "set_disabled", disabled: true })`;
- shows the input mount, hides the footer, and disables both review buttons;
- removes the scope strip's `review-pending` class and restores `Active worksheet`; and
- renders the transcript to update Restore controls as today.

`configChatControls()` retains its existing arguments and adds `diffSheetName` as the last argument. It:

- marks Restore entries in `entries` enabled as today;
- retains `isPendingEdit = state === "pending_edit" || state === "pending_edit_preprocessed"` and uses it to disable input through `ChatInput.updateState()`;
- sets input-mount visibility, footer visibility, review-button availability, and the scope strip's `review-pending` class from `isPendingEdit`;
- displays the existing diff warning using safe DOM text insertion when pending, or restores `Active worksheet` when not pending; and
- renders the transcript for its existing Restore-control updates.

Pending states supply a diff name under the existing pending-edit invariant. Workflow state controls review availability; the diff name supplies the warning text. In a non-pending state, `configChatControls()` hides review even when a retained `pendingEdit` supplied a name. No additional validation is introduced.

Temporary disabling is applied explicitly at action start rather than by a stored boolean. Only construction/reset and the outer action's `finally` configure settled controls. Transcript helpers and nested workflows must not call `configChatControls()` midway through processing.

### Transcript and workflow changes

`renderChatTranscript()` continues to render message, formula-inference, working, and Restore entries in order and auto-scroll the transcript. Remove its queries for the footer, input mount, and scope strip; it neither changes nor reconstructs those regions.

Delete the `diff_review` transcript variant and its two append/remove helpers. The structured inference entry and decision-message annotations remain unchanged.

At both pending-edit creation sites, keep the actual diff creation followed by the `pendingEdit` assignment and pending workflow-state assignment. Delete the subsequent review-entry append. The outer `finally` displays the one footer after the workflow completes; no replacement UI callback or extra transcript render is needed at those sites.

At both accept/reject setup sites, delete only the review-entry removal. The outer action-start path has already hidden/disabled the footer before any worksheet work begins. Preserve all working messages, source/diff operations, confirmation messages, LLM history updates, restore promotion/discard, and analysis/continuation calls.

In `appendErrorMessage()`, keep the existing distinction between cleanup for the pending workflow and cleanup without a pending edit. Remove only the now-impossible `diff_review` match; continue removing the relevant working entries and setting `errored`. The outer `finally` hides review according to that state even if `pendingEdit` survives.

### Transition walkthroughs

| Trigger or outcome                   | Control path                         | Result                                                                                                         |
| ------------------------------------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Initial construction or Clear        | `reset → configChatControls`         | No review; existing input/draft behavior                                                                       |
| Submit from an allowed state         | `disableChatControls`                | Input disabled while existing request/preprocessing runs                                                       |
| Reply answers or asks clarification  | Outer `finally → configChatControls` | Input enabled according to `answered` or `awaiting_clarification`                                              |
| Regular or preprocessing diff ready  | Outer `finally → configChatControls` | Input hidden/disabled; one review footer for the actual diff                                                   |
| Accept/Reject starts                 | `disableChatControls`                | Footer hidden/disabled; input visible but disabled                                                             |
| Accepted edit enters analysis        | Transcript updates only              | Input stays disabled until analysis and the outer action finish                                                |
| Preprocessing decision continues     | Nested workflows; transcript only    | No intermediate input enablement; a new pending edit reuses the footer after the outer action finishes         |
| Restore starts while review is shown | `disableChatControls`, then restore  | Footer hidden; existing pending-diff cleanup and snapshot replacement run                                      |
| Restore completes                    | Outer `finally → configChatControls` | Presentation derived from the restored workflow state, not transcript contents                                 |
| An action fails                      | Error handler, then outer `finally`  | Existing `errored` behavior; no stale review controls or false completion strip                                |

### Restore, documentation, and scope

`RestoreManager` needs no new fields, clone logic, migration, or footer cleanup. It continues copying `ChatState`; the removed review variant simply stops appearing in new snapshots. The transcript is held in memory, so there is no persisted transcript migration.

Keep Restore entries and their existing disabled flags in this change. Removing all transient state from Restore entries would be a separate refactor and is not necessary to remove the singleton review from history.

Update Application Architecture's control-flow description and the relevant implementation specification to describe current-state review. Component Architecture and its implementation guide remain unchanged because the component contract is unchanged. Keep the earlier visual redesign FIP as the record of that implementation; this FIP supersedes its review-entry modeling.

## Verification

### State and interaction coverage

- Cover all five settled workflow states. Verify that only the two pending states show review and disable submission, while a retained pending-edit object in `errored` does not show the footer.
- For both pending states, attempt submission through Send, Enter, and form submission. UI actions do nothing while disabled and issue no requests; the pending state and current diff remain intact.
- Hold a mocked action open and verify that Accept/Reject, input/Send, and Restore cannot be activated through their disabled controls. Transcript updates during that interval do not re-enable them or recreate review buttons.

### Singleton rendering and workflow coverage

- Verify exactly one pair of review buttons is constructed and reused across regular review, accepted/rejected preprocessing followed by another review, and transcript updates. Assert retained element identity where it establishes that streaming cannot destroy the focused control; do not test incidental IDs or class-name formats.
- Verify the footer remains outside the transcript and input form, while the input component, mount, form, and draft are retained. Update existing tests that expect the hidden footer to be empty: it now contains its retained, disabled buttons.
- Replace review-entry fixtures with workflow-state setup in component tests and workflow-state and diff-name inputs in DOM-helper tests. Verify the correct diff name after sequential reviews, including preprocessing and a later edit sharing a workflow ID.
- Check that acceptance still applies the same cells, deletes the diff, creates the same checkpoint, and runs the same analysis; rejection still leaves the source unchanged and creates no checkpoint. Preprocessing continuation must not briefly enable submission.
- Check Clear, Restore during pending review, earlier structured inference content surviving restore, and failures with retained pending-edit data. Preserve the actual existing checkpoint boundary, including the no-edit preprocessing case that already retains the request in its snapshot.
- Confirm that transcript entries never contain `diff_review`, and review behavior does not depend on message text, transcript ordering, or the presence of a working entry.

### Integration checks

Follow [Testing](../developer/testing.md). Update the existing unit/component tests and their implementation specification rather than adding a test framework. Run `npm run test:unit` for behavior and TypeScript checks, `npx tsc --noEmit --project tests/tsconfig.live.json` for integration-consumer types, `npm run lint`, and `npm run build`. No model prompts or live integration tests need to change.

In a browser and sideloaded Excel pane, verify unchanged footer/input layout, keyboard focus, disabled behavior, sheet warning, and input autosizing across both review states and processing. The implementation is complete when one retained footer reflects legal review states, no review entry remains in history, and the existing workflow regression checks pass.
