# FIP: Separate Review Footer State from the Transcript

## Behavior

Use one reusable Accept/Reject footer for the current pending edit, independent of transcript history. Preserve the [visual redesign](./taskpane-visual-redesign-fip.md), worksheet operations, model requests, and checkpoint behavior.

- In `pending_edit` or `pending_edit_preprocessed`, show the footer and hide/disable the textarea and Send. The user must accept or reject before submitting another message in that conversation.
- In `answered`, `awaiting_clarification`, or `errored`, hide the footer and enable input. Clarification submissions continue the existing request.
- While an asynchronous action runs, hide the footer, show disabled input, and disable Restore. Transcript updates must not re-enable controls. After processing, use the resulting workflow state.
- Either preprocessing decision continues the original request with input disabled. If another edit needs review, reuse the same footer.
- Show the actual diff name as soon as the workflow enters either pending state. Keep the warning during Accept/Reject processing until the workflow leaves that state; otherwise show `Active worksheet`. Retained pending-edit data after an error must not display review controls.
- Preserve Clear, Restore, and sign-out behavior. Clear and Restore remain explicit ways to leave review without choosing Accept/Reject; concurrent Clear and cancellation behavior are outside scope. Confirmation messages, inference results, working messages, and Restore dividers remain in the transcript.

## Interface Points

### Existing interface points to change

DOM construction retains the buttons, control configuration updates them, and transcript rendering stops managing them:

- `createInitialDom()`: append `createReviewButtons(handlers)` once inside the hidden footer.
- `createDiffReviewDivider()`: rename it to `createReviewButtons()` and remove its disabled parameter and per-button disabled assignments.
- `disableChatControls()`: hide review actions at action start while preserving input and Restore disabling.
- `configChatControls()`: retain its existing signature and pending-state check to configure input and footer visibility.
- `renderChatTranscript()`: remove footer, input-visibility, and scope-strip updates and the `diff_review` branch.

Workflows stop managing review transcript entries and update the warning beside the state transitions it describes:

- `ChatTranscriptItem`, `appendDiffReviewTranscriptItemAndRender()`, and `removeDiffReviewTranscriptItem()`: delete the review variant and its two dedicated helpers.
- `processModelResponse()` in `chat-window.ts` and `finalizeTransition()` in `workflows/preprocess.ts`: replace their review-entry append calls with warning updates immediately after assigning the pending state.
- `setup()` in `workflows/accept-diff.ts` and `workflows/reject-diff.ts`: delete their review-entry removal calls and imports.
- `finalize()` in the accept/reject workflows: clear the warning when the decision succeeds and the state becomes `answered`.
- `ChatWindow.reset()` and `ChatWindow.appendErrorMessage()`: clear the warning when resetting or entering `errored`, and remove the obsolete review-entry cleanup condition.
- `runRestoreWorkflow()`: update the warning after replacing chat state with the restored snapshot.

### New interface points to create

State transitions share one helper for the informational warning:

- `updateReviewWarning(mount, diffSheetName)`: display the warning for the supplied diff name or restore `Active worksheet` when it is `undefined`.

The existing control functions update the footer directly. Test and specification updates are covered under Verification.

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

Keep `isPendingEditState()` private to `ChatWindow`, with its existing implementation and validation usage. `configChatControls()` retains its existing pending-state check. `ChatWindow` keeps its existing control-configuration calls; warning updates run separately beside the relevant state assignments. No predicate is exported or moved to `chat-window-state.ts`.

Do not combine `workflowState` and `pendingEdit` into a new discriminated state model in this change. In particular, errors may retain pending-edit data for existing cleanup behavior even though Accept/Reject is no longer legal. Preserve that distinction.

### `ChatWindow` event boundary

For the existing asynchronous event branch in `updateState()`, use this order:

1. Call `disableChatControls()` synchronously before the first awaited operation. It disables input/Restore and hides the review footer.
2. Keep `validateInputForCurrentState(event)` in its existing position inside the `try` block, followed by the same submit, accept, reject, or restore workflow.
3. Preserve the existing catch and `appendErrorMessage()` path unchanged.
4. In `finally`, call `configChatControls()` with the current transcript and workflow state using its existing arguments. This includes a replacement state produced by restore; do not capture the old state before awaiting the workflow.

