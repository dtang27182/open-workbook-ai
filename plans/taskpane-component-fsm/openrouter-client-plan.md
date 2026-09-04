# Taskpane FSM OpenRouter Client FIP

Status: implemented.

## Behavior

This migration preserves the existing taskpane-FSM experience: signing in enables model requests with the acquired key, signing out removes that authorization, and model responses produce the same chat and worksheet results.

- Every request uses the current key. A key change affects subsequent requests, including requests made during the same workflow.
- Requests sharing an authentication session share key changes and invalidation. Requests using separate sessions do not affect each other's authorization.
- An HTTP 401 clears the affected session's key and produces the existing rejection error in both regular and streaming requests. Other request failures retain their existing behavior.
- Streaming retains accumulated response text, clarification tool calls, and the final completion result in their existing order.
- Clearing or restoring a conversation does not change authentication. In-flight requests retain existing behavior; this migration does not introduce cancellation.
- Model configuration, prompts, history, preprocessing, worksheet operations, authentication UI, and logging remain unchanged.

Tests simulate transport with mocked fetch responses and require no live OpenRouter calls. There are no new formulas or calculations.

## Interface Points

### Existing interface points that must change

- `TaskpaneComponent.constructor()`: pass the existing key store into `ChatPage` and remove global client configuration from FSM initialization.
- `ChatPage.constructor()`: accept the key store and pass it to `ChatWindow`.
- `ChatWindow.constructor()`: accept the key store and pass it to `LLMManager`, retaining the optional Excel API argument.
- `LLMManager`: store an `OpenRouterClient` and replace its six forwarding wrappers with direct method implementations.
- `LLMManager.runPreprocessPrompt()`: use the owned client for detection and pass it through formula-inference helpers.
- `LLMManager.runMainQueryPrompt()`: stream the main-query request through the owned client.
- `LLMManager.runClarificationResponsePrompt()`: stream clarification responses through the owned client and use its sibling lookup method.
- `LLMManager.getPendingClarificationToolCall()`: move the existing lookup implementation into the method.
- `LLMManager.runScenarioComparisonPrompt()`: send comparison requests through the owned client.
- `LLMManager.runUpdateAnalysisPrompt()`: send accepted-update analysis requests through the owned client.
- `inferFormulaRegions()`, `inferFormulaRegionWithRetry()`, and `inferFormulaRegion()`: accept and pass the client through the existing inference call chain.

### New interface points to create

- `OpenRouterClient` and its constructor: retain the supplied `OpenrouterKeyStore` for request authorization and invalidation.
- `OpenRouterClient.request()`: provide the existing non-streaming request behavior using the supplied key store.
- `OpenRouterClient.requestStreamEvents()`: provide the existing streaming request behavior using the supplied key store.
- Local `extractOpenRouterText()`: expose the copied pure response-text extraction helper.
- Local `extractPartialMainQueryText()`: expose the copied pure partial-response extraction helper.
- Local `parseSpreadsheetResponse()`: expose the copied pure spreadsheet-response parsing helper.

## Implementation Details

### OpenRouter client module

Add `src/taskpane-fsm/pages/chat/chat-window/openrouter-client.ts` with this interface:

```ts
export class OpenRouterClient {
  private readonly keyStore: OpenrouterKeyStore;

  constructor(keyStore: OpenrouterKeyStore) {
    this.keyStore = keyStore;
  }

  request(
    requestBody: OpenRouterRequestBody
  ): Promise<OpenRouterResponseBody>;

  requestStreamEvents(
    requestBody: OpenRouterRequestBody
  ): AsyncGenerator<OpenRouterStreamResultEvent>;
}
```

Implement `request()` as an async method and `requestStreamEvents()` as an async generator. Copy their bodies from `requestOpenRouter()` and `requestOpenRouterStreamEvents()` in the original taskpane client, replacing references to the global key store with `this.keyStore`.

Read authorization using `this.keyStore.get()` on each request and preserve `this.keyStore.clear()` on HTTP 401. Preserve request headers, JSON serialization, streaming flags, response parsing, error messages, and timing logs.

Copy stream decoding, function-call assembly, and logging helpers as private module-level functions. Export only the class and the three pure parsing helpers listed above. Preserve those helpers' existing signatures and behavior.

