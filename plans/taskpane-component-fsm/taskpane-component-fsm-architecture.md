# Taskpane Component FSM Architecture

Status: proposed for review. This document describes the target architecture and does not authorize runtime changes yet.

## Objective

Restructure the taskpane, OpenRouter authentication page, and chat page as a simple tree of components. Each component owns its state, exposes a consistent state-machine interface, and can be rendered independently at a stable boundary in the DOM.

The design should:

- make state ownership explicit;
- keep state mutation separate from view generation and DOM rendering;
- allow parent components to compose child outputs and views;
- allow a state change to rerender only the component subtree it affects;
- place event handlers at the lowest common ancestor of every component whose state they update;
- connect ancestor-owned handlers to child components when the parent constructs them;
- preserve DOM-free OpenRouter and Excel workflow code.

In practice, these components are extended finite state machines. A component has a finite control state, but it can also own associated data such as transcript entries, errors, counters, pending edits, and restore points.

## Component Tree

```text
TaskpaneComponent
|-- OpenRouterAuthPage
`-- ChatPage
    |-- ChatHeader
    |-- ChatTranscript
    `-- ChatComposer
```

`TaskpaneComponent`, `OpenRouterAuthPage`, and `ChatPage` are state-owning components. The initial `ChatHeader`, `ChatTranscript`, and `ChatComposer` implementations can be stateless, one-state components. Their main purpose is to provide independent rendering boundaries. They should acquire mutable state only when they have behavior that cannot be derived from their parent inputs.

OpenRouter key storage, OpenRouter key exchange, LLM workflows, and Excel operations are services used by component state transitions and event handlers. They are not visual components and do not implement the component interface.

## Component Contract

Output-generation inputs, view-generation inputs, and state-transition events are separate concepts and should use separate types.

```ts
export interface Component<ViewInputs, OutputInputs, Outputs, UpdateEvent> {
  readonly componentId: string;

  genOutputs?(input: OutputInputs): Outputs;
  genView(input: ViewInputs): ComponentView;
  updateState(event: UpdateEvent): void | Promise<void>;
}

export type ComponentView = {
  componentId: string;
  element: HTMLElement;
};
```

Constructor arguments are optional. A component uses constructor arguments only when it has actual initial values or long-lived dependencies to store.

```ts
constructor() {
  // Initialize component state when no external values or dependencies are needed.
}
```

Do not introduce a config argument or config type merely to make constructors uniform. Use a zero-argument constructor when the component can initialize itself. When a component has one stable dependency, it can accept that dependency directly; use a config object only when grouping real initialization values or dependencies makes the call clearer.

### `genOutputs(input)`

`genOutputs` is optional and must be omitted unless its returned snapshot is consumed outside the component that owns it. Valid consumers are another component or an external effect. A component's own `genView` is not an external consumer and does not justify adding `genOutputs`.

When derived data is used only to build the same component's DOM, derive it directly in `genView` or in a private helper called by `genView`. Do not add an output type merely to create a component-local view model.

`OutputInputs` contains parent-supplied computational data needed to derive the component's outputs. It does not contain DOM event handlers.

- It is synchronous.
- It does not mutate component state.
- It does not mutate the live DOM.
- It does not perform OpenRouter, Excel, clipboard, or other external effects.
- It returns an immutable snapshot for use outside the component that owns it.

A parent can call multiple child `genOutputs` methods, combine their results, and return its own output. Children do not read sibling state directly. When one child's output is needed as another child's input, the parent explicitly connects them.

The application should not introduce outputs merely to make every component return a model. If no cross-component or external-effect consumer exists, omit both `genOutputs` and its output types.

### `genView(input)`

`genView` creates the detached DOM representing the component's current state and `ViewInputs`.

`ViewInputs` normally contains changing parent-supplied presentation data needed to build the component's DOM. When a parent passes one component's output into another component's view, the receiving component's `ViewInputs` can include that output.