The `clear` branch retains its existing `reset()` path. `reset()` creates the same initial conversation and calls `updateReviewWarning(this.state.mount, undefined)`. Do not add footer-specific reset state.

Keep the existing submission rules: `answered`, `errored`, and `awaiting_clarification` permit submission; the two pending states permit Accept/Reject. Keep `isTerminalTurnState()` and the existing Restore validation behavior. Validation and invalid-event handling remain unchanged.

Input and review event handlers still enter `ChatWindow.updateState()`. Native disabled controls suppress repeated clicks and form submissions while an action runs. This plan does not add scheduling or support for overlapping programmatic workflow calls, which the existing implementation does not serialize.

### `chat-window-dom.ts`: construct review buttons once

In `createInitialDom()`:

- Create the existing `.chat-review-footer` once, with `hidden = true`.
- Append `createReviewButtons(handlers)` once. The existing helper creates the Accept/Reject buttons and binds `handlers.onAccept` / `handlers.onReject`.
- Keep the footer outside the input mount and transcript. Keep the same `ChatInput` constructor and `ResizeObserver` wiring.

Rename `createDiffReviewDivider()` to `createReviewButtons()` and remove its disabled parameter and per-button disabled assignments. Move its call site from transcript rendering to initial construction. No CSS or template changes are needed.

Retain the same footer and button elements through streaming, repeated reviews, Clear, and Restore. Do not empty the footer, replace its buttons, bind handlers again, or store duplicate DOM references in another object.

### `chat-window-dom.ts`: update controls from the action lifecycle

Both existing control functions keep their signatures and update the retained footer's visibility and the input mount directly. Review buttons remain enabled; hiding their container prevents normal user interaction. Neither function updates the warning strip or recreates buttons.

`disableChatControls()` keeps its current signature. It:

- marks only Restore transcript entries disabled;
- sends `ChatInput.updateState({ type: "set_disabled", disabled: true })`;
- shows the input mount and hides the footer; and
- renders the transcript to update Restore controls as today.

`configChatControls()` retains its existing arguments. It:

- marks Restore entries in `entries` enabled as today;
- retains `isPendingEdit = state === "pending_edit" || state === "pending_edit_preprocessed"` and uses it to disable input through `ChatInput.updateState()`;
- sets input-mount and footer visibility from `isPendingEdit`; and
- renders the transcript for its existing Restore-control updates.

Temporary disabling is applied explicitly at action start rather than by a stored boolean. Only construction/reset and the outer action's `finally` configure settled controls. Transcript helpers and nested workflows must not call `configChatControls()` midway through processing.

### Warning updates at state transitions

`updateReviewWarning()` only updates the scope strip. With a defined diff name, add `review-pending` and display the existing warning using safe DOM text insertion. With `undefined`, remove the class and restore `Active worksheet`. It does not inspect the transcript or change controls.

Call it immediately after assigning a pending workflow state in `processModelResponse()` and preprocessing's `finalizeTransition()`, passing `state.chatState.pendingEdit.diffSheetName`. Accept/reject `finalize()` clears it after setting `answered`, before analysis or continuation. `ChatWindow.reset()` and `appendErrorMessage()` clear it after their respective state assignments, even if error cleanup retains pending-edit data.

After `runRestoreWorkflow()` replaces chat state, use the restored workflow state to select its pending diff name or `undefined`. Do not clear the warning merely because an action starts: it remains while worksheet operations are resolving the pending edit. No additional validation or stored warning state is introduced.

### Transcript and workflow changes

`renderChatTranscript()` continues to render message, formula-inference, working, and Restore entries in order and auto-scroll the transcript. Remove its queries for the footer, input mount, and scope strip; it neither changes nor reconstructs those regions.

Delete the `diff_review` transcript variant and its two append/remove helpers. The structured inference entry and decision-message annotations remain unchanged.

