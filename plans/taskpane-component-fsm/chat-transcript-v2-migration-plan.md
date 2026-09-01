# Chat Transcript V2 Migration Plan

Status: proposed for review. This plan migrates `ChatTranscript` under `src/taskpane-fsm` to Component FSM Architecture V2 and does not authorize runtime changes yet.

## Behavior

Migrate `ChatTranscript` without changing its chat FSM, LLM workflows, or Excel operations. Temporarily remove the Copy Markdown buttons and behavior.

Keep `LegacyChatRendering` as the component's internal DOM-rendering helper. The migration removes only the legacy component interface and adapter boundary.

## Scope

Change:

- `src/taskpane-fsm/pages/chat/chat-transcript.ts`;
- `src/taskpane-fsm/pages/chat/chat-page.ts`; and
- `src/taskpane-fsm/pages/chat/legacy-chat-rendering.ts` only to remove Copy Markdown UI and behavior.

After confirming they have no remaining users, remove:

- `src/taskpane-fsm/legacy-component-adapter.ts`; and
- `src/taskpane-fsm/component.ts`.

Do not change shared chat state types, chat HTML or CSS, LLM or Excel workflows, authentication components, dependencies, build configuration, or test infrastructure.

## Interface

Change `ChatTranscript` to implement the V2 contract:

```ts
export class ChatTranscript implements Component<ChatTranscriptUpdateEvent> {
  constructor(mount: HTMLElement, excelApi?: ExcelApi);

  getMount(): HTMLElement;
  updateState(event: ChatTranscriptUpdateEvent): Promise<void>;
}
```

Store the mount as a private readonly field. Rename the existing stable `element` field to `rootElement`. Remove `componentId`, `genView()`, `ComponentView`, and the V1 component import.

## Implementation

### Construction

Convert the existing element-creation helper into `createInitialDom()`. It creates the existing `#chat-transcript.chat-transcript` root, binds the clear and submit handlers, places the root directly beneath the permanent mount, and returns it for storage as `rootElement`.

Keep the remaining constructor order:

1. store the mount and optional Excel API;
2. create and attach the initial DOM;
3. construct `LegacyChatRendering` with `rootElement`; and
4. call the existing reset logic to initialize state and UI.

Construction remains the initialization exception. Do not recreate the mount or root element during later transitions.

### Existing transitions

Preserve the existing `clear`, `submit_message`, `accept_pending_diff`, `reject_pending_diff`, and `restore_to_point` branches and their private helpers. Those workflows already mutate transcript state and DOM from the `updateState()` call path and do not require architectural refactoring.

Move clearing `#chat-input` from the form event handler into the `submitMessage()` helper called by the `submit_message` branch of `updateState()`. The form handler should only prevent submission, read the message, and call `updateState()`.

### Copy Markdown

Remove Copy Markdown button creation and clipboard handling from `LegacyChatRendering`. Do not add a replacement transcript event or copy implementation in this migration. Keep the rest of `LegacyChatRendering` unchanged.

### Parent composition

In `ChatPage`:

- remove the `LegacyComponentAdapter` and `ChatTranscriptUpdateEvent` imports;
- store `ChatTranscript` directly; and
- construct it as `new ChatTranscript(initialDom.chatTranscriptMount)`.

Keep the existing permanent transcript mount and `display: contents` layout behavior.

### Legacy cleanup

After migrating the transcript, verify that `src/taskpane-fsm` has no remaining V1 component implementations or adapter users. Delete the unused legacy adapter and V1 component contract. Keep `component-v2.ts` unchanged.

## Verification

- Build the `taskpane-fsm` implementation and run lint and existing unit tests.
- Verify initial transcript construction and the welcome message remain unchanged.
- Verify clear, submit, accept, reject, restore, LLM, and Excel behavior remains unchanged.
- Verify submit-input clearing occurs through `ChatTranscript.updateState()`.
- Verify Copy Markdown buttons are no longer rendered.
- Verify `ChatTranscript` has no `componentId`, public `genView()`, `ComponentView` import, or V1 component import.
- Verify `ChatPage` constructs `ChatTranscript` directly with its permanent mount.
- Verify `LegacyChatRendering` remains present and is used only as an internal transcript rendering helper.
- Verify there are no remaining references to `LegacyComponentAdapter` or `src/taskpane-fsm/component.ts` before deleting them.
- Run `git diff --check`.

Do not add or change tests as part of this migration.
