# Taskpane Component FSM Architecture

Status: proposed for review. This document describes the target architecture and does not authorize runtime changes yet.

## Architecture

The taskpane is a tree of state-machine components:

```text
TaskpaneComponent
|-- OpenRouterAuthPage
`-- ChatPage
    |-- ChatHeader
    `-- ChatTranscript
```

Each component owns its state and the live DOM below a mount element supplied by its parent. State transitions and UI updates happen together: after changing its state, a component creates, replaces, or edits the DOM under its mount so that the DOM represents the new state. Components do not return detached views for their parents to compose.

Services such as OpenRouter key storage, LLM workflows, and Excel operations remain outside the visual component tree. Components can invoke those services as part of a state transition, but the services do not depend on component or DOM APIs.

## Component Contract

```ts
export interface Component<OutputInputs, Outputs, UpdateEvent> {
  genOutputs?(input: OutputInputs): Outputs;
  updateState(event: UpdateEvent, mount: HTMLElement): void | Promise<void>;
}
```

`genView()` is not part of the component interface. A component, especially a leaf component, can use a private helper to create DOM from its current state, but only the component itself calls that helper and attaches the result beneath its mount.

`genOutputs()` remains optional. It synchronously returns an immutable snapshot only when another component or an external effect needs data owned or derived by the component. It does not mutate state, update the DOM, or perform external effects. A parent can call child `genOutputs()` methods before or during its own transition when it needs their current data.

`updateState()` is the public entry point for both a component transition and the corresponding UI update. It:

- handles an expected variant of the component's `UpdateEvent` union;
- updates the component's owned state;
- performs any external effects assigned to the transition;
- creates or edits DOM only below the supplied mount;
- prepares the mount elements required by its children; and
- calls child `updateState()` methods with the appropriate child events and mounts.

A parent can update its own state and DOM before or after updating its children, according to the needs of the transition. When an event changes the component tree, the parent creates or replaces the required child mounts before calling the affected children.

## Construction and Initialization

A component constructor receives its mount element along with any real initial values, stable dependencies, or ancestor-owned handlers. Construction is the initial transition: it initializes state and immediately creates the component's initial DOM below the mount.

For a parent component, construction also creates the mount elements for its children and then constructs each child with its mount. Regular `updateState()` calls reuse existing child instances, preparing or replacing their mount elements only when the UI structure requires it.

```ts
constructor(mount: HTMLElement, config: ChatPageConfig) {
  this.state = createInitialChatState();

  const element = document.createElement("section");
  const headerMount = document.createElement("div");
  const transcriptMount = document.createElement("div");

  element.append(headerMount, transcriptMount);
  mount.replaceChildren(element);

  this.chatHeader = new ChatHeader(headerMount, config.header);
  this.chatTranscript = new ChatTranscript(transcriptMount, config.transcript);
}
```

Do not add empty configuration objects merely to make constructors uniform. A leaf with no dependencies can accept only its mount.

## Parent Composition and Update Flow

Parents compose the application by owning child instances and child mount elements, not by collecting child views. A simplified parent update has this shape:

```ts
async updateState(event: ChatPageEvent, mount: HTMLElement): Promise<void> {
  if (event.type === "submit_started") {
    this.state = beginSubmission(this.state, event.message);
  } else if (event.type === "workflow_event") {
    this.state = applyWorkflowEvent(this.state, event.event);
  } else if (event.type === "clear") {
    this.state = createInitialChatState();
  }

  const output = this.genOutputs(this.outputInputs);
  const headerMount = getHeaderMount(mount);
  const transcriptMount = getTranscriptMount(mount);

  await this.chatHeader.updateState(
    { type: "sync", output: output.header },
    headerMount,
  );
  await this.chatTranscript.updateState(
    { type: "sync", entries: output.transcript },
    transcriptMount,
  );
}
```

The exact child events depend on the behavior each child owns. A parent should call only the children affected by a transition. Children do not read sibling state or manipulate sibling DOM; the parent connects them through explicit events and outputs.

DOM input handlers route their events to the top-level `TaskpaneComponent`, even when a descendant binds the handler to an element. The handler calls `TaskpaneComponent.updateState()` with the application mount. The top-level component handles its part of the event and delegates through the component tree, where each parent performs the required child state changes and DOM updates. Handlers do not separately call child `updateState()`, generate child views, or invoke a renderer.

```ts
private handleSubmit = async (message: string): Promise<void> => {
  await this.updateState(
    { type: "chat", event: { type: "submit_started", message } },
    this.mount,
  );
};
```

There is no global render function. Application initialization constructs the top-level component with the application mount, and the constructor builds the initial component tree:

```ts
Office.onReady(() => {
  const mount = document.getElementById("app-body")!;
  const keyStore = new OpenRouterKeyStore();

  configureOpenRouterClient(keyStore);
  new TaskpaneComponent(mount, { keyStore });
});
```
