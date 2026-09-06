# Component Architecture Implementation Guide

Status: recommended implementation guidance. The [Component Architecture](./component-architecture.md) defines the component contract; this guide recommends ways to organize its implementation.

## Purpose

This guide recommends a consistent way to organize components that implement the [Component Architecture](./component-architecture.md). Constructors initialize state and DOM beneath a permanent mount, and subsequent mutations enter through `updateState()`. The recommendations below concern internal structure and naming, not additional interface requirements.

Use a simpler structure when it makes a component clearer. In particular, a small leaf component may not need a stable root field, an initialization helper, or child-component coordination.

## Applying the Contract to Features

Use the component contract to decide where responsibilities belong before listing implementation changes:

- **Choose the component boundary first.** A cohesive UI element can own its DOM and behavior through a small component.
- **Route updates to the component whose state changes.** Local input updates belong to the input component's `updateState()`; conversation updates belong to the chat component's `updateState()`. An existing parent does not need to handle every new event.
- **Keep DOM ownership exclusive.** Parents provide mounts; children construct and modify their own contents. Parent helpers delegate child changes through the child's update interface.
- **Connect components through explicit interfaces.** Parents send update events and supply callbacks. Pass needed values, such as a height limit, rather than giving children access to ancestor DOM. A child can own a control's DOM while invoking an ancestor-owned callback for the wider action.
- **Use construction helpers for composition.** Keep child creation and related observer wiring together in `createInitialDom()`. Return the initialized child and retain it in the parent's existing state holder when one is used, avoiding a second ownership location. Each child constructor creates the DOM beneath its own mount.

## Recommended Component Structure

### Name the owned root `rootElement`

Use `mount` for the parent-provided DOM boundary and `rootElement` for the component-owned root created beneath that mount.

```text
parent-owned mount
`-- component-owned rootElement
    `-- component-owned DOM and child mounts
```

Store `rootElement` when a distinct wrapper helps with layout or access to the component's DOM. The explicit name distinguishes that owned element from the parent-provided mount.

A component can also attach its owned elements directly beneath `mount` and omit `rootElement`. The mount remains fixed in either structure.

### Create the initial DOM in a helper

Keep the constructor focused on initialization order:

1. store dependencies and the mount;
2. initialize component state;
3. call an initialization helper that creates and attaches the initial DOM, constructs children, and wires related observers; and
4. retain the returned child instances and complete any state initialization that depends on them.

The helper can be named `createInitialDom()` and should return the child instances and any owned DOM elements needed for the remaining initialization. It can be an instance method or a module-level function that receives the mount and required handlers or values. It runs as part of construction; later DOM changes belong to the owning component's `updateState()` call path, including observer callbacks that send update events to a child.

This helper is recommended when construction requires several related elements. A leaf that creates one simple element can keep that work directly in its constructor if extracting it would make the implementation harder to read.

### Delegate transition work to focused helpers

Keep `updateState()` focused on event dispatch and transition coordination. Delegate state changes, DOM updates, external effects, and child coordination to focused instance methods or module-level functions, including asynchronous workflows.

Pass module-level helpers the state, mount, handlers, or dependencies they need. For example, chat workflows receive `ChatWindowState`, while DOM helpers receive the mount, transcript entries, and handlers. These functions perform work within the component's `updateState()` call path; managers handle model, worksheet, and restore operations separately.

Input handlers call `updateState()` on the highest component whose state the event affects. Ancestor-owned callbacks are passed through constructors to the descendant that binds them. Helpers exposed for parents to inspect state remain read-only.

Components with no update events can use `Component<never>` and a no-op `updateState()`, as `ChatPage` and `ChatHeader` do. They can still create child components and bind ancestor-owned handlers during construction.

### Do not duplicate child mount references

Store child component instances and retrieve their permanent mounts through `getMount()`. Normally, no duplicate parent fields for child mounts are needed.

During construction, keep each child mount local long enough to pass it to the child's constructor. After construction, use the child component as the source of truth:

```ts
this.rootElement.replaceChildren(this.chatPage.getMount());
```

Ordinary updates reuse child instances and their mounts. A parent can detach and reattach a child's existing mount when switching views while retaining the child's state. If a different mount is genuinely needed, construct a new child instance with that mount and replace the parent's reference. This should be extremely rare.

Keeping a separate child mount field is acceptable when the parent has a real need for that element independent of the child. It should not be stored merely as a shortcut for `child.getMount()`.

## Parent Component Example

This illustrative parent uses an owned root, an initialization helper, and child mount getters. Switching views preserves both child instances:

```ts
type ParentState = {
  activeChild: "first" | "second";
};

type ParentUpdateEvent =
  | { type: "show_first" }
  | { type: "show_second" };

class ParentComponent implements Component<ParentUpdateEvent> {
  private readonly mount: HTMLElement;
  private readonly rootElement: HTMLElement;
  private readonly firstChild: FirstChild;
  private readonly secondChild: SecondChild;
  private state: ParentState;

  constructor(mount: HTMLElement) {
    this.mount = mount;
    this.state = { activeChild: "first" };

    const initialDom = this.createInitialDom();
    this.rootElement = initialDom.rootElement;
    this.firstChild = initialDom.firstChild;
    this.secondChild = initialDom.secondChild;
  }

  getMount(): HTMLElement {
    return this.mount;
  }

  updateState(event: ParentUpdateEvent): void {
    if (event.type === "show_first") {
      this.state.activeChild = "first";
      this.rootElement.replaceChildren(this.firstChild.getMount());
    } else if (event.type === "show_second") {
      this.state.activeChild = "second";
      this.rootElement.replaceChildren(this.secondChild.getMount());
    }
  }

  private createInitialDom(): {
    rootElement: HTMLElement;
    firstChild: FirstChild;
    secondChild: SecondChild;
  } {
    const rootElement = document.createElement("section");
    const firstChildMount = document.createElement("div");
    const secondChildMount = document.createElement("div");

    rootElement.append(firstChildMount);
    this.mount.replaceChildren(rootElement);

    return {
      rootElement,
      firstChild: new FirstChild(firstChildMount),
      secondChild: new SecondChild(secondChildMount),
    };
  }
}
```

The parent creates child mounts and instances once in `createInitialDom()` and assigns each mount as a child's permanent DOM boundary. It later retrieves them through `getMount()`. This example stores child instances directly on the parent; when the parent uses a state holder for these references, retain them there instead.

## Relationship to Architecture Requirements

Choose the simplest internal structure that satisfies the Component Architecture contract:

- the owned root can have another clear name or need not be stored;
- initial DOM can be constructed directly in a simple constructor;
- a parent can store a child mount when there is a concrete reason; and
- components can use instance helpers or module-level functions appropriate to their implementation.

Every component receives its permanent mount during construction. Construction initializes state and DOM. After construction, mutations to component state and owned DOM occur through the `updateState()` call path, including its helpers and workflows. Read-only helpers exposed to parents inspect state or derive values without changing state or DOM.
