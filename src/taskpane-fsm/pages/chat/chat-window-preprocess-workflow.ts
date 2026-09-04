import { readActiveSheet } from "../../../taskpane/pages/chat/chat-state-machine/excel-sheet-utils";
import { runPreprocessPrompt } from "../../../taskpane/pages/chat/chat-state-machine/llm-model-workflow";
import {
  CellEdit,
  SheetSnapshot,
} from "../../../taskpane/pages/chat/chat-state-machine/chat-types";
import {
  formatFormulaInferencePlan,
  formatFormulaInferenceRegionResult,
} from "../../../taskpane/pages/chat/chat-state-machine/preprocess-formula-inference";
import { renderChatTranscript } from "./chat-window-dom";
import {
  appendDiffReviewTranscriptItemAndRender,
  appendMessageAndRender,
  appendWorkingTranscriptItem,
  getWorkflowHumanMessage,
  removeWorkingTranscriptItem,
} from "./chat-window-transcript-helpers";
import type { ProcessModelResponse } from "./chat-window";
import { ChatWindowState } from "./chat-window-state";
import { runSubmitMessageWorkflow } from "./chat-window-submit-message-workflow";

export async function runPreprocessWorkflow(
  state: ChatWindowState,
  processModelResponse: ProcessModelResponse,
  message: string,
  workflowId: number
): Promise<void> {
  const originalSheet = await readActiveSheet(state.excelApi);
  setupTransition(state, message, workflowId, originalSheet);
  let cellEdits: CellEdit[] | undefined;
  for await (const event of runPreprocessPrompt(originalSheet)) {
    if (event.type === "detection_complete") {
      appendMessageAndRender(
        state.mount,
        state.chatState.transcript,
        state.domHandlers,
        "system",
        formatFormulaInferencePlan(event.plan),
        workflowId
      );
    } else if (event.type === "region_complete") {
      appendMessageAndRender(
        state.mount,
        state.chatState.transcript,
        state.domHandlers,
        "system",
        formatFormulaInferenceRegionResult(event.region, event.cellEditCount),
        workflowId
      );
    } else if (event.type === "complete") {
      cellEdits = event.cellEdits;
    }
  }
  removeWorkingTranscriptItem(state.chatState.transcript, workflowId);
  await finalizeTransition(state, processModelResponse, workflowId, originalSheet, cellEdits!);
}

function setupTransition(
  state: ChatWindowState,
  message: string,
  workflowId: number,
  originalSheet: SheetSnapshot
): void {
  state.restoreManager.createPotentialRestorePoint(workflowId, state.chatState, originalSheet);
  appendMessageAndRender(
    state.mount,
    state.chatState.transcript,
    state.domHandlers,
    "human",
    message,
    workflowId
  );
  appendWorkingTranscriptItem(state.chatState.transcript, "Analyzing worksheet..", workflowId);
  state.chatState.preprocessedSheetNames.push(originalSheet.name);
  renderChatTranscript(state.mount, state.chatState.transcript, state.domHandlers);
}

async function finalizeTransition(
  state: ChatWindowState,
  processModelResponse: ProcessModelResponse,
  workflowId: number,
  originalSheet: SheetSnapshot,
  cellEdits: CellEdit[]
): Promise<void> {
  if (cellEdits.length > 0) {
    appendMessageAndRender(
      state.mount,
      state.chatState.transcript,
      state.domHandlers,
      "system",
      "**Completed formula inference. Please review the inferred formulas (highlighted)**",
      workflowId
    );
    const diff = await state.createNextDiffSheet(originalSheet, cellEdits);
    state.chatState.pendingEdit = {
      sourceSheetName: originalSheet.name,
      diffSheetName: diff.sheetName,
      workflowId,
    };
    state.chatState.workflowState = "pending_edit_preprocessed";
    appendDiffReviewTranscriptItemAndRender(
      state.mount,
      state.chatState.transcript,
      state.domHandlers,
      workflowId
    );
  } else {
    await runSubmitMessageWorkflow(
      state,
      processModelResponse,
      getWorkflowHumanMessage(state.chatState.transcript, workflowId),
      workflowId,
      false
    );
  }
}
