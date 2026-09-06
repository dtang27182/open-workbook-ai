# Component Architecture

Status: defines the component contract for `src/taskpane`. Examples illustrate the contract using the add-in's structure; they are not a complete description of its implementation.

Implementation guidance: [Component Architecture Implementation Guide](./component-architecture-implementation-guide.md).

## Scope and Maintenance

This document defines the rules for component boundaries, construction, state updates, DOM ownership, and event-handler ownership. Keep these rules authoritative and use a small number of representative examples to explain them.

Update this document when the component contract changes or an example needs correction to illustrate that contract. Do not update it merely because a feature adds or changes components, events, state fields, helpers, control behavior, or layout calculations. Do not maintain exhaustive component trees, event lists, dependency wiring, or workflow descriptions here. Implementation details belong in source code, feature plans, and behavior specifications; broader application responsibilities are described in [Application Architecture](./application-architecture.md).

## Architecture

The taskpane is a tree of components. A representative part of the add-in's structure is:

```text
TaskpaneComponent
|-- OpenRouterAuthPage
`-- ChatPage
    |-- ChatHeader
    `-- ChatWindow
        `-- ChatInput
```

Each component owns its state, if any, and the DOM below a mount element supplied at construction and stored by the component. State transitions and UI updates happen together: after changing its state, a component creates, replaces, or edits the DOM under its mount so that the DOM represents the new state. A retained component's mount can be detached while its page is inactive.

Services such as `LLMManager` and `ExcelManager` remain outside the visual component tree. They handle model requests and worksheet operations rather than component rendering.

Components can delegate work to helpers, including asynchronous workflows. Helpers that mutate component state or DOM run within the owning component's `updateState()` call path. For example, chat workflows operate on state supplied by `ChatWindow`; the state holder is not itself another component.

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

Components without update events can implement `Component<never>` with a no-op `updateState()`. A component used only for composition, such as `ChatPage`, can construct its DOM and bind or pass through handlers without having post-construction transitions of its own.

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

## Parent Composition and Update Flow

Parents compose the application by owning child instances and creating their mount elements. Updates normally reuse the mounts and child instances established during construction.

For example, `TaskpaneComponent` can switch between the auth and chat pages by attaching the active page's existing mount. A page switch need not reconstruct the child components or discard their state.

A child handles events affecting only its own state through its own `updateState()`; those events do not need to pass through its parent. An asynchronous update can render more than once, such as when `ChatWindow` receives streamed response text.

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

DOM ownership and action ownership can differ. For example, `ChatInput` owns its form and binds a submit callback supplied by `ChatWindow`, because submission affects the wider conversation. Local input presentation updates belong to `ChatInput` and use its own update entry point.

An action spanning pages belongs higher in the tree. For example, sign-out belongs to `TaskpaneComponent` because it affects which page is active, even when a descendant renders the button. Intermediate components pass the ancestor-owned handler to the component that binds it.
