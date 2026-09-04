# Chat Window Excel Operations FIP

Status: implemented.

## Goal

Introduce an `ExcelController` for the taskpane-FSM implementation and migrate `ChatWindow` and its workflow modules to use it for every Excel operation.

After this migration:

- no file under `src/taskpane-fsm` directly imports the legacy `excel-sheet-utils.ts` module;
- `ChatWindowState` no longer exposes `excelApi` or implements `createNextDiffSheet()`;
- all Excel reads, writes, sheet creation, deletion, and sheet-data transformations used by `ChatWindow` go through one `ExcelController` instance; and
- diff and scenario numbering are owned by `ExcelController` and are not part of restore state.

The original taskpane implementation and its `excel-sheet-utils.ts` module remain unchanged. The shared `llm-model-workflow.ts` module may continue using the legacy module internally for sheet Markdown formatting until the separate LLM workflow migration. This FIP removes the taskpane-FSM's direct dependency without expanding into that migration.

## New Class and Ownership

Add `src/taskpane-fsm/pages/chat/excel-controller.ts` with an `ExcelController` class. The class stores the optional `ExcelApi` supplied to `ChatWindow` and falls back to the global `Excel` API exactly as the legacy functions do.

`ChatWindow` constructs one controller and passes it to `ChatWindowState`. `ChatWindowState` stores it as:

```ts
readonly excelController: ExcelController;
```

The controller owns private `nextDiffSheetNumber` and `nextScenarioSheetNumber` fields initialized to `1`. `createNextDiffSheet()` and `createNextScenarioSheet()` use and increment the relevant field only after sheet creation succeeds.

Remove both fields from `ChatState` and from `RestoreManager.copyChatState()`. Restoring an earlier chat state does not rewind Excel sheet numbering. `nextWorkflowId` remains in restorable `ChatState` and continues to be managed by `ChatWindow`.

Clearing the conversation currently resets diff and scenario numbering. Preserve that behavior through an explicit `resetSheetNumbers()` controller method called by `ChatWindow.reset()`.

## Target Interface

The taskpane-FSM call sites should use this interface:

```ts
export class ExcelController {
  constructor(excelApi?: ExcelApi);

  resetSheetNumbers(): void;
  readActiveSheet(): Promise<SheetSnapshot>;
  readSheet(sheetName: string): Promise<SheetSnapshot>;
  writeSheetFormulas(sheet: SheetSnapshot): Promise<void>;

  createNextDiffSheet(
    originalSheet: SheetSnapshot,
    cellEdits: CellEdit[]
  ): Promise<{ sheetName: string; updatedSheet: SheetSnapshot }>;

  createNextScenarioSheet(
    originalSheet: SheetSnapshot,
    cellEdits: CellEdit[]
  ): Promise<string>;

  applyCellEditsToSheet(sheet: SheetSnapshot, cellEdits: CellEdit[]): Promise<void>;
  deleteDiffSheet(originalSheetName: string, diffSheetName: string): Promise<void>;
  retargetFormulaSheetReferences(
    sheet: SheetSnapshot,
    targetSheetName: string
  ): SheetSnapshot;
}
```

These nine methods are the complete public interface required by current taskpane-FSM call sites. Keep implementation-only operations private: in-memory cell edits, sheet-data normalization, raw diff/scenario creation, worksheet snapshot reads, A1-address parsing, and column counting.

Do not copy the sheet Markdown formatting functions into `ExcelController`. They have no taskpane-FSM callers and remain internal to the shared LLM workflow until that workflow is migrated.

## Implementation Source

Copy the implementations required by the public interface and their private dependencies from `src/taskpane/pages/chat/chat-state-machine/excel-sheet-utils.ts` into `ExcelController` without changing formulas, addressing, highlighting, selection, activation, timing logs, or return values.

Adapt the copied functions as follows:

- replace the `excelApi` parameter with the controller's stored dependency;
- convert the nine required operations into public instance methods;
- convert implementation helpers into private methods;
- have internal calls use `this`, such as `this.applyCellEdits()` and `this.getSheetRelativeCell()`; and
- wrap raw diff/scenario creation with controller-owned counter behavior in `createNextDiffSheet()` and `createNextScenarioSheet()`.

Do not import or delegate back to `excel-sheet-utils.ts` from the new controller.

## Call-Site Migration

