# Chat Component Implementation Plan

Status: proposed for review.

## Behavior

When the FSM taskpane is selected and an OpenRouter key is stored, the taskpane displays the existing chat layout, styling, and assistant behavior, except that it does not generate or display the Manage OpenRouter key URL. The chat page is implemented as a component composed from header and transcript child views while continuing to use the existing chat state machine, workflow modules, and direct DOM-update behavior.

Terminology:

- **Chat page**: the stateless container that composes `ChatHeader` and `ChatTranscript`.
- **Chat header**: the heading, OpenRouter connection details, and Sign Out button.
- **Chat transcript**: the state-owning component that instantiates `ChatStateMachine` and owns the messages, working indicators, diff-review controls, restore controls, Clear button, message input, and Send button.

The chat component behaves as follows:

| Situation                              | Visible behavior                                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Chat first becomes active              | Show the existing heading, provider details, welcome message, Clear button, message input, and Send button.                               |
| A message is submitted                 | Clear the input, disable chat input and review controls, append the human message and working indicator, and preserve existing streaming.  |
| A response streams                     | Update and scroll only the message list; do not replace the header or transcript controls.                                                |
| Clarification is requested             | Show the existing question and allow the next submitted message to continue the same workflow.                                             |
| A diff is ready                        | Show the existing Accept and Reject controls and keep the message input and Send button disabled until the diff is resolved.              |
| Accept or Reject is selected           | Preserve the existing Excel, transcript, continuation, analysis, and control-state behavior.                                               |
| Restore is selected                    | Preserve the existing worksheet restoration and conversation truncation behavior.                                                         |
| Clear is selected                      | Reset the conversation to the existing welcome message and reset the chat state machine counters and restore state.                       |
| Sign Out is selected                   | Clear the stored OpenRouter key and return to the authentication page without adding a second chat-state implementation.                    |

Human messages remain plain text. System messages continue to use `marked` and `DOMPurify`, including the existing Copy Markdown behavior. Working indicators, transcript labels, button text, accessibility attributes, CSS classes, and message ordering remain unchanged.

The existing Manage OpenRouter key link remains hidden in the FSM chat page. Generating and displaying its URL is outside this feature.

The existing terminal `ChatFsmState` variants remain unchanged. Reading worksheets, streaming responses, creating sheets, applying edits, and analyzing accepted changes do not become additional terminal FSM states.

This feature preserves the existing `ChatStateMachineUI` rendering mechanism. `ChatStateMachine` continues calling `renderTranscript`, `configChatControls`, and `disableChatInputControls` at the same points in every workflow. Those three methods and only their required DOM helpers are copied from the existing page into `legacy-chat-rendering.ts`, which targets the single transcript element retained by `ChatTranscript`.

This feature does not redesign conversation state, prompts, OpenRouter requests, Excel operations, diff sheets, scenario sheets, preprocessing, or restore points. Removing the existing `ChatStateMachineUI` callback interface and deriving all presentation state through new outputs is a separate follow-up after component parity is established.

## Interface Points

Existing interface points that must change:

- `ChatPage` in `src/taskpane-fsm/pages/chat/chat-page.ts`: replace the placeholder with a stateless container that constructs and composes `ChatHeader` and `ChatTranscript`.
- `TaskpaneComponent` in `src/taskpane-fsm/taskpane-component.ts`: supply the Sign Out handler to `ChatPage` and configure the OpenRouter client with its existing shared key store.

New interface points that must be created:

- `ChatHeader` in `src/taskpane-fsm/pages/chat/chat-header.ts`: generate the existing header and provider-link content and bind the taskpane-owned Sign Out handler.
- `ChatTranscript` in `src/taskpane-fsm/pages/chat/chat-transcript.ts`: instantiate and own the existing `ChatStateMachine`, create and retain one transcript DOM root containing every chat control, and handle clear, submit, accept, reject, and restore events.
- `ChatTranscriptUpdateEvent` in `src/taskpane-fsm/pages/chat/chat-transcript.ts`: represent clear plus the existing submit, accept, reject, and restore state-machine inputs.
- `LegacyChatRendering` in `src/taskpane-fsm/pages/chat/legacy-chat-rendering.ts`: contain the copied `renderTranscript`, `configChatControls`, and `disableChatInputControls` methods, retain the transcript element supplied at construction, and satisfy `ChatStateMachineUI`.
- `cloneChatPageElement()` in `src/taskpane-fsm/pages/chat/chat-page-template.ts`: clone an existing chat HTML element by selector so the FSM components reuse the current static markup.

The existing `ChatStateMachine`, `ChatStateMachineInput`, `ChatStateMachineUI`, chat transcript types, chat HTML fragment, chat CSS, `OpenrouterKeyStore`, OpenRouter client, LLM workflows, and Excel utilities retain their current public behavior.

## Implementation Details

### Reuse boundary

Leave `src/taskpane/pages/chat/chat-page.ts` unchanged. It remains the current-taskpane implementation and is not copied wholesale or used as the starting contents of the new FSM page.

