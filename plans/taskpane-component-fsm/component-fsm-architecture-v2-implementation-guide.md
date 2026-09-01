# Component FSM Architecture V2 Implementation Guide

Status: recommended implementation guidance. The Component FSM Architecture V2 contract does not enforce the class structure described here.

## Purpose

This guide recommends a consistent way to organize components that implement Component FSM Architecture V2. The architecture still requires constructors, mounts, and `updateState()` to behave as defined in `taskpane-component-fsm-architecture-v2.md`. The recommendations below concern internal class structure and naming only.

Use a simpler structure when it makes a component clearer. In particular, a small leaf component may not need a stable root field, an initialization helper, or child-component coordination.

## Recommended Component Structure

### Name the owned root `rootElement`

Use `mount` for the parent-provided DOM boundary and `rootElement` for the component-owned root created beneath that mount.

```text
parent-owned mount
`-- component-owned rootElement
    `-- component-owned DOM and child mounts
```

Storing a stable `rootElement` is useful when `updateState()` frequently changes content inside the component without replacing its parent-provided mount. The explicit name prevents confusion between the external mount and the component's own root.

A component that does not need a stable owned root can omit this field.

### Create the initial DOM in a private helper

Keep the constructor focused on initialization order:

1. store dependencies and the mount;
2. initialize component state;
3. call a private helper that creates and attaches the initial DOM; and
4. construct child components with the mounts returned by that helper.

The helper can be named `createInitialDom()` and should return the DOM elements the constructor needs for later initialization. It is part of constructor initialization and may create and attach DOM. It should not be called as an alternative update path after construction; later DOM changes belong in `updateState()`.

This helper is recommended when construction requires several related elements. A leaf that creates one simple element can keep that work directly in its constructor if extracting it would make the implementation harder to read.

### Do not duplicate child mount references

Store child component instances, but normally do not also store their mount elements as parent fields. The child already exposes its current mount through `getMount()`.

During construction, keep each child mount local long enough to pass it to the child's constructor. After construction, use the child component as the source of truth:

```ts
this.rootElement.replaceChildren(this.chatPage.getMount());
```

If a structural update creates a new mount for a child, call `child.setMount(newMount)`. Do not update a second parent-owned mount field in parallel. This avoids duplicated references that can disagree after a remount.

Keeping a separate child mount field is acceptable when the parent has a real need for that element independent of the child. It should not be stored merely as a shortcut for `child.getMount()`.

## Parent Component Example

The following example applies all three recommendations:

```ts
type ParentState = {
  activeChild: "first" | "second";
};

type ParentUpdateEvent =
  | { type: "show_first" }
  | { type: "show_second" };

class ParentComponent implements Component<ParentUpdateEvent> {
  private mount: HTMLElement;
  private readonly rootElement: HTMLElement;
  private readonly firstChild: FirstChild;
  private readonly secondChild: SecondChild;
  private state: ParentState;

  constructor(mount: HTMLElement) {
    this.mount = mount;
    this.state = { activeChild: "first" };

    const initialDom = this.createInitialDom();
    this.rootElement = initialDom.rootElement;
    this.firstChild = new FirstChild(initialDom.firstChildMount);
    this.secondChild = new SecondChild(initialDom.secondChildMount);
  }

  getMount(): HTMLElement {
    return this.mount;
  }

  setMount(mount: HTMLElement): void {
    this.mount = mount;
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
    firstChildMount: HTMLElement;
    secondChildMount: HTMLElement;
  } {
    const rootElement = document.createElement("section");
    const firstChildMount = document.createElement("div");
    const secondChildMount = document.createElement("div");

    rootElement.append(firstChildMount);
    this.mount.replaceChildren(rootElement);

    return {
      rootElement,
      firstChildMount,
      secondChildMount,
    };
  }
}
```

The child mounts are created once by `createInitialDom()`. They remain local during parent construction, become owned by their respective child components, and are later retrieved through `getMount()`. `ParentComponent` stores only its own mount, its owned root, its children, and its FSM state.

## Relationship to Architecture Requirements

These recommendations do not add requirements to the Component FSM Architecture V2 contract:

- the owned root can have another clear name or need not be stored;
- initial DOM can be constructed directly in a simple constructor;
- a parent can store a child mount when there is a concrete reason; and
- components can use other private helpers appropriate to their implementation.

Regardless of internal structure, construction remains the initialization exception. After construction, component state and component-owned DOM are modified only through `updateState()`. Read-only helpers exposed to parent components may inspect current state or derive values, but they must not mutate state or DOM.
