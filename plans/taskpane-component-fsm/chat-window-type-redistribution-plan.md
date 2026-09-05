# Chat Window Type Redistribution FIP

Status: implemented.

## Behavior

Preserve all existing taskpane-FSM behavior. Chat submission, clarification, preprocessing, accepting and rejecting edits, restoring conversations, authentication, and worksheet operations produce the same results.

This is a type-only reorganization. State ownership, object identity, restore-point copying, event variants, model payloads, and runtime call paths remain unchanged. Conversation history remains owned by `ChatState`, not `LLMManager`.

The original taskpane remains unchanged. Tests continue using their existing mocked Excel and model responses; no new calculations or simulation behavior are introduced.

## Interface Points

### Existing interface points that must change

- FSM consumers of the original `chat-types.ts`: import equivalent local types from the existing modules responsible for those concepts.
- FSM consumers of `ChatFsmState`: use the renamed local `ChatWorkflowState` type.
- `ChatWindowUpdateEvent`: define all five event variants directly instead of extending `ChatStateMachineInput`.
- Consumers of FSM `chat-window-types.ts`: import its three types from their new module locations.
- Existing FSM module exports: expose the relocated types without changing any class, function, or method signature beyond its type import location.
- FSM test type imports: use the relocated FSM definitions while preserving legacy imports needed by original-taskpane tests.

### New interface points to create

- Local type exports in `chat-window-state.ts`, `dom/transcript-helpers.ts`, `restore-manager.ts`, `excel-manager.ts`, `llm-manager.ts`, `preprocess-formula-inference.ts`, and `openrouter-client.ts`, as listed below.
- No new runtime functions, classes, methods, or modules.

## Implementation Details

All destination paths below are relative to `src/taskpane-fsm/pages/chat/chat-window/`.

### `chat-window-state.ts`

- Move the existing FSM `ChatState` from `chat-window-types.ts` here, alongside `ChatWindowState`.
- Copy `ChatFsmState` from the original `chat-types.ts` as `ChatWorkflowState`, preserving all union variants. Use the new name for `ChatState.workflowState` and all FSM type annotations, including control configuration and state-checking helpers; leave the legacy type name unchanged in the original taskpane.
- Copy `PendingEdit` from the original `chat-types.ts`.
- Preserve the FSM's `workflowState` and `nextWorkflowId` fields. Do not copy the legacy `ChatState`, which uses `fsmState` and lacks the FSM workflow counter.
- Import transcript and conversation-history types from their new local modules. `ChatState` continues owning those values; managers gain no state fields.

### `chat-window.ts`

- Define `submit_message`, `accept_pending_diff`, `reject_pending_diff`, `restore_to_point`, and `clear` directly in `ChatWindowUpdateEvent`, preserving their existing payloads.
- Remove the `ChatStateMachineInput` import without creating a local replacement type. Keep the original taskpane's definition unchanged.
- Type the validation and error-message helpers with `Exclude<ChatWindowUpdateEvent, { type: "clear" }>` to preserve their existing non-clear input contract.
- Update other type imports without changing event handling or module-level helpers.

### `dom/transcript-helpers.ts`

- Copy `ChatTranscriptSource`, `ChatTranscriptItem`, `ChatTranscriptEntry`, `ChatMessageTranscriptItem`, and `ChatWorkingTranscriptItem` here.
- Preserve every transcript variant, field, and alias.
- Update DOM rendering, workflow, and state consumers to import these types here. Importing transcript types must not load DOM helpers at runtime.

### `restore-manager.ts`

- Move the existing FSM `RestorePoint` from `chat-window-types.ts` here, using the relocated FSM `ChatState` and local `SheetSnapshot`.
- Do not copy the legacy `RestorePoint` or introduce a second definition.
- Preserve creation, promotion, lookup, and copying behavior, including returning stored restore-point references from lookup and promotion.

### `excel-manager.ts`

- Copy `ExcelApi`, `SheetSnapshot`, and `CellEdit` here.
- Preserve the `Excel.RequestContext` callback contract, snapshot dimensions and arrays, and supported cell-edit value types.
- Update worksheet, preprocessing, LLM, restore, and workflow consumers to use these definitions. Keep existing Excel operations and counters unchanged.

### `llm-manager.ts`