Create a new FSM-native `src/taskpane-fsm/pages/chat/chat-page.ts`. Reuse the legacy implementation by copying only these methods from the existing page into `src/taskpane-fsm/pages/chat/legacy-chat-rendering.ts`:

- `renderTranscript`;
- `configChatControls`; and
- `disableChatInputControls`.

Also copy only the private DOM helpers called by `renderTranscript`: the message, working-message, Copy Markdown, diff-review, and restore element builders. Do not copy page initialization, activation, OpenRouter management-link generation, key management, Sign Out, Clear, submit, or page-manager behavior.

The new FSM modules import `ChatStateMachine`, `ChatStateMachineInput`, `ChatStateMachineUI`, and the transcript types from their current locations. The unchanged state machine continues using its existing workflow, OpenRouter, and Excel modules. Do not copy or modify any of those shared modules as part of this feature.

### Existing chat HTML and CSS

Continue loading the existing `src/taskpane/pages/chat/chat-page.css`. Add only the wrapper layout rules required for the new `chat-header` and `chat-transcript` roots to preserve the current flex sizing, spacing, and scrolling. Keep the existing element IDs and CSS classes unchanged.

In `chat-page-template.ts`, import `chat-page.html?raw` and parse it once into a detached `<template>`. `cloneChatPageElement(selector)` finds the expected element for the supplied selector and returns a deep clone. It exists only to reuse the current static markup without duplicating that markup in the new components:

- `ChatHeader.genView()` clones `.chat-heading` and `.provider-link-details`.
- `ChatTranscript.createElement()` clones `#chat-messages`, `#chat-form`, and `#chat-clear`, then places Clear in the form.

The helper does not attach or retain live DOM, bind handlers, read component state, or invoke rendering. `ChatHeader` and `ChatTranscript` compose the clones and bind the behavior they own.

### ChatHeader

Implement `ChatHeader` as `Component<void, never, never, never>` with component ID `chat-header`. Its constructor stores the taskpane-owned Sign Out handler.

`genView()` creates a fresh header root, clones the existing heading and provider details into it, removes the cloned Clear button from the heading, and binds Sign Out. Leave the Manage OpenRouter key link hidden and without an `href`; do not generate or store a management URL.

`ChatHeader` owns no mutable state and has no valid update event.

### LegacyChatRendering

Implement `LegacyChatRendering` as a DOM adapter satisfying the existing `ChatStateMachineUI` interface, not as a component. Its constructor receives the one retained transcript root plus `ChatTranscript`-owned accept, reject, and restore handlers. It stores the root once; it has no `setElement()` method and is never retargeted.

The three copied public methods continue to work as they do in the existing page:

- `renderTranscript(entries)` clears and rebuilds `#chat-messages` with the copied entry-creation methods and scrolls that message list;
- `disableChatInputControls()` directly disables `#chat-input` and `#chat-send`;
- `configChatControls(state)` performs the existing pending-edit calculation and directly applies it to `#chat-input` and `#chat-send`.

The copied helper methods preserve plain-text human messages, sanitized system Markdown, Copy Markdown, working indicators, Accept and Reject controls, Restore controls, labels, classes, accessibility attributes, and button state. Replace only their direct calls to the old page's `chatStateMachine` with the injected accept, reject, and restore handlers.

Limit this module's dependencies to `DOMPurify`, `marked`, the existing transcript and `ChatFsmState` types, browser DOM and clipboard APIs, and its injected handlers. It does not import `ChatStateMachine`, either `ChatPage`, the global renderer, the key store, OpenRouter services, or Excel services.

`LegacyChatRendering` only mutates descendants of its retained root. It does not attach or replace that root, bind Clear or submit, invoke the global renderer, call the state machine, or own conversation state.

When the chat page is attached, `renderTranscript()` continues scrolling the live `#chat-messages` element to its `scrollHeight`. Do not add keyed reconciliation, DOM caching, or a general post-render framework in this feature.

### ChatTranscript

Implement `ChatTranscript` as `Component<void, never, never, ChatTranscriptUpdateEvent>` with component ID `chat-transcript`. It is the sole owner of the retained transcript root, the existing `ChatStateMachine`, and chat behavior. Neither `ChatPage` nor `ChatHeader` reads or mutates chat state.

Define `ChatTranscriptUpdateEvent` as `{ type: "clear" } | ChatStateMachineInput`. Handle its variants explicitly:

- `clear` calls `ChatStateMachine.reset()`;
- `submit_message`, `accept_pending_diff`, `reject_pending_diff`, and `restore_to_point` pass the unchanged input to `ChatStateMachine.updateState()`.

`createElement()` creates the transcript root once. It clones `#chat-messages`, `#chat-form`, and `#chat-clear`; places Clear inside the form; and binds the Clear and submit handlers. The form prevents browser submission, reads and clears `#chat-input` immediately, and sends `submit_message` to `ChatTranscript.updateState()`. Clear remains enabled while `LegacyChatRendering` controls the input and Send button. The accept, reject, and restore elements are created by the copied rendering helpers, but their injected callbacks return those actions to `ChatTranscript.updateState()`.

