# Taskpane Component FSM Architecture V2

Status: proposed for review. This document describes the target architecture and does not authorize runtime changes yet.

Implementation guidance: [Component FSM Architecture V2 Implementation Guide](./component-fsm-architecture-v2-implementation-guide.md).

## Architecture

The taskpane is a tree of state-machine components:

```text
TaskpaneComponent
|-- OpenRouterAuthPage
`-- ChatPage
    |-- ChatHeader
    `-- ChatWindow
```

Each component owns its state and the live DOM below a mount element supplied at construction and stored by the component. State transitions and UI updates happen together: after changing its state, a component creates, replaces, or edits the DOM under its mount so that the DOM represents the new state. Components do not return detached views for their parents to compose.

Services such as OpenRouter key storage, LLM workflows, and Excel operations remain outside the visual component tree. Components can invoke those services as part of a state transition, but the services do not depend on component or DOM APIs.

## Component Contract

```ts
export interface Component<UpdateEvent> {
  getMount(): HTMLElement;

  updateState(event: UpdateEvent): void | Promise<void>;
}
```

`genView()` is not part of the component interface. A component, especially a leaf component, can use a private helper to create detached DOM from its current state, but only its constructor or `updateState()` attaches or applies that DOM beneath its mount.

Developers are free to add helper methods that are useful for a particular component. A parent can call a child's helper methods to inspect its current state or obtain values derived from that state. These methods are read-only: they must not update component state or change any DOM elements.

After construction, `updateState()` is the only place where a component's state and owned DOM elements can be modified. It:

- handles an expected variant of the component's `UpdateEvent` union;
- updates the component's owned state;
- performs any external effects assigned to the transition;
- creates or edits DOM only below its stored mount;
- prepares the mount elements required by its children; and
- calls child `updateState()` methods with the appropriate child events.

A parent can update its own state and DOM before or after updating its children, according to the needs of the transition. Parent components normally create their child mounts once and reuse them for the lifetime of the child instances.

## Construction and Initialization

A component constructor always receives its mount element, followed by any real initial values, stable dependencies, or ancestor-owned handlers. Construction is the initial transition: it stores the mount, initializes state, and immediately creates the component's initial DOM below the mount.

`getMount()` returns the component's DOM boundary. The mount is fixed when the component is constructed and cannot be changed later. If a parent must replace a child's mount, which should be extremely rare, it constructs a new child instance with the new mount and replaces its reference to the old child.

For a parent component, construction also creates the mount elements for its children and then constructs each child with its mount. Regular `updateState()` calls use the stored mounts and reuse existing child instances.

```ts
private readonly mountElement: HTMLElement;

getMount(): HTMLElement {
  return this.mountElement;
}

constructor(mount: HTMLElement, config: ChatPageConfig) {
  this.mountElement = mount;

  const element = document.createElement("section");
  const headerMount = document.createElement("div");
  const chatWindowMount = document.createElement("div");

  element.append(headerMount, chatWindowMount);
  this.getMount().replaceChildren(element);

  this.chatHeader = new ChatHeader(headerMount, config.header);
  this.chatWindow = new ChatWindow(chatWindowMount, config.transcript);
}
```

Do not add empty configuration objects merely to make constructors uniform. A leaf with no dependencies can accept only its mount.

## Parent Composition and Update Flow

Parents compose the application by owning child instances and creating their mount elements, not by collecting child views. Updates reuse the mounts assigned during construction. If replacing a child mount is needed, then a new child component instance should be created. This should be extremely rare.


```ts
async updateState(event: ParentEvent): Promise<void> {
  if (event.type === "parent_and_child_changed") {
    this.state = applyParentChange(this.state, event);
    updateParentElements(this.getMount(), this.state);
    await this.firstChild.updateState(event.childEvent);
  } else if (event.type === "parent_only_changed") {
    this.state = applyParentChange(this.state, event);
    updateParentElements(this.getMount(), this.state);
  }
}
```

The exact child events depend on the behavior each child owns. A parent should call only the children affected by a transition. Children do not read sibling state or manipulate sibling DOM; the parent connects them through explicit events and values returned by read-only helper methods.

## Event-Handler Ownership

Every input event handler is defined on the highest component whose state is affected by the input event. When a descendant binds an ancestor-owned handler to a DOM event, the owning ancestor supplies the handler through the descendant's chain of constructors and each intermediate component passes it to the appropriate child.

The handler calls `updateState()` on that highest affected component. The component already knows its mount, so the handler does not need DOM context. The component handles its part of the event and delegates through its subtree, where each parent performs the required child state changes and DOM updates. Handlers do not separately call child `updateState()`, generate child views, or invoke a renderer.

For example, `ChatWindow` defines its submit handler and calls its own `updateState()` because submitting a message affects state owned by `ChatWindow`:

```ts
private handleSubmit = async (message: string): Promise<void> => {
  await this.updateState({ type: "submit_started", message });
};
```

### Taskpane events

`TaskpaneComponent` owns sign in and sign out because those operations affect its active-page state as well as child state. It supplies the relevant handlers as it constructs `OpenRouterAuthPage` and `ChatPage`; `ChatPage` passes the sign-out handler to `ChatHeader`.

### Chat events

`ChatWindow` owns the handlers for submit message, clear conversation, accept pending diff, reject pending diff, and restore to point because those operations affect state owned by `ChatWindow`. It also owns the corresponding controls and binds the handlers when it creates their DOM elements.

`ChatHeader` owns only the sign-out button DOM. It binds the sign-out handler supplied by `TaskpaneComponent` through `ChatPage`, because signing out affects taskpane-owned state. The copy-Markdown handler is owned by `ChatWindow` because copying and any visible "Copied" state are local to that component.

There is no global render function. Application initialization constructs the top-level component with the application mount, and the constructor builds the initial component tree:

```ts
Office.onReady(() => {
  const mount = document.getElementById("app-body")!;
  const keyStore = new OpenRouterKeyStore();

  configureOpenRouterClient(keyStore);
  new TaskpaneComponent(mount, { keyStore });
});
```