- Copy the conversation types: `LlmMessageRole`, `LlmFormulaValueSheetContext`, `LlmCompactSheetContext`, `LlmConversationSheetContext`, `LlmConversationMessage`, `LlmConversationFunctionCall`, `LlmConversationFunctionCallOutput`, and `LlmConversationHistory`.
- Copy their supporting `LlmConversationSheetRange` type as a private module-level type.
- Copy `ComparisonRange`, `ModelSpreadsheetResponse`, `SpreadsheetPromptWorkflowResult`, `ScenarioComparisonPromptResult`, `SpreadsheetPromptCompletionEvent`, and `SpreadsheetPromptEvent`.
- Preserve readonly history/context declarations, discriminated unions, tool-call fields, and result shapes.
- Import spreadsheet types from `excel-manager.ts`, protocol types from `openrouter-client.ts`, and preprocessing events from `preprocess-formula-inference.ts`.
- Keep conversation-history ownership and mutation in their existing locations. These declarations describe the manager's inputs and outputs; they do not add manager state.

### `preprocess-formula-inference.ts`

- Move the existing FSM `PreprocessPromptEvent` from `chat-window-types.ts` here, beside `FormulaInferencePlan` and `FormulaInferenceRegion`.
- Continue referencing those local formula-inference types and import `CellEdit` from `excel-manager.ts`.
- Preserve all three event variants and existing inference and formatting behavior.

### `openrouter-client.ts`

- Copy `OpenRouterMessage`, `OpenRouterFunctionCall`, `OpenRouterFunctionCallOutput`, `OpenRouterInputItem`, `OpenRouterOutputItem`, `OpenRouterFunctionTool`, `OpenRouterRequestBody`, `OpenRouterResponseBody`, `OpenRouterStreamEvent`, and `OpenRouterStreamResultEvent` here.
- Preserve protocol field names, optional fields, literal values, and unions exactly.
- Import `ModelSpreadsheetResponse` from `llm-manager.ts` using `import type` for the existing `parseSpreadsheetResponse()` generic default. This creates no runtime import back to the manager; do not move or change the parser.
- Keep request, parsing, streaming, and key-store behavior unchanged.

### Import migration and cleanup

- Replace all original `chat-types.ts` imports under `src/taskpane-fsm` with direct imports from the destinations above, including consumers in workflow modules and `sheet-markdown.ts`.
- Use `import type` for type-only imports so colocated declarations do not introduce runtime dependency cycles or load service and DOM modules solely for types. Preserve value imports that are actually used at runtime.
- Update all consumers of FSM `chat-window-types.ts`, including tests, then delete that file. Do not leave a compatibility barrel or re-export layer.
- Leave the original `src/taskpane/pages/chat/chat-state-machine/chat-types.ts` and its original-taskpane consumers intact.
- Do not copy unused legacy-only definitions: `ChatStateMachineUI`, `ModelPreprocessResponse`, `SpreadsheetPromptResult`, `FormulaInferenceDetectionEvent`, and `FormulaInferenceRegionEvent`.
- Preserve shared test infrastructure and legacy test imports where still needed; do not migrate the original taskpane or reorganize tests as part of this change.
- Include the existing `src/vite-env.d.ts` in the unit-test TypeScript configuration so type checking can resolve HTML imports reached through the relocated types. Type-only imports must still prevent DOM modules from loading at test runtime.
- Make no unrelated renames, runtime refactors, formatting changes, or changes to older plans.

## Verification

- Type-check the FSM chat subtree and full FSM entry point; compare any failures against the pre-change baseline and do not fix unrelated failures in this migration.
- Run `npm run test:unit` to confirm existing model workflows, preprocessing, restore behavior, Excel operations, and authentication/client scenarios still pass with the relocated types.
- Run `npm run lint`, `npm run build`, and `git diff --check`.
- Audit all imports under `src/taskpane-fsm` to confirm none reference the original taskpane, including indirectly through relocated type definitions.
- Confirm there are no remaining source or test imports of FSM `chat-window-types.ts` and that the file is removed.
- Confirm all three former FSM types have exactly one local definition and that `ChatState` still uses `workflowState` and includes `nextWorkflowId`.
- Confirm no `ChatFsmState` references remain under `src/taskpane-fsm`; its replacement is `ChatWorkflowState` with the same allowed values.
- Confirm no `ChatStateMachineInput` references remain under `src/taskpane-fsm` and that `ChatWindowUpdateEvent` directly defines all five existing event variants with unchanged payloads.
- Review the diff to verify type shapes are preserved, type-only cross-module dependencies are erased at runtime, and no executable logic or original-taskpane files changed.
- Do not add tests that merely assert type declaration locations; use type checking and existing behavior tests for this reorganization.

Implementation verification: all 13 unit tests, chat-subtree type checking, lint, production build, and diff checks passed. All 38 relocated type definitions retain their original shapes, accounting for the `ChatWorkflowState` rename, and emitted executable bodies are unchanged. The import audit found no remaining original-taskpane dependencies under `src/taskpane-fsm`. Full FSM type checking reports only the same two pre-existing references to an undeclared `TaskpaneComponent.debugHeaderElement` as the pre-change baseline.