Event handlers are generally not `ViewInputs`. A handler owned by the component is defined on the component class. A handler owned by an ancestor is supplied through a constructor argument and stored by the component. Passing a handler through `genView` is reserved for unusual cases where the handler itself must vary between view generations.

- It does not update the live DOM.
- It can call child `genView` methods and insert their returned elements into its own element.
- It binds handlers defined on the component class or stored from constructor arguments.
- Its root element and returned `ComponentView` use the component's stable, explicit `componentId`.
- It derives the DOM from `ViewInputs` and the component's current state.

When a legitimate cross-boundary output and the owning component's `genView` need the same derived decision, that decision should have one shared private implementation rather than being independently encoded in both methods. This sharing case does not make component-local view derivation by itself a reason to add `genOutputs`.

Creating DOM nodes and binding handlers are view-generation operations. Replacing or mutating nodes already attached to the document is a rendering operation and is owned by the global renderer.

### `updateState(event)`

`updateState` is the only entry point for mutating component state.

- Its `UpdateEvent` input is a discriminated union of expected component events.
- It applies one atomic state transition.
- It can be synchronous or asynchronous.
- It can perform OpenRouter, Excel, clipboard, or other external effects required by the transition.
- It does not generate DOM or invoke the renderer.
- A parent transition can call child `updateState` methods when the same event changes state at multiple levels.

Mutually exclusive known event variants should be handled explicitly. The implementation should not add a catch-all branch for expected variants.

### Constructor

The constructor initializes component state and stores stable dependencies when they exist. Examples include the key store, Excel API, workflow functions, and ancestor-owned event handlers.

A component is not required to declare a constructor or accept a config argument. Prefer no constructor arguments when the component has no external initialization needs. Do not create empty config types, optional config objects, or placeholder constructor parameters for possible future requirements.

The constructor does not render the component. Initial rendering happens once at the application entry point after Office is ready.

## State-Update and Render Order

For every completed state transition, the required order is:

```text
updateState(updateEvent)
    |
    v
genView(viewInputs)
    |
    v
render(view)
```

In code:

```ts
await component.updateState(updateEvent);
render(component.genView(viewInputs));
```

`genView` must run after `updateState`. A view generated first would represent the old state and would be stale when rendered.

When `updateState` needs derived data from the pre-transition state or from child components, the handler can include an output snapshot in the update event:

```ts
const effectInput = component.genOutputs(outputInputs);

await component.updateState({
  type: "run_operation",
  effectInput,
});
render(component.genView(viewInputs));
```

`updateState` can perform the operation, update the component's state from its result, and return when the transition is complete. The handler then generates and renders the new view.

## Global Renderer

Every component view has a stable component ID. The renderer uses that explicit ID to find and replace the component's existing root element.

```ts
export function render(view: ComponentView, mount?: HTMLElement): void {
  const currentElement = document.getElementById(view.componentId);

  if (currentElement) {
    currentElement.replaceWith(view.element);
  } else if (mount) {
    mount.replaceChildren(view.element);
  }
}
```

The mount is rendering context, not component view data. The application entry point supplies it for the initial taskpane render. Later renders replace an existing component root and do not pass a mount.

The initial renderer uses component-subtree replacement, not general virtual-DOM reconciliation. The component passed to `render` determines the scope of the DOM update:

- rendering `TaskpaneComponent` replaces the taskpane component tree;
- rendering `OpenRouterAuthPage` replaces only the authentication page;
- rendering `ChatTranscript` replaces only the transcript;
- rendering `ChatComposer` replaces only the chat input controls.

Replacing an entire component root keeps the renderer simple. Components should therefore be split at boundaries where replacement has observable consequences. In particular, streaming transcript updates should not replace the chat composer and disturb its focus or browser-owned input state.

After the component architecture migration is complete, the renderer can add the shallow keyed transcript reconciliation described in the post-migration optimization section. The initial migration should not combine the component architecture change with that optimization.

