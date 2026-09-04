# Chat Window LLM Workflow FIP

Status: implemented.

## Goal

Introduce an `LLMManager` for the taskpane-FSM implementation and migrate `ChatWindow` and its workflow modules to use it for every model operation currently imported from `llm-model-workflow.ts`.

After this migration:

- no file under `src/taskpane-fsm` imports the legacy `llm-model-workflow.ts` module;
- all six model operations used by ChatWindow go through one `LLMManager` instance; and
- `llmConversationMessages` remains owned by restorable `ChatState`.

The original taskpane implementation and its `llm-model-workflow.ts` module remain unchanged.

## Conversation-History Ownership

`LLMManager` does not own or retain `llmConversationMessages`. The history remains in `ChatState` so it continues to participate in reset and restore behavior.

Preserve the existing history flow:

- submit and clarification operations receive the current history as an argument;
- their final events contain `updatedLlmConversationMessages` with the complete next history;
- `processModelResponse()` in `chat-window.ts` assigns that replacement history to `state.chatState.llmConversationMessages`;
- module-level `appendUserDecisionLlmMessage()` in `chat-window.ts` records accepted and rejected changes;
- module-level `appendAssistantLlmMessage()` in `chat-window.ts` records scenario and accepted-change analyses;
- `RestoreManager` continues copying history into restore points; and
- `ChatWindow.reset()` continues replacing history with an empty array.

Do not cache a history reference in `LLMManager`. Restore replaces `state.chatState`, and each operation must receive the current history from its caller.

Move the two existing history-append methods out of `ChatWindowState` and define them as exported module-level functions in `chat-window.ts`:

```ts
export function appendUserDecisionLlmMessage(
  chatState: ChatState,
  text: string,
  workflowId: number
): void;

export function appendAssistantLlmMessage(
  chatState: ChatState,
  text: string,
  workflowId: number
): void;
```

Each function replaces `chatState.llmConversationMessages` with the existing history plus its new message. Accept, reject, scenario-comparison, and accepted-change-analysis call sites import the appropriate function from `chat-window.ts` and pass `state.chatState`. These helpers remain outside `LLMManager` because they mutate ChatWindow-owned state rather than perform model operations.

## New Class and Construction

Add `src/taskpane-fsm/pages/chat/chat-window/llm-manager.ts` with an `LLMManager` class. `ChatWindow` constructs one manager and passes it to `ChatWindowState`, which stores it as:

```ts
readonly llmManager: LLMManager;
```

The manager needs sheet Markdown formatting when it builds model contexts, but that formatting is pure and does not require live Excel access or controller state. Construct the manager without dependencies:

```ts
const excelManager = new ExcelManager(excelApi);
const llmManager = new LLMManager();
this.state = new ChatWindowState(mount, domHandlers, excelManager, llmManager);
```

`LLMManager` has no instance variables. It does not store `ExcelManager`, ChatWindow state, workflow state, conversation history, transcript state, or DOM handlers.

## Public Interface

The six current taskpane-FSM call sites require this public interface:

```ts
export class LLMManager {
  runPreprocessPrompt(sheet: SheetSnapshot): AsyncGenerator<PreprocessPromptEvent>;

  runMainQueryPrompt(
    prompt: string,
    workflowId: number,
    originalSheet: SheetSnapshot,
    llmConversationMessages: LlmConversationHistory
  ): AsyncGenerator<SpreadsheetPromptEvent>;

  runClarificationResponsePrompt(
    answer: string,
    workflowId: number,
    llmConversationMessages: LlmConversationHistory
  ): AsyncGenerator<SpreadsheetPromptEvent>;

  getPendingClarificationToolCall(
    llmConversationMessages: LlmConversationHistory
  ): LlmConversationFunctionCall;

  runScenarioComparisonPrompt(
    userRequest: string,
    originalSheet: SheetSnapshot,
    scenarioSheet: SheetSnapshot,
    comparisonRanges: ComparisonRange[],
    llmConversationMessages: LlmConversationHistory
  ): Promise<ScenarioComparisonPromptResult>;

  runUpdateAnalysisPrompt(
    userRequest: string,
    originalSheet: SheetSnapshot,
    updatedSheet: SheetSnapshot,
    llmConversationMessages: LlmConversationHistory
  ): Promise<string>;
}
```

Do not expose request builders, response parsers, history compaction, range validation, formula-inference helpers, sheet-context builders, or OpenRouter conversion helpers.

## Implementation Source and Structure

Copy the behavior needed by these six operations and their private dependencies from `src/taskpane/pages/chat/chat-state-machine/llm-model-workflow.ts` into `llm-manager.ts`. Do not import or delegate back to the legacy module.

Keep the new implementation straightforward:

- implement the six public operations as `LLMManager` methods;
- preserve `async` generator methods for preprocess, submit, and clarification streaming;
- keep instructions, schemas, and model configuration as unexported module constants;
- keep stateless implementation helpers as unexported module functions rather than turning the entire file into one large class; and
- import the pure sheet Markdown functions directly when building model contexts.

