# Taskpane Component FSM Architecture V2 Migration Plan

Status: proposed for review. This plan targets only the taskpane implementation under `src/taskpane-fsm` and does not authorize runtime changes yet.

## Behavior

Migrate `TaskpaneComponent` to Component FSM Architecture V2 without changing the existing OpenRouter authentication or chat components.

The migrated taskpane preserves the current behavior:

- initial page selection continues to depend on whether the OpenRouter key store contains a key;
- signing in continues to show authentication progress, acquire and store a key, and activate chat;
- a sign-in failure continues to display the authentication error state;
- signing out continues to clear the key and activate the authentication page;
- only the active page is attached beneath the taskpane root; and
- existing authentication, chat, OpenRouter, and Excel behavior remains unchanged.

The taskpane constructor performs the initial DOM setup. Later taskpane transitions update state and the live DOM through `updateState()`. The entry point and input handlers do not call `genView()` or a global renderer.

## Scope

Create or change only these interface points:

- add `src/taskpane-fsm/component-v2.ts` for the v2 component contract;
- add `src/taskpane-fsm/legacy-component-adapter.ts` to isolate the existing page components' v1 view contract;
- migrate `src/taskpane-fsm/taskpane-component.ts` to the v2 contract;
- update `src/taskpane-fsm/taskpane.ts` to construct the taskpane with its mount; and
- remove `src/taskpane-fsm/render.ts` after its final callers are removed.

Do not change:

- any file under `src/taskpane-fsm/pages/openrouter-auth`;
- any file under `src/taskpane-fsm/pages/chat`;
- the existing v1 contract in `src/taskpane-fsm/component.ts`, which those pages still use;
- any file under `src/taskpane`;
- authentication, chat, OpenRouter, Excel, CSS, or HTML behavior; or
- build-selection configuration, dependencies, or test infrastructure.

The legacy adapter is a temporary migration boundary. It should be removed only when the authentication and chat components are migrated in separate future work.

## Interface Points

### V2 component contract

Add `src/taskpane-fsm/component-v2.ts`:

```ts
export interface Component<UpdateEvent> {
  getMount(): HTMLElement;
  setMount(mount: HTMLElement): void;
  updateState(event: UpdateEvent): void | Promise<void>;
}
```

Keep this contract separate from `src/taskpane-fsm/component.ts` so the existing page classes require no type or implementation changes.

### Legacy component adapter

Add one generic adapter around the existing v1 `Component` contract. The adapter implements the v2 `Component<UpdateEvent>` contract using the legacy component's existing update-event type directly.

The adapter:

- accepts a mount and one existing v1 component in its constructor;
- implements the v2 mount getter, mount setter, and `updateState()` methods;
- creates the initial legacy view beneath its mount during construction;
- handles `updateState()` by awaiting the legacy component's `updateState()` and then replacing the contents of its stored mount with the result of `genView()`; and
- does not use the global renderer.

This is the only new code allowed to call `genView()` on the existing authentication and chat page components.

### Taskpane events

Keep the taskpane's public behavioral events narrowly focused:

```ts
export type TaskpaneUpdateEvent =
  | { type: "sign_in" }
  | { type: "sign_out" };
```

## Implementation Details

### Construction and mounts

Change `TaskpaneComponent` so its constructor takes the application mount as its first argument. Store the mount behind `getMount()` and `setMount()`.

During construction:

1. create the key store and configure the OpenRouter client as today;
2. initialize `activePage` from the stored-key state;
3. create the stable `#taskpane-app` root beneath the supplied mount;
4. create one stable mount for `OpenRouterAuthPage` and one stable mount for `ChatPage`;
5. construct the existing `OpenRouterAuthPage` and `ChatPage` with their current constructor arguments;
6. wrap each page in a legacy adapter using its permanent mount; and
7. attach only the active page's mount beneath `#taskpane-app`.

The two page mounts are created once and never regenerated. A page transition detaches one stable page mount and attaches the other beneath `#taskpane-app`; it does not call `setMount()` on either adapter. Because the child mount elements retain their identity and contents while detached, activating a page does not require a state-neutral refresh event.

The application mount supplied to `TaskpaneComponent` is also stable for the lifetime of the taskpane. Implement `getMount()` and `setMount()` to satisfy the v2 contract, but do not call `setMount()` in this migration.

### State and DOM updates

Remove `componentId` and `genView()` from `TaskpaneComponent`. Implement the v2 `Component<TaskpaneUpdateEvent>` contract.

Handle each event explicitly:

- `sign_in` updates the authentication adapter to `sign_in_started`, performs key acquisition, and then either activates chat after `sign_in_succeeded` or updates the authentication adapter with `sign_in_failed`;
- `sign_out` clears the key, resets the authentication page, and activates it.

Activating a page consists of:

1. replacing the children of `#taskpane-app` with the selected page's existing mount element; and
2. recording the selected page in taskpane state at the appropriate point in the transition.

Page activation does not recreate a page mount, change an adapter's mount, regenerate a child view, or call a child `updateState()`. Child `updateState()` is called only for a real child state transition, such as authentication progress, success, failure, or reset.

All taskpane state changes and all changes to taskpane-owned live DOM occur from the constructor or `TaskpaneComponent.updateState()`. Child state and child DOM updates occur through the adapters' `updateState()` methods.

### Input handlers

Keep sign-in and sign-out handlers on `TaskpaneComponent` because both operations affect taskpane-owned active-page state. The handlers call only `TaskpaneComponent.updateState()`:

```ts
private handleSignIn = async (): Promise<void> => {
  await this.updateState({ type: "sign_in" });
};

private handleSignOut = (): void => {
  void this.updateState({ type: "sign_out" });
};
```

Do not call child `updateState()`, child `genView()`, or `render()` from either handler. `TaskpaneComponent.updateState()` owns the complete transition and delegates the required page updates through the adapters.

### Entry point and renderer removal

Update `src/taskpane-fsm/taskpane.ts` to pass `#app-body` directly to the constructor:

```ts
Office.onReady(() => {
  const appBody = document.getElementById("app-body")!;

  new TaskpaneComponent(appBody);
  appBody.hidden = false;
});
```

Remove the renderer import, the taskpane `genView()` call, and the initial `render()` call. Once no references remain, delete `src/taskpane-fsm/render.ts`. Do not introduce a replacement global render function.

## Verification

- Build with the `taskpane-fsm` implementation selected and verify TypeScript compilation succeeds.
- Run the existing unit tests and lint checks; report unrelated pre-existing failures separately.
- Verify initial load shows authentication without a stored key and chat with a stored key.
- Verify sign-in progress, sign-in success, sign-in failure, and sign-out still display the same page states and preserve key-store behavior.
- Verify chat submit, clear, accept, reject, restore, copy, and Excel workflows behave unchanged.
- Verify only the active page is attached beneath `#taskpane-app`.
- Verify both page mounts are created once and retain their identity across repeated sign-in and sign-out transitions.
- Verify taskpane and page-adapter `setMount()` methods are not called after construction.
- Verify no `refresh` event is introduced for either the taskpane or the legacy adapter.
- Verify `src/taskpane-fsm/taskpane.ts` and `taskpane-component.ts` contain no `genView()` or global `render()` calls.
- Verify the only new calls to legacy page `genView()` are inside `legacy-component-adapter.ts`.
- Verify there are no diffs under `src/taskpane-fsm/pages` or `src/taskpane`.
- Run `git diff --check`.

Do not add a DOM test dependency, change existing tests, or start the development server as part of this narrowly scoped migration.