Focus, scrolling, and similar operations that require an attached element are post-render DOM behavior. If they cannot be expressed by normal HTML behavior, `ComponentView` can later carry narrowly scoped post-render metadata or a callback. This should be added only for an actual requirement such as scrolling the newly rendered transcript.

## Parent Composition

The top-level component owns the active page and composes the selected child's view.

```ts
type TaskpaneState = {
  activePage: "openrouter-auth" | "chat";
};

type TaskpaneUpdateEvent =
  | { type: "sign_in" }
  | { type: "sign_out" };
```

Page selection is an outcome of these authentication events rather than a public taskpane event of its own.

A simplified `TaskpaneComponent` constructor connects its handlers to its children once:

```ts
constructor(config: TaskpaneComponentConfig) {
  this.keyStore = config.keyStore;
  this.openRouterAuthPage = new OpenRouterAuthPage({
    onSignIn: this.handleSignIn,
  });
  this.chatPage = new ChatPage({
    onSignOut: this.handleSignOut,
  });
}
```

Its `genView` then supplies only current view data:

```ts
genView(): ComponentView {
  let pageView: ComponentView;

  if (this.state.activePage === "openrouter-auth") {
    pageView = this.openRouterAuthPage.genView(this.genOpenRouterAuthViewInputs());
  } else if (this.state.activePage === "chat") {
    pageView = this.chatPage.genView(this.genChatViewInputs());
  }

  const element = document.createElement("main");
  element.id = "taskpane-app";
  element.className = "pane assistant-chat";
  element.appendChild(pageView.element);

  return {
    componentId: "taskpane-app",
    element,
  };
}
```

The parent renders only the active page. The application does not need to retain both page trees and toggle their `hidden` properties.

## Event-Handler Ownership

An event handler is defined on the lowest component that owns all state affected by the operation. When a descendant binds that handler to a DOM event, the owning ancestor supplies it through a constructor argument as it instantiates its child hierarchy. Each child stores the handler it needs. View generation binds the stored handler without requiring it to be passed again.

### Taskpane handlers

`TaskpaneComponent` owns:

- sign in, because it changes authentication state and the active page;
- sign out, because it clears the credential, changes the active page, and can reset affected child state.

`TaskpaneComponent` supplies its sign-in handler when it constructs `OpenRouterAuthPage`. It supplies its sign-out handler when it constructs `ChatPage`; `ChatPage` supplies the stored handler when it constructs `ChatHeader`.

### Chat handlers

`ChatPage` owns:

- submit message;
- clear conversation;
- accept pending diff;
- reject pending diff;
- restore to point.

These operations update only chat-owned state and related Excel state. `ChatPage` supplies their handlers when it constructs `ChatComposer` and `ChatTranscript`.

Copying Markdown can remain owned by `ChatTranscript`. If the visible "Copied" status becomes application state rather than short-lived DOM feedback, it should be represented as transcript component state and updated through `updateState`.

## OpenRouter Authentication Component

`OpenRouterAuthPage` owns a discriminated authentication state:

```ts
type OpenRouterAuthState =
  | { phase: "select_provider" }
  | { phase: "signing_in" }
  | { phase: "error"; message: string };
```

Its events can be:

```ts
type OpenRouterAuthEvent =
  | { type: "sign_in_started" }
  | { type: "sign_in_succeeded" }
  | { type: "sign_in_failed"; message: string }
  | { type: "reset" };
```

`genView` derives the visible button, status, and error presentation directly from this state. The authentication component does not implement `genOutputs` because these values are used only by its own view.

The page stores the taskpane-owned handler directly from its constructor argument:

```ts
constructor(onSignIn: () => Promise<void>) {
  this.onSignIn = onSignIn;
}
```

`genView` binds `this.onSignIn` to the sign-in button. The handler does not need to be included in `OpenRouterAuthViewInputs`.

The top-level sign-in handler coordinates the external key exchange and the parent and child transitions:

