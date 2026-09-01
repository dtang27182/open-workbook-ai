# Chat Transcript Rendering Integration Plan

Status: proposed for review. This plan folds `LegacyChatRendering` into the V2 `ChatTranscript` component and does not authorize runtime changes yet.

## Behavior

Move the existing transcript DOM-rendering methods into `ChatTranscript` without changing its FSM, workflows, markup, styles, control behavior, or event ownership. Copy Markdown functionality remains absent.

## Scope

Change only:

- `src/taskpane-fsm/pages/chat/chat-transcript.ts`; and
- delete `src/taskpane-fsm/pages/chat/legacy-chat-rendering.ts`.

Do not change `ChatPage`, shared chat types, `ChatStateMachineUI`, the original taskpane, chat HTML or CSS, LLM or Excel workflows, dependencies, build configuration, or tests. `ChatStateMachineUI` remains because the original taskpane state machine and existing tests still use it.

## Implementation

Remove the `LegacyChatRendering` import, field, and constructor initialization from `ChatTranscript`.

Move its DOM behavior into private `ChatTranscript` helpers:

- render transcript entries beneath `#chat-messages`;
- enable and disable the chat input and send button;
- create human and system messages;
- create working messages;
- create restore controls; and
- create accept and reject controls.

Import `DOMPurify` and `marked` directly into `chat-transcript.ts` for system-message rendering.

Keep the existing `renderChatTranscript()`, `disableChatControls()`, and `configChatControls()` call sites. Replace their delegation to `LegacyChatRendering` with direct DOM work against `rootElement` and private element-creation helpers.

Bind Restore, Accept, and Reject buttons directly to `ChatTranscript.updateState()` with their existing events. These handlers remain owned by `ChatTranscript`.

Keep `buildChatTranscript()` and its cloned rendering input unchanged. Do not move rendering statements into `updateState()` itself; the private helpers remain part of the `updateState()` call path as permitted by the implementation guide.

After all behavior has moved, delete `legacy-chat-rendering.ts` and verify that no `LegacyChatRendering` references remain.

## Verification

- Build the `taskpane-fsm` implementation and run lint and existing unit tests.
- Verify the welcome message and subsequent transcript entries render unchanged.
- Verify human, system, and working message markup remains unchanged.
- Verify submit, clear, restore, accept, and reject behavior remains unchanged.
- Verify input, send, restore, accept, and reject controls retain their existing enabled and disabled states.
- Verify system-message Markdown remains sanitized and rendered as before.
- Verify Copy Markdown buttons remain absent.
- Verify `ChatTranscript` performs all transcript DOM work through its own private helpers.
- Verify there are no remaining `LegacyChatRendering` references or file.
- Verify shared chat types, the original taskpane, HTML, CSS, and tests have no diff.
- Run `git diff --check`.

Do not add or change tests as part of this narrowly scoped migration.