Continue importing the existing OpenRouter client and formula-inference utilities. Migrating those modules is outside this FIP.

## Call-Site Migration

| Location                                  | Current call                           | Replacement                                                    |
| ----------------------------------------- | -------------------------------------- | -------------------------------------------------------------- |
| `chat-window/chat-window.ts`              | `runScenarioComparisonPrompt(...)`     | `state.llmManager.runScenarioComparisonPrompt(...)`            |
| `chat-window/workflows/preprocess.ts`     | `runPreprocessPrompt(...)`             | `state.llmManager.runPreprocessPrompt(...)`                     |
| `chat-window/workflows/submit-message.ts` | `runMainQueryPrompt(...)`              | `state.llmManager.runMainQueryPrompt(...)`                      |
| `chat-window/workflows/clarification.ts`  | `getPendingClarificationToolCall(...)` | `state.llmManager.getPendingClarificationToolCall(...)`         |
| `chat-window/workflows/clarification.ts`  | `runClarificationResponsePrompt(...)`  | `state.llmManager.runClarificationResponsePrompt(...)`          |
| `chat-window/workflows/accept-diff.ts`    | `runUpdateAnalysisPrompt(...)`         | `state.llmManager.runUpdateAnalysisPrompt(...)`                 |

Remove each legacy import as its call site migrates. When complete, `rg "llm-model-workflow" src/taskpane-fsm` should return no matches.

Reject and restore workflows do not call the LLM module and require no migration beyond any shared import-path changes.

## Excel Formatting Changes

Add `src/taskpane-fsm/pages/chat/chat-window/sheet-markdown.ts` and move the two pure sheet Markdown functions from the legacy Excel utilities into it:

- `formatSheetDataAsMarkdown()`; and
- `formatSheetAsMarkdown()`.

Also copy their private cell and column formatting helpers. Export only the two sheet-level functions and keep their implementation helpers module-private. `LLMManager` imports the exported functions directly when building full, compact, and selected-range sheet contexts. `ExcelManager` remains unchanged and continues to contain only live Excel operations and their supporting logic.

This keeps the new taskpane-FSM path independent of `excel-sheet-utils.ts` without coupling pure formatting to `ExcelManager` or duplicating it inside `LLMManager`.

## Implementation Order

1. Add and test the pure sheet Markdown module.
2. Add `LLMManager` with the six public operations and copied private implementation support.
3. Add the manager to `ChatWindowState` and construct it without dependencies in `ChatWindow`.
4. Migrate preprocess, submit, and clarification while preserving their streamed event handling.
5. Migrate scenario comparison and accepted-change analysis.
6. Move both history-append methods from `ChatWindowState` to module-level functions in `chat-window.ts` and update their call sites to pass `state.chatState`.
7. Verify that history assignment, manual history appends, reset, and restore remain outside `LLMManager` and behave unchanged.
8. Remove all taskpane-FSM imports of `llm-model-workflow.ts` and verify the dependency search is empty.
9. Mark this FIP implemented.
10. Run lint, production build, unit tests, and `git diff --check`.

## Behavioral Requirements

- Preserve the exact public input and output types of all six legacy operations.
- Preserve streaming event order and progress-event behavior for preprocess, submit, and clarification.
- Preserve main-query history compaction and sheet-context attachment.
- Preserve clarification function-call and function-call-output history entries.
- Preserve scenario comparison range validation, request construction, cell edits, and analysis.
- Preserve accepted-change analysis request construction and its existing nonfatal error handling in the accept workflow.
- Preserve model configuration, prompts, schemas, token limits, logging, retry behavior, and response parsing.
- Preserve `ChatState` ownership of conversation history and existing reset and restore semantics.
- Preserve the existing user-decision and assistant-message history entries after moving their append helpers.
- Do not introduce new error handling, fallback models, or defensive branches.

## Tests

Add focused tests that verify:

- main-query streaming produces the same partial, progress, and completion events;
- main-query completion and clarification events contain the expected replacement history;
- clarification finds the pending tool call, records its function-call output, and returns the next history;
- preprocessing emits detection, region, and completion events unchanged;
- scenario comparison preserves range validation and returns the expected edits and analysis;
- update analysis returns the extracted response text;
- sheet Markdown contexts are unchanged after moving formatting into the pure helper module;
- restore snapshots still copy and restore conversation history; and
- no source file under `src/taskpane-fsm` imports `llm-model-workflow.ts` or `excel-sheet-utils.ts`.

Existing original-taskpane tests should continue passing unchanged.

## Non-Goals

- Do not move `llmConversationMessages` out of `ChatState`.
- Do not move the manual history-append helpers into `LLMManager`.
- Keep the module-level `processModelResponse()` function in `chat-window.ts`.
- Do not delete or refactor the legacy `llm-model-workflow.ts` module.
- Do not migrate the original `ChatStateMachine`.
- Do not redesign or inject the OpenRouter client.
- Do not change prompts, schemas, model selection, workflow state transitions, transcript rendering, or user-visible behavior.