At both pending-edit creation sites, keep the actual diff creation followed by the `pendingEdit` assignment and pending workflow-state assignment. Replace the subsequent review-entry append with the warning update. The outer `finally` still displays the one footer after the workflow completes; no extra transcript render is needed at those sites.

At both accept/reject setup sites, delete only the review-entry removal. The outer action-start path has already hidden the footer before any worksheet work begins. Preserve all working messages, source/diff operations, confirmation messages, LLM history updates, restore promotion/discard, and analysis/continuation calls.

In `appendErrorMessage()`, keep the existing distinction between cleanup for the pending workflow and cleanup without a pending edit. Remove only the now-impossible `diff_review` match; continue removing the relevant working entries and setting `errored`. The outer `finally` hides review according to that state even if `pendingEdit` survives.

### Transition walkthroughs

| Trigger or outcome                   | Control path                         | Result                                                                                                         |
| ------------------------------------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Initial construction or Clear        | `reset → configChatControls`         | No review; existing input/draft behavior                                                                       |
| Submit from an allowed state         | `disableChatControls`                | Input disabled while existing request/preprocessing runs                                                       |
| Reply answers or asks clarification  | Outer `finally → configChatControls` | Input enabled according to `answered` or `awaiting_clarification`                                              |
| Regular or preprocessing diff ready  | Outer `finally → configChatControls` | Input hidden/disabled; one review footer for the actual diff                                                   |
| Accept/Reject starts                 | `disableChatControls`                | Footer hidden; input visible but disabled; warning remains until the pending state ends                        |
| Accepted edit enters analysis        | Transcript updates only              | Input stays disabled until analysis and the outer action finish                                                |
| Preprocessing decision continues     | Nested workflows; state transitions  | No intermediate input enablement; a new pending edit reuses the footer after the outer action finishes         |
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
- Verify that warning updates follow entry into pending review, successful decisions, errors, Clear, and Restore, independently of control configuration. Hold worksheet deletion open and verify that the warning remains until the pending state ends.
- Hold a mocked action open and verify that the review footer stays hidden and input/Send and Restore remain disabled. Transcript updates during that interval do not show the footer, re-enable the disabled controls, or recreate review buttons.

### Singleton rendering and workflow coverage

- Verify exactly one pair of review buttons is constructed and reused across regular review, accepted/rejected preprocessing followed by another review, and transcript updates. Assert retained element identity where it establishes that streaming cannot destroy the focused control; do not test incidental IDs or class-name formats.
- Verify the footer remains outside the transcript and input form, while the input component, mount, form, and draft are retained. Update existing tests that expect the hidden footer to be empty: it now contains its retained buttons.
- Replace review-entry fixtures with workflow-state setup in component tests and workflow-state inputs for control tests and diff-name inputs for warning tests. Verify the correct diff name after sequential reviews, including preprocessing and a later edit sharing a workflow ID.
- Check that acceptance still applies the same cells, deletes the diff, creates the same checkpoint, and runs the same analysis; rejection still leaves the source unchanged and creates no checkpoint. Preprocessing continuation must not briefly enable submission.
- Check Clear, Restore during pending review, earlier structured inference content surviving restore, and failures with retained pending-edit data. Preserve the actual existing checkpoint boundary, including the no-edit preprocessing case that already retains the request in its snapshot.
- Confirm that transcript entries never contain `diff_review`, and review behavior does not depend on message text, transcript ordering, or the presence of a working entry.

### Integration checks

Follow [Testing](../developer/testing.md). Update the existing unit/component tests and their implementation specification rather than adding a test framework. Run `npm run test:unit` for behavior and TypeScript checks, `npx tsc --noEmit --project tests/tsconfig.live.json` for integration-consumer types, `npm run lint`, and `npm run build`. No model prompts or live integration tests need to change.

In a browser and sideloaded Excel pane, verify unchanged footer/input layout, keyboard focus, disabled behavior, sheet warning, and input autosizing across both review states and processing. The implementation is complete when one retained footer reflects legal review states, no review entry remains in history, and the existing workflow regression checks pass.
