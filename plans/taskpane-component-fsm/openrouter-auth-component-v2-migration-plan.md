# OpenRouter Authentication Component V2 Migration Plan

Status: proposed for review. This plan covers only migration of the OpenRouter authentication page under `src/taskpane-fsm` and does not authorize runtime changes yet.

## Behavior

Migrate `OpenRouterAuthPage` to Component FSM Architecture V2 without changing its behavior or moving authentication responsibilities between components.

The migrated page preserves:

- the provider-selection, signing-in, and error states;
- the existing HTML structure, element IDs, classes, labels, and error text;
- the existing sign-in button behavior; and
- `TaskpaneComponent` ownership of the sign-in workflow, stored key, and active-page transition.

The architectural change is limited to making the page render beneath its permanent mount during construction and update its own state and DOM through `updateState()`.

## Scope

Change only:

- `src/taskpane-fsm/pages/openrouter-auth/openrouter-auth-page.ts`; and
- the minimum authentication-page construction and field typing in `src/taskpane-fsm/taskpane-component.ts`.

Do not change:

- any file under `src/taskpane-fsm/pages/chat`;
- `src/taskpane-fsm/legacy-component-adapter.ts`, which remains in use for `ChatPage`;
- either component contract;
- the authentication HTML or CSS;
- the OpenRouter client, key exchange, or key store;
- taskpane navigation or event-handler ownership;
- any file under `src/taskpane`; or
- dependencies, build configuration, or test infrastructure.

## Interface Points

Change `OpenRouterAuthPage` to implement the V2 contract from `src/taskpane-fsm/component-v2.ts`:

```ts
export class OpenRouterAuthPage
  implements Component<OpenRouterAuthUpdateEvent>
{
  constructor(
    mount: HTMLElement,
    onSignIn: () => Promise<void>,
  );

  getMount(): HTMLElement;
  updateState(event: OpenRouterAuthUpdateEvent): void;
}
```

The mount is supplied once during construction and remains immutable for the lifetime of the page. Remove the legacy `componentId` and public `genView()` interface from this component.

Keep `OpenRouterAuthUpdateEvent` unchanged so existing taskpane calls remain valid.

## Implementation Details

### OpenRouter authentication page

Store the constructor mount as a private readonly field and return it from `getMount()`.

Convert the existing view-generation logic into a private helper that creates the page element from the current state. Preserve the existing markup cloning, sign-in listener, and explicit UI handling for all three state phases. This helper is internal implementation detail rather than part of the component interface.

During construction, replace the mount's children with the element returned by the helper. Do not add a `rootElement` field or an additional wrapper element; the page element is placed directly beneath its permanent mount.

For each `OpenRouterAuthUpdateEvent`, `updateState()`:

1. performs the existing explicit state transition; and
2. replaces the mount's children with a newly created page element reflecting the new state.

After construction, `updateState()` is the only method that changes authentication-page state or owned DOM.

### Taskpane wiring

Change the `openRouterAuthPage` field from `LegacyComponentAdapter<OpenRouterAuthUpdateEvent>` to `OpenRouterAuthPage`.

Construct the page directly with its existing stable child mount:

```ts
this.openRouterAuthPage = new OpenRouterAuthPage(
  initialDom.openRouterAuthMount,
  this.handleSignIn,
);
```

Do not wrap it in `LegacyComponentAdapter`. Keep the adapter import and usage for `ChatPage` only.

No other taskpane flow changes are required. Existing calls to `openRouterAuthPage.updateState()` continue to drive authentication transitions, and page activation continues to attach `openRouterAuthPage.getMount()` beneath the taskpane mount. The taskpane must not recreate the authentication mount or authentication component during normal updates.

## Verification

- Build the `taskpane-fsm` implementation and verify TypeScript compilation succeeds.
- Verify initial construction displays the provider-selection state beneath the supplied mount.
- Verify `sign_in_started`, `sign_in_succeeded`, `sign_in_failed`, and `reset` retain their current state transitions and UI.
- Verify clicking the sign-in button still delegates to `TaskpaneComponent` and preserves the existing key-exchange and page-transition behavior.
- Verify `OpenRouterAuthPage` has no `componentId`, public `genView()`, legacy `ComponentView` import, or legacy component-contract import.
- Verify `TaskpaneComponent` uses `LegacyComponentAdapter` only for `ChatPage`.
- Verify no files outside the two listed in scope are changed.
- Run `git diff --check`.

Do not add or change tests as part of this narrowly scoped migration.