#### Legacy rendering compatibility

The copied rendering methods require one long-lived DOM root, while the normal component pattern replaces its root with a fresh element from `genView()`. Because `ChatStateMachine` calls those methods during `updateState()` to show working messages, streaming responses, and control changes, replacing them with one final component render would change existing behavior.

As a temporary exception, `ChatTranscript` calls `createElement()` once and retains that root for its lifetime. It gives the root to `LegacyChatRendering`, passes `Excel` and the adapter directly to `new ChatStateMachine(Excel, legacyChatRendering)`, and calls `reset()` to render the welcome message. `genView()` always returns the same retained root, and state-machine callbacks mutate it directly without forwarding through `ChatPage` or invoking the global renderer.

The root is attached while chat is active and detached when another page is shown; it is never replaced or retargeted. Signing back in reattaches the same root and preserves the existing state machine and conversation.

### ChatPage

Replace the FSM placeholder with a new stateless `Component<void, never, never, never>`. Its constructor accepts the taskpane-owned Sign Out handler, constructs `ChatHeader` with that handler, and constructs `ChatTranscript` with no arguments.

`genView()` creates the stable `chat-page` section with the existing `chat-view` class, appends `ChatHeader.genView().element` followed by `ChatTranscript.genView().element`, and returns the page view. It does not inspect transcript output, pass chat events between children, or configure either child's state.

`ChatPage` has no state, outputs, or valid update event. It does not import `ChatStateMachine`, `LegacyChatRendering`, chat types, OpenRouter services, Excel services, or the key store.

### TaskpaneComponent and initialization

Continue constructing one `OpenrouterKeyStore` in `TaskpaneComponent`. Immediately pass that instance to `configureOpenRouterClient()` before constructing `ChatPage`, then construct `ChatPage` with only `handleSignOut`.

The existing initial-page selection and successful `sign_in` transition render `ChatPage` directly; they do not send a chat activation event or generate a management URL. The existing signing-in and error renders remain unchanged.

For `sign_out`, clear the shared key store, reset the authentication component, and change the active page to authentication. Do not duplicate credential clearing inside `ChatPage`.

### Deferred cleanup

Do not change `ChatStateMachine` or `ChatStateMachineUI` in this feature. In particular, do not replace the existing callback timing with a final render after `ChatStateMachine.updateState()` resolves, because that would remove visible streaming and intermediate working states.

After both taskpane selections have behavior parity, a separate implementation plan can replace the three UI callbacks with explicit intermediate transition events and presentation outputs. That follow-up can restore the strict component update-and-render sequence and derive review-control disabled state instead of storing it on transcript entries. Keeping that refactor separate avoids combining chat workflow changes with the component UI migration.

## Verification

- With a stored key, verify the FSM taskpane initially renders the existing heading, provider details, welcome message, and Sign Out button, with Clear, the message input, and Send grouped in `ChatTranscript`.
- Verify the Manage OpenRouter key link remains hidden and has no `href`.
- Verify the FSM chat uses the existing chat CSS without visual changes to spacing, alignment, colors, typography, working indicators, dividers, or controls.
- Submit a message and verify the input clears, controls disable, the human message and working indicator appear, streamed text updates only the transcript, and the transcript remains scrolled to the bottom.
- Exercise a clarification request and verify the next submitted answer continues the existing workflow.
- Exercise preprocessing with no inferred edits and verify the original query continues automatically.
- Exercise preprocessing and normal edit proposals with inferred edits and verify Accept and Reject preserve their current Excel, transcript, continuation, and control-state behavior.
- Accept a normal edit and verify the existing update analysis and Restore control appear; restore it and verify the worksheet and conversation return to the saved point.
- Exercise a scenario-sheet request and verify the existing scenario creation and comparison behavior remains unchanged.
- Trigger submit, accept, reject, and restore failures and verify the current user-facing error messages and control recovery remain unchanged.
- Verify Clear resets the conversation and Sign Out clears the key and returns to authentication.
- Sign in again and verify the same `ChatStateMachine` instance and conversation remain available, matching current page-manager behavior.
- Verify human messages remain plain text, system Markdown remains sanitized, and Copy Markdown retains its current clipboard feedback.
- Verify the current taskpane selection still renders and behaves unchanged with its existing `ChatPage` implementation untouched.
- Run the existing unit tests without modifying them.
- Build both `TASKPANE_IMPLEMENTATION` selections for production.
- Run `npm run lint` and `git diff --check`; report unrelated pre-existing lint failures separately.
- Do not add or change unit or integration tests, and do not start the development server.

## Follow-up

After this parity implementation is complete:

1. Merge `ChatStateMachine` into `ChatTranscript` so the component directly owns the chat state, transitions, and behavior, and remove the separate state-machine/UI-adapter boundary.
2. Implement an FSM-native rendering system that represents intermediate working, streaming, transcript, and control updates through component state and rendering. Replace `LegacyChatRendering` and the retained-DOM exception so `ChatTranscript.genView()` can generate fresh views through the normal component render path.
