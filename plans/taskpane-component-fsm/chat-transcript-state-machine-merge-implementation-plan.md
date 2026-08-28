# Chat Transcript State-Machine Merge Implementation Plan

Status: implemented.

## Behavior

The FSM taskpane preserves the current chat layout and all existing conversation, streaming, preprocessing, edit-review, scenario, restoration, error, and control-state behavior. `ChatTranscript` directly owns that behavior instead of delegating each event to a separate `ChatStateMachine` instance.

The following FSM taskpane actions remain unchanged:

| Action                   | Behavior                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| Submit a message         | Clear the input, disable controls, run the existing workflow, and preserve streamed updates. |
| Answer a clarification   | Continue the existing workflow and conversation history.                                     |
| Accept or reject a diff  | Preserve the current Excel, transcript, continuation, and control behavior.                  |
| Restore an accepted edit | Restore the worksheet and truncate the conversation at the same restore point.               |
| Clear the conversation   | Restore the welcome message and reset all counters, pending edits, and restore state.        |
| Sign out and sign in     | Preserve the FSM `ChatTranscript` instance and its conversation as it does today.            |

The terminal `ChatFsmState` variants and valid update events remain unchanged. Transient workflow activity does not become additional FSM state.

This feature intentionally duplicates the state-machine implementation for the two taskpane architectures. The existing `src/taskpane/pages/chat/chat-state-machine/chat-state-machine.ts` remains the state owner for the current taskpane and its tests. The FSM copy is merged into `src/taskpane-fsm/pages/chat/chat-transcript.ts`, where `ChatTranscript` becomes the direct owner of the copied state fields and transition methods. Keeping those implementations synchronized after this feature is a temporary migration cost.

This feature does not implement the FSM-native rendering follow-up. `LegacyChatRendering`, the retained transcript root, and direct DOM updates during working and streaming transitions remain unchanged.

## Interface Points

Existing interface points that must change:

- `ChatTranscript` in `src/taskpane-fsm/pages/chat/chat-transcript.ts`: replace its owned `ChatStateMachine` instance with a taskpane-FSM-local copy of the existing state fields and transition methods.
- `ChatTranscript.updateState()` in `src/taskpane-fsm/pages/chat/chat-transcript.ts`: handle clear, submit, accept, reject, and restore directly instead of delegating to `ChatStateMachine.updateState()`.

New interface points that must be created:

- None.

The existing `ChatTranscriptUpdateEvent`, `LegacyChatRendering`, `ChatStateMachineInput`, `ChatStateMachineUI`, chat types, workflow modules, Excel utilities, and current-taskpane interfaces retain their public shapes.

## Implementation Details

### Reuse boundary

Use `src/taskpane/pages/chat/chat-state-machine/chat-state-machine.ts` as the source for the FSM implementation, but do not modify, move, rename, or re-export that file. Copy its imports, state fields, reset logic, transition methods, transcript helpers, restore helpers, counters, validation, error mapping, and module-level formula-inference merge helper into the existing `ChatTranscript` module.

Do not create another `ChatStateMachine` class under `src/taskpane-fsm`. The destination of the copy is the existing `ChatTranscript` class so that the component, rather than another composed object, owns the FSM copy.

Continue importing the shared `ChatState`, transcript, workflow-event, Excel, pending-edit, and restore-point types from `src/taskpane/pages/chat/chat-state-machine/chat-types.ts`. Continue calling the existing workflow and Excel utility modules from their current locations. Do not copy those shared modules.

### ChatTranscript

Remove the `ChatStateMachine` import and `chatStateMachine` field. Add the copied state directly to `ChatTranscript`:

- `chatState`;
- `restorePoints`;
- `potentialRestorePoints`;
- `nextDiffSheetNumber`;
- `nextScenarioSheetNumber`;
- `nextWorkflowId`; and
- `nextRestorePointId`.

Store `Excel` as the component's `ExcelApi`. Retain the existing construction order for the view: create the transcript element, construct `LegacyChatRendering` with that retained element and the transcript-owned action handlers, store the renderer, and then call the copied reset logic to populate the welcome message.

Keep `ChatTranscriptUpdateEvent` as `{ type: "clear" } | ChatStateMachineInput`. Implement one component transition entry point:

- `clear` runs the copied reset logic directly;
- `submit_message`, `accept_pending_diff`, `reject_pending_diff`, and `restore_to_point` run the copied disable, validation, workflow, error, and final control-configuration sequence directly.

Copy the existing transition and workflow methods without redesigning their call paths. Preserve the order of state mutation, Excel operations, OpenRouter workflow events, transcript updates, counter increments, restore-point changes, error handling, and final control configuration. Keep `buildChatTranscript()` as a private helper used to produce the renderer input. Do not copy test-only public accessors that are not needed by `ChatTranscript` behavior.

Replace only the copied `ChatStateMachineUI` call sites:

- `renderChatTranscript()` calls `this.legacyChatRendering.renderTranscript(...)`;
- `disableChatControls()` calls `this.legacyChatRendering.disableChatInputControls()` before rendering the disabled transcript entries;
- `configChatControls()` renders the enabled transcript entries and then calls `this.legacyChatRendering.configChatControls(...)`.

Retain the current `createElement()` and `genView()` behavior. `createElement()` still runs once, and `genView()` still returns the same retained root. Clear, form submit, accept, reject, and restore handlers continue sending `ChatTranscriptUpdateEvent` values to the component's own `updateState()` method.

### LegacyChatRendering

Do not change its rendering behavior or retained-element lifecycle. `ChatTranscript` stores the existing adapter and calls its three public methods directly. Leave its `ChatStateMachineUI` conformance in place because that interface is still used by the untouched current taskpane.

### Current taskpane and shared state machine

Do not change:

- `src/taskpane/pages/chat/chat-state-machine/chat-state-machine.ts`;
- `src/taskpane/pages/chat/chat-page.ts`;
- `src/taskpane/taskpane.ts`;
- the taskpane implementation selector; or
- existing unit and integration tests that exercise `ChatStateMachine`.

The current taskpane continues instantiating the original state machine. The FSM taskpane no longer imports or instantiates it.

### Deferred rendering follow-up

Do not replace `LegacyChatRendering`, generate fresh transcript roots, add presentation outputs, or invoke the global renderer during chat transitions. Those changes belong to follow-up #2. This feature changes state ownership only.

## Verification

- Build the current taskpane selection and verify it still uses the untouched `ChatStateMachine` implementation.
- Build the FSM taskpane selection and verify `ChatTranscript` no longer imports, stores, or constructs `ChatStateMachine`.
- Run the existing unit tests unchanged against the original state machine.
- Verify the FSM taskpane initially renders the existing welcome message and control states.
- Submit a message and verify the input clears, controls disable, working status appears, responses stream, and controls recover.
- Exercise clarification, preprocessing, normal edits, scenario sheets, Accept, Reject, and Restore and verify parity with the current taskpane.
- Trigger each existing failure path and verify its transcript message and final control state remain unchanged.
- Verify Clear resets the copied conversation state, counters, pending edits, and restore state.
- Sign out and sign in and verify the FSM transcript instance and conversation remain preserved.
- Verify `git diff` contains no change to the original `chat-state-machine.ts` or current-taskpane modules.
- Run `npm run lint`, both production builds, and `git diff --check`.
- Do not add or modify tests, and do not start the development server.
