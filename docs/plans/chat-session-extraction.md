# ChatSession extraction plan

## Goal and ownership

Keep `ChatWindow` as the UI component and extract `ChatSession` as a service outside the component tree. Commands cross into the session; read-only snapshots cross back to the UI. Preserve existing chat, streaming, workbook, and restore behavior.

| UI: ChatWindow and ChatInput                      | Logic: ChatSession                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| DOM, Markdown rendering, scrolling, sizing, focus | Transcript, LLM history, workflow state, pending edits                         |
| Draft text and retained child components          | Submit, clarification, preprocessing, accept/reject, and restore               |
| Event handlers and applying snapshots             | Validation, error handling; shared ProviderManager owns credentials and models |
| Displaying progress, review, and restore controls | Coordination of LLMManager, ExcelManager, and RestoreManager                   |

The session receives no DOM elements, UI handlers, or component instances. The UI cannot mutate session state or call its managers directly.

## Session interface

Use camelCase method names at this boundary:

```ts
interface ChatSession {
  getSessionSnapshot(): ChatSessionSnapshot;
  getProviderStatus(): { provider: ModelProvider; keySuffix: string } | undefined;

  signIn(provider: ModelProvider, apiKey: string): void;
  signOut(): void;
  resetChat(): void;
  setModel(model: MainModelId): void;

  submitMessage(message: string): AsyncIterable<ChatSessionSnapshot>;
  acceptPendingDiff(): AsyncIterable<ChatSessionSnapshot>;
  rejectPendingDiff(): AsyncIterable<ChatSessionSnapshot>;
  restoreToPoint(restorePointId: number): AsyncIterable<ChatSessionSnapshot>;
}

interface ProviderManager {
  signIn(provider: ModelProvider, apiKey: string): void;
  signOut(): void;
  getProvider(): SignedInProvider | undefined;
  setModel(model: MainModelId): void;
  getModelOptions(): readonly MainModelOption[];
  getModel(): MainModelOption;
  getPreprocessModelConfigs(): PreprocessModelConfigs;
}
```

- `getSessionSnapshot()` is a side-effect-free query used for initial rendering and after synchronous commands.
- `ChatSession.signIn()` and `signOut()` delegate credential changes to its `ProviderManager`. `getProviderStatus()` returns the provider and key suffix for the taskpane account UI without exposing the key store. Taskpane maintains its own provider status for the UI. Sign-out retains chat history; clearing it remains the responsibility of `resetChat()`.
- `getModel()` supplies the selected main model to `LLMManager`; `getPreprocessModelConfigs()` supplies provider-specific detection and inference models. `getProvider()` also supplies the endpoint and display name to `InferenceClient`.
- `resetChat()` preserves current Clear behavior: reset conversation/workflow state, restore points, and generated sheet counters without changing workbook contents or the unsent draft.
- `submitMessage()` chooses the clarification, preprocessing, or ordinary submission workflow internally. Preserve the current preprocessing feature setting.
- Asynchronous methods yield snapshots at action start, visible progress/streaming updates, and completion or handled failure. Implement with async generators while exposing `AsyncIterable`; callers consume the entire sequence. No separate subscription API is needed.

## Snapshot contract

Define `ChatSessionSnapshot` and its nested read-only display types in a DOM-independent contract module. Return detached values so later session mutations cannot change previously delivered snapshots.

Include:

- Full transcript, including partial assistant messages, progress, errors, decisions, and restore markers.
- Current workflow status, transient action-running status, and action availability for the composer, review, and restore controls.
- Pending proposal details needed for display, including source/diff sheet names, plus scenario results needed by the UI. Raw model responses and worksheet snapshots remain private.
- Available restore-point IDs and display information, without checkpoint contents.
- Configured provider, available models, and selected model. Never include API keys.

Derive review-warning visibility independently from action-running status: starting accept/reject hides review controls but retains the pending-edit warning until the decision completes. Execution status is transient and is not part of restorable chat state. Rendering must not mutate transcript entries to enable or disable restore buttons.

## UI integration

DOM event handlers continue to enter `ChatWindow.updateState()`. Within that call path, consume session updates and apply each snapshot:

```ts
for await (const snapshot of this.session.submitMessage(event.message)) {
  this.applySessionSnapshot(snapshot);
}
```

Use the same pattern for accept, reject, and restore. Applying snapshots updates owned DOM and calls the retained `ChatInput.updateState()`; it does not recreate child instances. Capture and clear the submitted draft on the UI side at the existing submission point. Clear chat preserves an unsent draft. The component interface remains unchanged.

Construct one session at the taskpane composition boundary and pass it through `ChatPage` to `ChatWindow`. The session constructs its `ProviderManager`. Keep two copies of provider status: Taskpane's copy drives UI navigation and account display; `ProviderManager` supplies the signed-in provider to the session's LLM layer. Taskpane auth handlers call `ChatSession.signIn()` or `signOut()`, update Taskpane's provider status after the call succeeds, and refresh the affected child UI through component update events. Initialize both copies from existing stored credentials through the session. Auth navigation, OAuth acquisition, and account-menu rendering stay in the UI layer; credential persistence belongs to `ProviderManager`.

## Implementation sequence

1. Add the session contract and move transcript data types out of `dom/`. Separate transcript mutations from rendering in `transcript-helpers.ts`.
2. Extract domain state and managers from `ChatWindowState` into `ChatSession`. Keep the mount, handlers, and `ChatInput` instance in `ChatWindow`.
3. Move response processing and workflow orchestration out of `chat-window.ts`. Convert workflows to produce intermediate snapshots, removing imports of DOM helpers and `ChatWindow`. Keep state mutation near its owning session/workflow rather than routing it through the UI.
4. Connect `ChatWindow` to the session interface, make rendering helpers consume snapshots, and route taskpane provider/sign-out actions through `ChatSession` while retaining Taskpane's provider status for the UI.
5. Update architecture documentation and tests. Exercise session behavior without a DOM; retain component coverage for streaming, control states, draft preservation, and retained children. Verify clarification, pending edits, scenario creation, accept/reject continuation, failures, and restore semantics using existing LLM mocks and Excel doubles.

Follow the existing testing guide and behavior specifications. Run unit tests, lint, build, and manifest validation; verify affected taskpane behavior in Excel. Run the live suite if integration tests change.