Do not add a global key-store variable, `configureOpenRouterClient()`, or the unused `requestOpenRouterStream()` convenience wrapper. Continue using the existing fetch and event-stream parser without introducing transport interfaces or new retry policies.

### TaskpaneComponent

Keep construction and ownership of `this.openrouterKeyStore`. Remove the legacy `configureOpenRouterClient` import and initialization call, and construct the chat page with:

```ts
new ChatPage(chatMount, this.handleSignOut, this.openrouterKeyStore);
```

Sign-in and sign-out continue modifying this same key store. No client is constructed or stored on `TaskpaneComponent`.

### ChatPage

Extend its constructor to `ChatPage(mount, onSignOut, keyStore)`, with `keyStore: OpenrouterKeyStore`. Pass the store to `new ChatWindow(chatWindowMount, keyStore)` without storing an extra reference. Mount creation, header construction, and sign-out handling stay unchanged.

### ChatWindow and ChatWindowState

Extend the constructor to `ChatWindow(mount, keyStore, excelApi?)`, preserving the optional `ExcelApi` dependency for tests. Construct `new LLMManager(keyStore)` when initializing `ChatWindowState`.

`ChatWindowState` continues storing only the existing `llmManager` reference for model operations. Neither component state nor restorable `ChatState` gains a key-store or client field. Reset and restore paths remain unchanged.

### LLMManager module

Declare and initialize the client in the class:

```ts
export class LLMManager {
  private readonly openRouterClient: OpenRouterClient;

  constructor(keyStore: OpenrouterKeyStore) {
    this.openRouterClient = new OpenRouterClient(keyStore);
  }
}
```

Move the six existing module-level model-operation implementations directly into their corresponding methods and remove the forwarding wrappers. Preserve method arguments and results. Preprocess, main-query, and clarification remain async generators; comparison and update analysis remain async methods; pending-clarification lookup remains synchronous.

Use `this.openRouterClient.request()` for detection, comparison, and update analysis. Use `this.openRouterClient.requestStreamEvents()` for main-query and clarification streaming. Inside clarification, call `this.getPendingClarificationToolCall()`.

Pass the client explicitly through `inferFormulaRegions()`, `inferFormulaRegionWithRetry()`, and `inferFormulaRegion()`; the final helper calls `openRouterClient.request()`. Preserve concurrency, throttling, retry behavior, and region-completion callbacks.

Import the three parsing helpers from the new local client. Keep pure request builders, history conversion, validation, prompts, schemas, and configuration as private module-level helpers. The manager stores no additional key-store reference or conversation history.

Workflow modules keep calling their existing `state.llmManager` methods. Conversation-history assignment and append helpers remain in `chat-window.ts`.

### Existing taskpane modules and plan documentation

Keep the original taskpane client and its global configuration intact for original-taskpane consumers. Continue importing `OpenrouterKeyStore` and protocol types from their current taskpane files; migrating those dependencies is separate work.

Update the implemented LLM Workflow FIP to reflect client construction inside `LLMManager` and direct method implementations. Mark this FIP implemented after implementation and verification are complete.

## Verification

Update FSM manager tests to supply a key store to `LLMManager`; construct clients directly for client-specific tests. Preserve legacy client configuration for original-taskpane tests.

Use mocked fetch responses to verify:

- Separate clients use their own supplied stores, including when their requests alternate.
- Clients sharing a store use its latest key after sign-in or key replacement; after sign-out, subsequent requests fail with the existing missing-key behavior.
- HTTP 401 clears only the supplied store and preserves the rejection error in both request paths.
- Other unsuccessful responses retain the existing error handling.
- Streaming across response chunks preserves accumulated text, clarification function-call assembly, and the final completion event.
- Existing model-workflow and original-taskpane tests continue passing.
- Constructor wiring passes the same key store from `TaskpaneComponent` to the client created inside `LLMManager`.

Run type checking, unit tests, lint, the production build, and `git diff --check`. Audit imports to confirm no file under `src/taskpane-fsm` imports the original `openrouter-client.ts` or calls `configureOpenRouterClient()`; the remaining taskpane dependencies are the key-store class and shared types.

Implementation verification: all 13 unit tests, lint, production build, chat-subtree type checking, and diff checks passed. The dependency audit found no original client imports or global configuration calls under taskpane-FSM. Full FSM type checking remains blocked by two pre-existing references to an undeclared `TaskpaneComponent.debugHeaderElement` in sign-in/sign-out handling.
