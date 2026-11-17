import type { CellEdit, SheetSnapshot } from "../excel-manager";
import { formatFormulaInferenceRegionResult } from "../llm/preprocess-formula-inference";
import {
  appendFormulaInferencePlan,
  appendMessage,
  appendWorkingTranscriptItem,
  getWorkflowHumanMessage,
  removeWorkingTranscriptItem,
} from "../transcript";
import { ChatSessionState } from "../chat-session-state";
import { runSubmitMessageWorkflow } from "./submit-message";

export async function* runPreprocessWorkflow(
  state: ChatSessionState,
  message: string,
  workflowId: number
): AsyncGenerator<void> {
  const originalSheet = await state.excelManager.readActiveSheet();
  setupTransition(state, message, workflowId, originalSheet);
  yield;
  let cellEdits: CellEdit[] | undefined;
  for await (const event of state.llmManager.runPreprocessPrompt(originalSheet)) {
    if (event.type === "detection_complete") {
      appendFormulaInferencePlan(state.chatState.transcript, event.plan, workflowId);
    } else if (event.type === "region_complete") {
      appendMessage(
        state.chatState.transcript,
        "system",
        formatFormulaInferenceRegionResult(event.region, event.cellEditCount),
        workflowId
      );
    } else if (event.type === "complete") {
      cellEdits = event.cellEdits;
    }
    yield;
  }
  removeWorkingTranscriptItem(state.chatState.transcript, workflowId);
  yield* finalizeTransition(state, workflowId, originalSheet, cellEdits!);
}

function setupTransition(
  state: ChatSessionState,
  message: string,
  workflowId: number,
  originalSheet: SheetSnapshot
): void {
  state.restoreManager.createPotentialRestorePoint(workflowId, state.chatState, originalSheet);
  appendMessage(state.chatState.transcript, "human", message, workflowId);
  appendWorkingTranscriptItem(state.chatState.transcript, "Analyzing worksheet..", workflowId);
  state.chatState.preprocessedSheetNames.push(originalSheet.name);
}

async function* finalizeTransition(
  state: ChatSessionState,
  workflowId: number,
  originalSheet: SheetSnapshot,
  cellEdits: CellEdit[]
): AsyncGenerator<void> {
  if (cellEdits.length > 0) {
    appendMessage(
      state.chatState.transcript,
      "system",
      "**Completed formula inference. Please review the inferred formulas (highlighted)**",
      workflowId
    );
    yield;
    const diff = await state.excelManager.createNextDiffSheet(originalSheet, cellEdits);
    state.chatState.pendingEdit = {
      sourceSheetName: originalSheet.name,
      diffSheetName: diff.sheetName,
      workflowId,
    };
    state.chatState.workflowState = "pending_edit_preprocessed";
    yield;
  } else {
    yield;
    yield* runSubmitMessageWorkflow(
      state,
      getWorkflowHumanMessage(state.chatState.transcript, workflowId),
      workflowId,
      false
    );
  }
}