```ts
private handleSignIn = async (): Promise<void> => {
  this.openRouterAuthPage.updateState({ type: "sign_in_started" });
  render(this.openRouterAuthPage.genView(this.genAuthViewInputs()));

  try {
    const key = await acquireOpenRouterApiKey();
    this.keyStore.set(key);

    await this.updateState({ type: "sign_in" });
    render(this.genView());
  } catch (error) {
    this.openRouterAuthPage.updateState({
      type: "sign_in_failed",
      message: getErrorMessage(error),
    });
    render(this.openRouterAuthPage.genView(this.genAuthViewInputs()));
  }
};
```

For `sign_in`, `TaskpaneComponent.updateState` delegates `sign_in_succeeded` to `OpenRouterAuthPage` and changes `activePage` to `chat`. For `sign_out`, it clears the credential, resets affected child state, and changes `activePage` to `openrouter-auth`.

## Chat Component

`ChatPage` owns the existing conversation state, terminal chat FSM state, pending edit, restore points, potential restore points, and monotonically increasing counters.

The existing terminal `ChatFsmState` values remain the control states in which the application waits for user input:

```ts
type ChatFsmState =
  | "answered"
  | "awaiting_clarification"
  | "pending_edit_preprocessed"
  | "pending_edit"
  | "errored";
```

Transient operations such as reading a worksheet, streaming a response, applying changes, or generating a comparison should not become additional `ChatFsmState` values. Their progress is represented by associated operation data and working transcript entries while the current transition is running.

`ChatPage.genOutputs` derives the complete presentation model:

```ts
type ChatOutputs = {
  transcript: readonly ChatTranscriptEntry[];
  controls: {
    inputDisabled: boolean;
    reviewDisabled: boolean;
  };
};
```

UI properties such as whether a restore, accept, or reject control is disabled should be derived from current chat state and active operation data. They should not be independently mutated on transcript entries.

`ChatPage` connects its handlers to the child components when it constructs them:

```ts
constructor(config: ChatPageConfig) {
  this.chatHeader = new ChatHeader({
    onSignOut: config.onSignOut,
    onClear: this.handleClear,
  });
  this.chatTranscript = new ChatTranscript({
    onAccept: this.handleAccept,
    onReject: this.handleReject,
    onRestore: this.handleRestore,
  });
  this.chatComposer = new ChatComposer({
    onSubmit: this.handleSubmit,
  });
}
```

`ChatPage.genView` then composes the smaller chat views from generated output and changing view data:

```ts
genView(viewInputs: ChatViewInputs): ComponentView {
  const output = this.genOutputs(viewInputs.outputInputs);

  const transcriptView = this.chatTranscript.genView({
    entries: output.transcript,
  });

  const composerView = this.chatComposer.genView({
    disabled: output.controls.inputDisabled,
  });

  // Compose and return the chat page view.
}
```

The parent can render the whole chat page for initialization and structural changes. During streaming, it can render only the transcript. It renders the composer when the enabled state of chat input controls changes.

## Asynchronous Workflows

`updateState` can perform OpenRouter requests, Excel operations, clipboard writes, and other asynchronous effects as part of a transition. The event handler awaits the transition before generating and rendering the resulting view.

```text
DOM event
    |
    v
handler optionally gathers OutputInputs with genOutputs
    |
    v
await updateState(event)
    |
    +-- update component and child state
    +-- perform OpenRouter, Excel, or other effects
    |
    v
genView + render affected components
```

If an operation only needs a final view, one `updateState` call can own the entire asynchronous operation. If the UI must show intermediate progress or streaming output, the operation is represented by multiple meaningful update events and the handler renders between them. This is a rendering-frequency decision, not a restriction on which events may perform effects.

For example, the handler can render a starting transition and then apply and render streamed workflow transitions. Any of those `updateState` calls can perform additional effects:

```ts
private handleSubmit = async (message: string): Promise<void> => {
  const workflowInput = this.genOutputs(outputInputs).workflowInput;

  await this.updateState({ type: "submit_started", message });
  this.renderChatChildren();

  for await (const event of runChatWorkflow(workflowInput)) {
    await this.updateState({ type: "workflow_event", event });
    this.renderChatChildren();
  }
};
```

