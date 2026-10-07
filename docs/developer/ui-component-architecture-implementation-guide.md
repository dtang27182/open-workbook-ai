# UI Component Architecture Implementation Guide

## Purpose

This guide shows how to implement common application patterns using the [UI Component Architecture](./ui-component-architecture.md). The architecture defines the required component contract. This guide's recommendations are not prescriptive, but implementers should have a clear reason for deviating from them.

## UI Component Constructor

Keep the component constructor focused on initialization, generally in this order:

1. store the mount;
2. initialize component state, including dependencies that are not UI components;
3. create and attach the initial DOM beneath the mount, including mount elements for any child components; and
4. construct any child components using those mount elements.

For most nontrivial components, encapsulate the DOM initialization logic in a `createInitialDom()` helper called by the constructor. A leaf that creates one simple element can keep that work directly in its constructor if extracting it would make the implementation harder to read.

The helper creates DOM elements only and returns the child mounts and any owned DOM elements the constructor needs to retain or use for further initialization. The constructor uses the returned mounts to create child component instances.

Implement the helper as an instance method or a module-level function that receives the mount and required event handlers or values. It runs during construction; subsequent DOM changes belong to the component's `updateState()` call path.

## Composing and Retaining Children

Create child component instances in the parent constructor, using the child mounts returned by `createInitialDom()`. Each child constructor creates the DOM beneath its own mount. Child UI Components should generally be retained as instance variables in the parent. 

### Retrieve child mounts through their instances

Store child component instances and retrieve their permanent mounts through `getMount()`. Normally, no duplicate parent fields for child mounts are needed.

During construction, keep each child mount local long enough to pass it to the child's constructor. After construction, use the child component as the source of truth:

```ts
this.mount.replaceChildren(this.chatPage.getMount());
```

Keeping a separate child mount field is acceptable when the parent has a real need for that element independent of the child. It should not be stored merely as a shortcut for `child.getMount()`.

### Reuse children when switching views

Ordinary updates reuse child instances and their mounts. A parent can detach and reattach a child's existing mount when switching views while retaining the child's state. If a different mount is genuinely needed, construct a new child instance with that mount and replace the parent's reference. This should be extremely rare.

## Implementing updateState()

### Delegate event-specific logic to state transition helpers

A **state transition helper** is called by `updateState()` to implement the transition logic for a specific update event type, including state changes, DOM updates, external effects, and child updates.

Generally, keep `updateState()` focused on checking the input event's type and calling the state transition helper for that event. This keeps event dispatch easy to follow as individual transitions grow.

State transition helpers can be private instance methods or module-level functions that receive the state, mount, and dependencies they need. They run within the owning component's `updateState()` call path and can perform asynchronous work. A short, simple transition can remain directly in `updateState()` when extracting a state transition helper would not improve clarity.

### Components without update events

Components with no update events can use `Component<never>` and a no-op `updateState()`, as `ChatPage` and `ChatHeader` do. They can still create child components and bind ancestor-owned event handlers to DOM events during construction.

## Implementing Component Interactions

### Read child state and request updates

Read child state information through state query methods for specific use cases. These methods provide output values without changing state or DOM or initiating external side effects, and follow the restrictions defined in the UI Component Architecture contract.

Parents call child `updateState()` methods with explicit update events. Pass needed values, such as a height limit, rather than giving children references to parent or sibling components or access to ancestor DOM. Parent helpers delegate child changes through the child's update interface.

### Sibling-to-sibling interactions

When an input event requires data to pass between sibling components, define its event handler on their common parent. The component that owns the relevant DOM binds the handler to the DOM event. If that component is a descendant of the parent, pass the handler through the intervening constructors. The handler calls the parent's `updateState()`, which coordinates the transfer directly or through a state transition helper.

Within that call path, the parent reads the required data through state query methods on the source siblings and transforms the returned values when needed. It then calls the recipient siblings' `updateState()` methods with explicit update events carrying those values.

### Child-to-parent interactions

When an input event requires the parent to use data from a child to update its own state or DOM, define the event handler on the parent. The component that owns the relevant DOM binds the handler to the DOM event. If that component is a descendant of the parent, pass the handler through the intervening constructors. The handler calls the parent's `updateState()`, which handles the transition directly or through a state transition helper.

Within that call path, the parent reads the required data through the child's state query methods and transforms the returned values when needed. It uses those values to update its own state and DOM.

## Worked Example: A Parent Component

This parent creates child mounts in `createInitialDom()`, constructs the children in its constructor, and delegates each view-switch event to a private state transition helper. Switching views reuses both child instances and their mounts:

```ts
type ParentState = {
  activeChild: "first" | "second";
};

type ParentUpdateEvent =
  | { type: "show_first" }
  | { type: "show_second" };

class ParentComponent implements Component<ParentUpdateEvent> {
  private readonly mount: HTMLElement;
  private readonly firstChild: FirstChild;
  private readonly secondChild: SecondChild;
  private state: ParentState;

  constructor(mount: HTMLElement) {
    this.mount = mount;
    this.state = { activeChild: "first" };

    const initialDom = this.createInitialDom();
    this.firstChild = new FirstChild(initialDom.firstChildMount);
    this.secondChild = new SecondChild(initialDom.secondChildMount);
  }

  getMount(): HTMLElement {
    return this.mount;
  }

  updateState(event: ParentUpdateEvent): void {
    if (event.type === "show_first") {
      this.showFirstChild();
    } else if (event.type === "show_second") {
      this.showSecondChild();
    }
  }

  private showFirstChild(): void {
    this.state.activeChild = "first";
    this.mount.replaceChildren(this.firstChild.getMount());
  }

  private showSecondChild(): void {
    this.state.activeChild = "second";
    this.mount.replaceChildren(this.secondChild.getMount());
  }

  private createInitialDom(): {
    firstChildMount: HTMLElement;
    secondChildMount: HTMLElement;
  } {
    const firstChildMount = document.createElement("div");
    const secondChildMount = document.createElement("div");

    this.mount.replaceChildren(firstChildMount);

    return {
      firstChildMount,
      secondChildMount,
    };
  }
}
```

The parent's `createInitialDom()` creates and returns DOM mount elements only. The constructor creates and retains each child as an instance field with a permanent mount. The state transition helpers update the parent's state and attach the selected child's existing mount through `getMount()`.
