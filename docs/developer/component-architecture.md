# Component Architecture

Status: describes the current component contract and implementation under `src/taskpane`.

Implementation guidance: [Component Architecture Implementation Guide](./component-architecture-implementation-guide.md).

## Architecture

The taskpane is a tree of components:

```text
TaskpaneComponent
|-- OpenRouterAuthPage
`-- ChatPage
    |-- ChatHeader
    `-- ChatWindow
```

Each component owns its state, if any, and the DOM below a mount element supplied at construction and stored by the component. State transitions and UI updates happen together: after changing its state, a component creates, replaces, or edits the DOM under its mount so that the DOM represents the new state. A retained component's mount can be detached while its page is inactive.

Managers such as `LLMManager`, `ExcelManager`, and `RestoreManager`, along with `OpenRouterClient` and key storage, remain outside the visual component tree. They handle model requests, worksheet operations, restore checkpoints, and credentials rather than component rendering.

Chat workflow functions are different from these managers: they receive `ChatWindowState` and can update its chat state and DOM through helpers. They run within `ChatWindow.updateState()`'s call path. `ChatWindowState` holds the mount, handlers, manager references, and restorable `ChatState`; it is not another component.

## Component Contract

```ts
export interface Component<UpdateEvent> {
  getMount(): HTMLElement;

  updateState(event: UpdateEvent): void | Promise<void>;
}
```

A component can use helpers to create DOM from its current state. Attaching or applying that DOM beneath its mount belongs to construction or the `updateState()` call path.

Developers are free to add helper methods that are useful for a particular component. A parent can call a child's helper methods to inspect its current state or obtain values derived from that state. These methods are read-only: they must not update component state or change any DOM elements.

After construction, `updateState()` is the entry point for modifying a component's state and owned DOM. The mutations can live in instance helpers or module-level functions that it calls, including asynchronous workflows. Depending on the event, that call path:

- handles an expected variant of the component's `UpdateEvent` union;
- updates the component's owned state;
- performs any external effects assigned to the transition;
- creates or edits DOM only below its stored mount;
- reuses the mounts and instances of any children; and
- calls child `updateState()` methods when those children need a state transition.

A parent can update its own state and DOM before or after updating its children, according to the needs of the transition. Parent components normally create their child mounts once and reuse them for the lifetime of the child instances.

Components without update events can implement `Component<never>` with a no-op `updateState()`. `ChatPage` and `ChatHeader` currently do this: they construct their DOM and bind or pass through handlers, but have no post-construction transitions of their own.

## Construction and Initialization

A component constructor always receives its mount element, followed by any real initial values, stable dependencies, or ancestor-owned handlers. Construction is the initial transition: it stores the mount, initializes state, and immediately creates the component's initial DOM below the mount.

`getMount()` returns the component's DOM boundary. The mount is fixed when the component is constructed and cannot be changed later. If a parent must replace a child's mount, which should be extremely rare, it constructs a new child instance with the new mount and replaces its reference to the old child.

For a parent component, construction also creates the mount elements for its children and then constructs each child with its mount. Regular `updateState()` calls use the stored mounts and reuse existing child instances.

For example, `ChatPage` creates its child mounts in an initialization helper and passes the sign-out handler and key store to the children that need them:

```ts
constructor(mount: HTMLElement, onSignOut: () => void, keyStore: OpenrouterKeyStore) {
  this.mount = mount;
  const initialDom = this.createInitialDom();
  this.chatHeader = new ChatHeader(initialDom.chatHeaderMount, onSignOut);
  this.chatWindow = new ChatWindow(initialDom.chatWindowMount, keyStore);
}
```

Do not add empty configuration objects merely to make constructors uniform. A leaf with no dependencies can accept only its mount.

`TaskpaneComponent` constructs the shared key store. It passes that store through `ChatPage` to `ChatWindow`, which constructs its `LLMManager`; the manager constructs its `OpenRouterClient`. `ChatWindow` also accepts an optional Excel API dependency for tests.

## Parent Composition and Update Flow

Parents compose the application by owning child instances and creating their mount elements. Updates normally reuse the mounts and child instances established during construction.

`TaskpaneComponent` constructs both pages once and attaches the active page's existing mount. During sign-in it sends `sign_in_started`, then `sign_in_succeeded` or `sign_in_failed`, to `OpenRouterAuthPage`. During sign-out it clears the key, resets the auth page, and switches the attached page mount. These page switches do not clear or reconstruct `ChatWindow`.

`ChatWindow` handles its own events without routing them through `ChatPage`. It disables chat controls during asynchronous actions, delegates to workflow functions, and configures the controls again when the action completes. Rendering can happen repeatedly during an action, such as when streamed response text arrives.

The exact child events depend on the behavior each child owns. A parent should call only the children affected by a transition. Children do not read sibling state or manipulate sibling DOM; the parent connects them through explicit events and values returned by read-only helper methods.

## Event-Handler Ownership

Every input event handler is defined on the highest component whose state is affected by the input event. When a descendant binds an ancestor-owned handler to a DOM event, the owning ancestor supplies the handler through the descendant's chain of constructors and each intermediate component passes it to the appropriate child.

The handler calls `updateState()` on that highest affected component. The component already knows its mount, so the handler does not need DOM context. The component handles its part of the event and delegates through its subtree, where each parent performs the required child state changes and DOM updates.

For example, the submit callback defined in the `ChatWindow` constructor calls its own `updateState()` because submitting a message affects state owned by `ChatWindow`:

```ts
onSubmit: (message) => {
  void this.updateState({ type: "submit_message", message });
},
```

### Taskpane events

`TaskpaneComponent` owns sign in and sign out because those operations affect its active-page state, credentials, and auth-page state. It supplies the relevant handlers as it constructs `OpenRouterAuthPage` and `ChatPage`; `ChatPage` passes the sign-out handler to `ChatHeader`.

### Chat events

`ChatWindow` owns the `submit_message`, `clear`, `accept_pending_diff`, `reject_pending_diff`, and `restore_to_point` events because those operations affect its state. Its DOM helpers bind the callbacks supplied by its constructor to the corresponding controls. Submit and clarification workflows both call the module-level `processModelResponse()` function in `chat-window.ts` to apply model completion results.

`ChatHeader` owns the heading, provider details, and sign-out button DOM. Its only action handler is the sign-out callback supplied by `TaskpaneComponent` through `ChatPage`. The clear control belongs to `ChatWindow`, not `ChatHeader`.

Application initialization constructs the top-level component with the application mount, and the constructor builds the initial component tree:

```ts
Office.onReady(() => {
  const appBody = document.getElementById("app-body")!;
  new TaskpaneComponent(appBody);
  appBody.hidden = false;
});
```