The exact workflow event union can preserve the existing assistant-level events such as partial responses, proposed-change progress, clarification requests, and completion. Low-level OpenRouter streaming events remain contained in the OpenRouter client and LLM workflow modules.

`updateState` owns any state changes and effects assigned to the transition, but it does not need to know which component boundary the handler will render afterward.

## Initialization

`taskpane.html` provides one stable mount element rather than predeclaring both page roots.

After Office is ready, the entry point:

1. constructs the credential store and configures the OpenRouter client;
2. constructs `TaskpaneComponent` and its child components;
3. selects the initial page from explicit credential state;
4. calls `app.genView()`;
5. passes the returned view and taskpane mount to the global renderer.

Conceptually:

```ts
Office.onReady(() => {
  const keyStore = new OpenrouterKeyStore();
  configureOpenRouterClient(keyStore);

  const app = new TaskpaneComponent({
    keyStore,
  });

  render(app.genView(), document.getElementById("app-body")!);
});
```

Activation is represented by normal component events rather than a separate page lifecycle interface. If entering a page requires an external operation, such as creating the OpenRouter management URL, the corresponding `updateState` transition can perform that operation before the handler rerenders the affected component.

## Mapping from the Current Architecture

### `src/taskpane/taskpane.ts`

Replace `TaskpanePage` and `PageManager` with:

- the component contract;
- `ComponentView`;
- the global `render` function;
- `TaskpaneComponent` as the top-level state owner and composition root.

`showPage` is replaced by the `sign_in` and `sign_out` taskpane transitions followed by rendering `TaskpaneComponent`.

### `src/taskpane/pages/openrouter-auth/openrouter-auth-page.ts`

Replace `initialize`, `activate`, `renderSelectProvider`, `renderInProgress`, and `renderError` with:

- explicit authentication state;
- `genView`;
- `updateState`.

The top-level sign-in handler coordinates the key-exchange effect. After a successful exchange, `TaskpaneComponent.updateState({ type: "sign_in" })` updates the authentication child and active page together.

### `src/taskpane/pages/chat/chat-page.ts`

Make `ChatPage` the UI component and event-handler owner. It composes chat header, transcript, and composer views. It uses outputs from the chat state owner to generate their inputs and invokes the global renderer for the affected boundaries.

### `src/taskpane/pages/chat/chat-state-machine/chat-state-machine.ts`

Remove the `ChatStateMachineUI` dependency and direct DOM rendering callbacks. `ChatStateMachine.updateState` can retain OpenRouter and Excel effects that naturally belong to its transitions. `ChatPage` awaits those transitions, generates the affected views, and invokes the global renderer.

The state machine can remain an internal state owner used by `ChatPage`, or its state and transition methods can move directly into `ChatPage`. Keeping it as an internal DOM-free state object is preferable while it continues to contain substantial conversation and edit-lifecycle behavior.

### HTML fragments

`taskpane.html` retains the application mount and shared CSS references. The auth and chat HTML fragments can initially remain static templates cloned by `genView`. They can be replaced with direct DOM construction incrementally where doing so makes state-to-view mapping clearer.

## Post-Migration Optimization: Shallow Keyed Transcript Reconciliation

After the new component architecture is fully migrated and working, add an optional shallow keyed reconciliation mode for `ChatTranscript`. This optimization prevents an appended or updated transcript entry from replacing every existing transcript DOM node.

The optimization is deliberately limited to the direct children of one component root. It is not a generic recursive virtual DOM.

### Renderer contract

Extend `ComponentView` with explicit rendering modes:

```ts
export type ComponentView = {
  componentId: string;
  element: HTMLElement;
  renderMode: "replace" | "reconcile_children";
};
```

All components initially use `replace`. `ChatTranscript` uses `reconcile_children` after the optimization is introduced.

