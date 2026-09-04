import {
  CellEdit,
  SheetSnapshot,
} from "../../../../../taskpane/pages/chat/chat-state-machine/chat-types";
import {
  formatFormulaInferencePlan,
  formatFormulaInferenceRegionResult,
} from "../preprocess-formula-inference";
import { renderChatTranscript } from "../dom/chat-window-dom";
import {
  appendDiffReviewTranscriptItemAndRender,
  appendMessageAndRender,
  appendWorkingTranscriptItem,
  getWorkflowHumanMessage,
  removeWorkingTranscriptItem,
} from "../dom/transcript-helpers";
import { ChatWindowState } from "../chat-window-state";
import { runSubmitMessageWorkflow } from "./submit-message";

export async function runPreprocessWorkflow(
  state: ChatWindowState,
  message: string,
  workflowId: number
): Promise<void> {
  const originalSheet = await state.excelController.readActiveSheet();
  setupTransition(state, message, workflowId, originalSheet);
  let cellEdits: CellEdit[] | undefined;
  for await (const event of state.llmManager.runPreprocessPrompt(originalSheet)) {
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
  await finalizeTransition(state, workflowId, originalSheet, cellEdits!);
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
    const diff = await state.excelController.createNextDiffSheet(originalSheet, cellEdits);
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
      getWorkflowHumanMessage(state.chatState.transcript, workflowId),
      workflowId,
      false
    );
  }
}