| Current location                          | Current operation                                             | Replacement                                                                  |
| ----------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `chat-window-types.ts`                    | stores diff and scenario counters in `ChatState`              | remove both counters                                                         |
| `chat-window-state.ts`                    | stores `excelApi`; implements `createNextDiffSheet()`         | store `excelController`; remove the method                                   |
| `chat-window-restore-manager.ts`          | copies diff and scenario counters                             | stop copying both counters                                                    |
| `chat-window.ts` reset path               | initializes diff and scenario counters in `ChatState`         | call `state.excelController.resetSheetNumbers()`                             |
| `chat-window.ts` submit path              | `readActiveSheet(state.excelApi)`                             | `state.excelController.readActiveSheet()`                                    |
| `chat-window.ts` model-response path      | `state.createNextDiffSheet(...)`                              | `state.excelController.createNextDiffSheet(...)`                             |
| `chat-window.ts` scenario path            | private `createNextScenarioSheet()`                           | `state.excelController.createNextScenarioSheet(...)`                         |
| `chat-window.ts` scenario path            | `readSheet()` and `applyCellEditsToSheet()`                   | corresponding controller methods                                             |
| `chat-window-submit-message-workflow.ts`  | `readActiveSheet()`                                           | `state.excelController.readActiveSheet()`                                    |
| `chat-window-clarification-workflow.ts`   | `readActiveSheet()`                                           | `state.excelController.readActiveSheet()`                                    |
| `chat-window-preprocess-workflow.ts`      | `readActiveSheet()` and `state.createNextDiffSheet()`         | corresponding controller methods                                             |
| `chat-window-accept-diff-workflow.ts`     | read, retarget, write, delete, and post-accept read operations | corresponding controller methods                                             |
| `chat-window-reject-diff-workflow.ts`     | `deleteDiffSheet()`                                           | `state.excelController.deleteDiffSheet()`                                    |
| `chat-window-restore-workflow.ts`         | `deleteDiffSheet()` and `writeSheetFormulas()`                | corresponding controller methods                                             |

Remove each legacy utility import as its call sites migrate. When complete, `rg "excel-sheet-utils" src/taskpane-fsm` should return no matches.

## Implementation Order

1. Add `ExcelController` by copying the legacy implementations and adapting them to instance methods.
2. Add focused unit tests for controller transformations and Excel operations using the existing Excel test double.
3. Construct `ExcelController` in `ChatWindow` and replace `ChatWindowState.excelApi` with `excelController`.
4. Move `nextDiffSheetNumber` and `nextScenarioSheetNumber` from `ChatState` into `ExcelController`, and remove them from restore-point copying.
5. Move diff creation from `ChatWindowState.createNextDiffSheet()` into `ExcelController.createNextDiffSheet()` and remove the state method.
6. Move scenario creation from `ChatWindow.createNextScenarioSheet()` into `ExcelController.createNextScenarioSheet()` and remove the component method.
7. Have `ChatWindow.reset()` call `ExcelController.resetSheetNumbers()`.
8. Migrate the submit, clarification, preprocess, accept, reject, and restore workflow modules.
9. Remove all remaining taskpane-FSM imports of `excel-sheet-utils.ts` and verify the dependency search is empty.
10. Run lint, production build, unit tests, and `git diff --check`.

## Behavioral Requirements

- Preserve the current order of Excel effects and ChatWindow state transitions.
- Increment diff and scenario counters only after successful sheet creation, matching the current behavior.
- Do not change diff or scenario counters when restoring chat state.
- Reset both counters when the conversation is cleared.
- Preserve `ExcelApi` injection for tests and the global `Excel.run` fallback for the deployed add-in.
- Preserve formula-reference escaping for worksheet names containing apostrophes.
- Preserve green highlighting of edited cells and current sheet activation/selection behavior.
- Do not add error handling or fallback naming behavior as part of this migration.

## Tests

Add or update tests that verify:

- active and named sheets are read into unchanged `SheetSnapshot` values;
- diff creation applies in-memory cell edits and normalizes expanded sheet data as before;
- formula sheet references are retargeted correctly, including escaped apostrophes;
- diff and scenario sheets use the current counter value and increment it after success;
- resetting sheet numbers causes the next diff and scenario names to start at `1`;
- diff creation, formula writes, cell edits, and deletion retain their existing workbook effects;
- restore snapshots no longer contain diff or scenario counters;
- restoring chat state does not rewind the controller's diff or scenario counters; and
- no source file under `src/taskpane-fsm` imports `excel-sheet-utils.ts`.

Existing original-taskpane tests should continue passing unchanged.

## Non-Goals

- Do not delete or refactor the legacy `excel-sheet-utils.ts` module.
- Do not migrate the original `ChatStateMachine`.
- Do not migrate or redesign LLM workflow functions.
- Do not copy or expose sheet Markdown formatting methods until the LLM workflow migration requires them.
- Do not move `nextWorkflowId` into `ExcelController`.
- Do not change worksheet naming, diff rendering, scenario comparison, restore semantics, or user-visible behavior.