The renderer handles the two expected modes directly:

```ts
if (view.renderMode === "replace") {
  currentElement.replaceWith(view.element);
} else if (view.renderMode === "reconcile_children") {
  reconcileChildren(currentElement, view.element);
}
```

### Stable transcript entry identity

Add a stable monotonically increasing ID to every transcript entry. Do not use `workflowId` as the render key because one workflow can produce multiple transcript entries.

`ChatTranscript.genView` writes the entry ID to the direct child element:

```ts
entryElement.dataset.viewKey = `transcript-entry-${entry.id}`;
```

Tests and other behavior should rely on stable entry identity, not the string format of the DOM key.

### Reconciliation behavior

`reconcileChildren` compares the desired direct children returned by `genView` with the currently attached direct children:

1. index the current children by `data-view-key`;
2. walk the desired children in their desired order;
3. insert a desired child when its key is new;
4. reuse an existing child when its key and DOM content are unchanged;
5. replace only the existing child when its keyed DOM content changed;
6. move a reused child when its desired position changed;
7. remove existing children whose keys are absent from the desired view.

The initial implementation can use `Node.isEqualNode` to compare the existing and newly generated keyed elements. Event listeners are not part of that comparison, which is acceptable because handlers are stable component class members or constructor dependencies. An unchanged keyed node retains its existing listener.

This supports the current transcript behaviors:

- append only the new human, system, working, restore, or diff-review entry;
- replace only the active system message as streamed text changes;
- replace only a working entry when its status text changes;
- remove only a completed working entry;
- replace only review or restore entries whose disabled state changes;
- remove or reorder the affected entries when restoring conversation state.

The transcript root must keep stable attributes while using shallow reconciliation. Component-level changes to the transcript root continue to use `replace`.

### Scope and limitation

This optimization reduces live-DOM replacement, event-listener rebinding, layout work, and disruption of browser-owned element state. `genView` still creates candidate DOM for the complete transcript, and reconciliation still walks all direct transcript children. View generation and comparison therefore remain proportional to transcript length even though committed DOM changes are proportional to the changed entries.

Lazy node generation, DOM caching, recursive reconciliation, property-level patching, and a generic virtual DOM are outside the scope of this optimization. Add them only if profiling after shallow reconciliation identifies detached DOM generation or Markdown parsing as a material bottleneck.

## Migration Sequence

1. Add the component contract, `ComponentView`, renderer, and `TaskpaneComponent` without changing chat behavior.
2. Convert `OpenRouterAuthPage` to explicit state, view generation, and state transitions.
3. Replace page visibility mutation with top-level component composition and rendering.
4. Remove the `ChatStateMachineUI` callbacks and expose chat presentation outputs.
5. Define the chat update events and decide which effects belong inside each `ChatStateMachine.updateState` transition. Split an operation into multiple events only where intermediate rendering is required.
6. Extract `ChatHeader`, `ChatTranscript`, and `ChatComposer` as independent render boundaries.
7. Derive control states from chat state instead of mutating disabled flags on transcript entries.
8. Remove obsolete initialization, activation, and direct-render methods after all callers use the component interface.
9. After the architecture migration is complete and verified, add stable transcript entry IDs and the shallow keyed `reconcile_children` renderer mode.

Each step should preserve current behavior and keep the diff limited to the boundary being migrated.

## Architectural Constraints

- Component state is private to the component that owns it.
- Parents coordinate siblings; siblings do not call each other directly.
- Components define their own handlers or store ancestor-owned handlers supplied through constructor arguments.
- Event handlers are passed through `ViewInputs` only when they must vary between view generations.
- State transitions do not render.
- View generation does not mutate the live DOM.
- Rendering does not decide application state.
- External services do not depend on DOM components.
- Component IDs are explicit and stable; the renderer does not infer identity from unrelated state.
- Chat FSM control states continue to represent terminal states that wait for new user input.
- Component boundaries are introduced for real state ownership or rendering isolation, not merely to wrap small helper functions.
