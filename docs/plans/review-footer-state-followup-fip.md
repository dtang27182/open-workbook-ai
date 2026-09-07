# FIP Stub: Separate Review Footer State from the Transcript

## Behavior

Follow up on the [taskpane visual redesign](./taskpane-visual-redesign-fip.md) by removing Accept/Reject controls from the transcript model. There can be only one pending edit and one review footer at a time; the footer represents the current available action, not a historical conversation entry.

Preserve the redesigned footer's appearance, composer visibility, control availability, and action timing. Keep acceptance/rejection messages and restore checkpoints in the transcript. No worksheet operations, model requests, or user-visible workflow behavior change.

This is a planning stub for a separate refactor after the visual redesign. Expand the transition details before implementation.

## Interface Points

Existing interface points to change:

- `ChatTranscriptItem` and transcript helpers: remove the `diff_review` variant and its append/remove operations.
- `ChatWindow` / `ChatWindowState`: own the single review footer's presentation state alongside the existing pending-edit state, outside transcript history.
- `renderChatTranscript()`: render conversation history only; stop deriving footer and warning visibility from transcript entries.
- `disableChatControls()` and `configChatControls()`: update review controls directly rather than mutating a review transcript entry.
- Pending-edit creation, accept/reject, clear, error, and restore call paths: update the footer through its owning component when the current action changes.

New interface points to create:

- A focused review-footer rendering helper in `chat-window-dom.ts`: update the existing footer, warning strip, and composer visibility from explicit current review state.

## Implementation Details

- Keep the component hierarchy and permanent footer/composer containers established by the visual redesign. Keep all mutations within `ChatWindow.updateState()` and its helper/workflow call paths.
- Use the existing `pendingEdit` as the source of the diff/source sheet names and workflow ID. Do not copy those values into a second pending-edit model or infer them from transcript messages.
- Specify the minimal non-transcript presentation state needed for footer visibility and disabled controls. Map both pending workflow states, action start/completion, errors, clear, and restore before choosing its exact shape.
- Preserve the distinction between a pending edit and a visible review action: the current accept/reject workflows remove review controls before clearing `pendingEdit`, and errors can leave `pendingEdit` populated. Footer visibility must not depend solely on that object's presence.
- Remove the review entry, its presentation-only diff name, and its append/remove call sites once direct footer updates cover those transitions. Leave ordinary messages, working entries, and restore entries intact.
- Keep transient control state out of restore snapshots. After clear or restore, reconcile the footer with the resulting workflow state and current action; do not restore historical buttons or transient disabled flags from transcript data.
- Expand this stub with the exact state transitions and affected function signatures after the visual redesign is implemented. Avoid introducing a new component or broader workflow refactor unless that analysis demonstrates a need.

## Verification

- Confirm both regular and preprocessing reviews show one footer and no review transcript entry.
- Verify Accept/Reject, disabled controls, composer hide/show, and warning text retain their timing, including preprocessing that continues into another pending edit.
- Check clear, restore during pending review, errors with retained pending-edit data, and ordinary streaming renders for stale or duplicate controls.
- Preserve draft/input instances, restore history, acceptance/rejection messages, model requests, and worksheet outcomes.
- Follow the repository testing guidance; run focused component regressions, TypeScript checking through `npm run test:unit`, `npm run lint`, and `npm run build`, then verify footer transitions in a browser and Excel.
