# Chat Transcript Pure Helper Extraction Plan

Status: DOM helper extraction implemented. The formatting and state-helper extractions remain proposed for review.

## Behavior

Preserve the current transcript FSM, DOM, handlers, LLM and Excel workflows, and component state ownership. Extracted functions receive all required values as arguments rather than reading `ChatTranscript` fields implicitly.

## Scope

Change `src/taskpane-fsm/pages/chat/chat-transcript.ts` and add three focused modules beside it:

- `chat-transcript-dom.ts` for explicit DOM updates and detached element factories;
- `chat-transcript-formatting.ts` for formula-result text formatting; and
- `chat-transcript-state.ts` for pure state copies, queries, and validation.

Do not change `ChatPage`, shared chat types, HTML, CSS, workflows, services, component interfaces, dependencies, or tests.

## Extracted Functions

### DOM helpers

Move these functions to `chat-transcript-dom.ts`:

- `createInitialDom()`;
- `renderChatTranscript()`;
- `disableChatControls()`;
- `configChatControls()`;
- `createChatMessage()`;
- `createWorkingMessage()`;
- `createRestoreDivider()`; and
- `createDiffReviewDivider()`.

The exported helpers receive the component mount, transcript entries, FSM state, and handlers explicitly as needed. Restore, Accept, Reject, Clear, and Submit callbacks are supplied by `ChatTranscript`. The element factories remain internal to the DOM module.

These helpers may update the supplied mount and transcript entries, but they do not access a `ChatTranscript` instance or retain state. `ChatTranscript` remains the owner because its constructor and `updateState()` call paths invoke the helpers with its permanent mount and current state.

Move the `DOMPurify` and `marked` imports to this module because only message-element creation uses them.

### Formula-result formatting

Move the existing file-level functions to `chat-transcript-formatting.ts`:

- `formatFormulaInferencePlan()`; and
- `formatFormulaInferenceRegionResult()`.

Export them and import them into `ChatTranscript` without changing their inputs or output text.

### Pure state helpers

Move or convert these methods in `chat-transcript-state.ts`:

- `validateInputForCurrentState()` becomes a function receiving the input and current `ChatFsmState`;
- `getErrorMessage()`;
- `isTerminalTurnState()`;
- `isPendingEditState()`;
- `hasTranscriptMessage()` becomes a function receiving the transcript and target entry;
- `getWorkflowHumanMessage()` becomes a function receiving the transcript and workflow ID;
- `copyChatState()`;
- `copyPendingEdit()` as an internal helper used by `copyChatState()`;
- `copySheetSnapshot()`; and
- `buildChatTranscript()` becomes a function receiving transcript entries and returning the same structured clone.

These functions must not modify their inputs. Keep their current behavior, including validation errors and object-identity checks.

## Functions That Stay on `ChatTranscript`

Keep all remaining methods that own or coordinate component behavior:

- `updateState()`, `reset()`, and all async workflow methods;
- transcript mutation methods such as append, upsert, insert, remove, and update;
- restore-point creation and counter management; and
- methods that invoke LLM, Excel, key, or sheet services.

Call the extracted helpers with explicit component state and callbacks. Do not introduce a helper class, shared mutable object, or second owner of `ChatState`.

## Verification

- Build the `taskpane-fsm` implementation and run lint and existing unit tests.
- Verify all transcript markup and sanitized Markdown output remains unchanged.
- Verify submit, clear, restore, accept, and reject handlers still call `ChatTranscript.updateState()`.
- Verify validation, error messages, restore snapshots, and transcript cloning remain unchanged.
- Verify extracted state helpers do not mutate their inputs and DOM helpers access only their explicit arguments.
- Verify `ChatTranscript` remains the owner of its state, counters, permanent mount, and live DOM, with mutations initiated through its constructor or `updateState()` call paths.
- Verify no files outside the four listed in scope are changed by implementation.
- Run `git diff --check`.

Do not add or change tests as part of this narrowly scoped extraction.
