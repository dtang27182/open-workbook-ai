# Chat Window Component Rename Plan

Status: implemented. This plan renames the V2 `ChatTranscript` component to `ChatWindow` without changing behavior.

## Naming Boundary

Use `ChatWindow` for the visual component that owns the conversation transcript, input form, workflow controls, and chat transitions.

Keep `transcript` terminology for the conversation data rendered inside that component. Types and functions such as `ChatTranscriptEntry`, `ChatMessageTranscriptItem`, `chatState.transcript`, and `renderChatTranscript()` continue to describe transcript data accurately and should not be renamed.

## Runtime Renames

Rename files:

- `src/taskpane-fsm/pages/chat/chat-transcript.ts` to `chat-window.ts`;
- `src/taskpane-fsm/pages/chat/chat-transcript-dom.ts` to `chat-window-dom.ts`; and
- the active `chat-transcript-pure-helper-extraction-plan.md` to `chat-window-pure-helper-extraction-plan.md`.

Rename component-level symbols:

- `ChatTranscript` to `ChatWindow`;
- `ChatTranscriptUpdateEvent` to `ChatWindowUpdateEvent`;
- `ChatTranscriptDomHandlers` to `ChatWindowDomHandlers`;
- `ChatPage.chatTranscript` to `ChatPage.chatWindow`; and
- `chatTranscriptMount` to `chatWindowMount` throughout `ChatPage.createInitialDom()` and construction.

Update all imports and paths for the renamed files and symbols.

## DOM and CSS

Rename the component root selectors:

- `#chat-transcript` to `#chat-window`; and
- `.chat-transcript` to `.chat-window`.

Update the matching rule in `src/taskpane/pages/chat/chat-page.css`. Keep transcript-internal selectors such as `#chat-messages`, `.chat-message`, and `.chat-working` unchanged.

## Names That Remain Unchanged

Do not rename:

- `ChatTranscriptSource`, `ChatTranscriptItem`, or `ChatTranscriptEntry`;
- `ChatMessageTranscriptItem` or `ChatWorkingTranscriptItem`;
- `ChatState.transcript`;
- transcript mutation helpers such as `appendMessage()`, `insertRestoreTranscriptItem()`, or `updateWorkingTranscriptItem()`;
- `renderChatTranscript()`, because it renders the transcript inside the window;
- the original taskpane's transcript state, rendering methods, or tests; or
- the root `ARCHITECTURE.md` reference to the rendered `chatTranscript`, which describes derived data rather than the V2 component.

## Documentation Updates

Update the authoritative V2 architecture document to show `ChatWindow` in the component tree, examples, and event-handler ownership descriptions.

Update the active pure-helper extraction plan to use the new component and file names while retaining transcript terminology for data helpers.

Leave completed historical migration plans unchanged. They document the component names and boundaries that existed when those migrations were performed.

## Verification

- Build the `taskpane-fsm` implementation and run lint and existing unit tests.
- Verify `ChatPage` constructs one `ChatWindow` with its permanent `chatWindowMount`.
- Verify the root DOM element uses `#chat-window.chat-window` and retains the current layout.
- Verify submit, clear, restore, accept, reject, LLM, and Excel behavior remains unchanged.
- Verify no runtime imports reference `chat-transcript.ts` or `chat-transcript-dom.ts`.
- Verify no component-level `ChatTranscript`, `ChatTranscriptUpdateEvent`, `ChatTranscriptDomHandlers`, `chatTranscript`, or `chatTranscriptMount` names remain under `src/taskpane-fsm`.
- Verify transcript data types and state names remain unchanged.
- Run `git diff --check`.

Do not add or change tests as part of this rename.
