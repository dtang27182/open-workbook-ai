# Chat Page and Header V2 Migration Plan

Status: proposed for review. This plan covers only migration of `ChatPage` and `ChatHeader` under `src/taskpane-fsm` and does not authorize runtime changes yet.

## Behavior

Migrate `ChatPage` and `ChatHeader` to Component FSM Architecture V2 without changing chat behavior or modifying `ChatTranscript`.

The migrated components preserve:

- the existing chat page, heading, provider details, and sign-out UI;
- the existing DOM IDs, classes, labels, and effective flex layout;
- `TaskpaneComponent` ownership of the sign-out handler and active-page transition; and
- `ChatTranscript` ownership of transcript state, controls, and workflows.

`ChatPage` becomes a V2 parent that creates permanent mounts for its two children. `ChatHeader` becomes a V2 leaf. The unchanged legacy `ChatTranscript` remains behind `LegacyComponentAdapter` until a separate migration.

## Scope

Change only:

- `src/taskpane-fsm/pages/chat/chat-page.ts`;
- `src/taskpane-fsm/pages/chat/chat-header.ts`; and
- the minimum chat-page construction and field typing in `src/taskpane-fsm/taskpane-component.ts`.

Do not change:

- `src/taskpane-fsm/pages/chat/chat-transcript.ts`;
- `src/taskpane-fsm/pages/chat/legacy-chat-rendering.ts`;
- `src/taskpane-fsm/pages/chat/chat-page-template.ts`;
- `src/taskpane-fsm/legacy-component-adapter.ts`;
- either component contract;
- chat HTML or CSS;
- chat, LLM, OpenRouter, or Excel behavior;
- authentication components;
- any file under `src/taskpane`; or
- dependencies, build configuration, or test infrastructure.

## Interface Points

Change both migrated classes to implement the V2 contract from `src/taskpane-fsm/component-v2.ts`:

```ts
export class ChatPage implements Component<never> {
  constructor(mount: HTMLElement, onSignOut: () => void);

  getMount(): HTMLElement;
  updateState(event: never): void;
}

export class ChatHeader implements Component<never> {
  constructor(mount: HTMLElement, onSignOut: () => void);

  getMount(): HTMLElement;
  updateState(event: never): void;
}
```

Each mount is supplied once during construction and remains immutable. Remove the legacy `componentId` and public `genView()` interface from both classes.

Neither component currently has state transitions, so its update-event type remains `never`. Its required `updateState()` implementation performs no work.

## Implementation Details

### Chat header

Store the constructor mount as a private readonly field and return it from `getMount()`.

Move the existing header DOM construction into a private initialization helper. Preserve the cloned heading and provider details, removal of the clear button, hidden manage-key link, and binding of the supplied sign-out handler. Attach the resulting `.chat-header` element directly beneath the permanent mount during construction.

Do not add a `rootElement` field. The header has no state or later DOM updates, so retaining its owned root separately provides no benefit.

### Chat page composition

Store the constructor mount as a private readonly field and return it from `getMount()`.

Add a private `createInitialDom()` helper that:

1. creates the existing `#chat-page.chat-view` section;
2. creates one permanent mount for `ChatHeader` and one for `ChatTranscript`;
3. sets both child mounts to `display: contents` so they do not alter the existing flex-item layout;
4. appends the child mounts to the page section; and
5. attaches the page section beneath the component mount.

The helper returns the two child mounts for constructor initialization. Do not store those mount elements as separate fields after construction.

Construct `ChatHeader` directly with its mount and the ancestor-owned sign-out handler. Construct the existing `ChatTranscript` exactly as today, but wrap it with `LegacyComponentAdapter<ChatTranscriptUpdateEvent>` using its permanent mount.

Store the header and transcript adapter as the two child component instances. `ChatPage` must not call either child's `genView()`. The adapter remains the only V2 boundary that calls `ChatTranscript.genView()`.

Do not add chat-page events merely to forward transcript actions. `ChatTranscript` continues to bind its own clear, submit, accept, reject, restore, and copy handlers and call its own existing `updateState()` implementation.

### Taskpane wiring

Change the `chatPage` field from `LegacyComponentAdapter<never>` to `ChatPage`.

Construct the page directly with its existing stable taskpane child mount:

```ts
this.chatPage = new ChatPage(initialDom.chatMount, this.handleSignOut);
```

Remove the taskpane's `LegacyComponentAdapter` import because the adapter is now used inside `ChatPage` only.

No other taskpane flow changes are required. Page activation continues to attach `chatPage.getMount()` beneath the taskpane mount. The taskpane must not recreate the chat mount or `ChatPage` during normal updates.

### Event-handler ownership

Keep `handleSignOut` on `TaskpaneComponent` because signing out changes taskpane-owned key and active-page state. Pass that handler through `ChatPage` to `ChatHeader`, where it remains bound to the sign-out button.

The handler continues to call only `TaskpaneComponent.updateState()`. Neither `ChatPage` nor `ChatHeader` introduces a sign-out event or performs taskpane state changes.

## Verification

- Build the `taskpane-fsm` implementation and verify TypeScript compilation succeeds for the changed files.
- Verify initial construction creates one stable header mount and one stable transcript mount beneath `#chat-page.chat-view`.
- Verify the page retains its existing visible flex layout despite the new child mount elements.
- Verify the header still contains the heading and sign-out button, omits the clear button, and hides the manage-key link.
- Verify signing out still delegates to `TaskpaneComponent` and activates the authentication page.
- Verify clear, submit, accept, reject, restore, copy, LLM, and Excel behavior remains unchanged.
- Verify `ChatPage` and `ChatHeader` have no `componentId`, public `genView()`, `ComponentView` import, or legacy component-contract import.
- Verify `TaskpaneComponent` constructs `ChatPage` directly and no longer imports `LegacyComponentAdapter`.
- Verify the only adapter introduced by this migration wraps `ChatTranscript` inside `ChatPage`.
- Verify `src/taskpane-fsm/pages/chat/chat-transcript.ts` has no diff.
- Verify no files outside the three listed in scope are changed by implementation.
- Run `git diff --check`.

Do not add or change tests as part of this narrowly scoped migration.
