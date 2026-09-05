/* global console */

import type { PendingEdit, ChatWindowState } from "../chat-window-state";
import type { SheetSnapshot } from "../excel-manager";
import type { RestorePoint } from "../restore-manager";
import { renderChatTranscript } from "../dom/chat-window-dom";
import {
  appendMessageAndRender,
  appendWorkingTranscriptItem,
  getWorkflowHumanMessage,
  insertRestoreTranscriptItemAndRender,
  removeDiffReviewTranscriptItem,
  removeWorkingTranscriptItem,
} from "../dom/transcript-helpers";
import { appendAssistantLlmMessage, appendUserDecisionLlmMessage } from "../chat-window";
import { runSubmitMessageWorkflow } from "./submit-message";

export async function runAcceptDiffWorkflow(state: ChatWindowState): Promise<void> {
  const pendingEdit = state.chatState.pendingEdit!;
  const shouldAnalyzeUpdate = state.chatState.workflowState === "pending_edit";
  const userRequest = getWorkflowHumanMessage(state.chatState.transcript, pendingEdit.workflowId);
  await setup(state, pendingEdit);
  await performActions(state, pendingEdit);
  const restorePoint = await finalize(state, pendingEdit);
  if (shouldAnalyzeUpdate) {
    await appendUpdateAnalysis(
      state,
      userRequest,
      pendingEdit.workflowId,
      restorePoint.sheet,
      pendingEdit.sourceSheetName
    );
  }
}

async function setup(state: ChatWindowState, pendingEdit: PendingEdit): Promise<void> {
  removeDiffReviewTranscriptItem(state.chatState.transcript, pendingEdit.workflowId);
  appendWorkingTranscriptItem(
    state.chatState.transcript,
    "Applying changes...",
    pendingEdit.workflowId
  );
  renderChatTranscript(state.mount, state.chatState.transcript, state.domHandlers);
}

async function performActions(state: ChatWindowState, pendingEdit: PendingEdit): Promise<void> {
  const diffSheet = await state.excelManager.readSheet(pendingEdit.diffSheetName);
  await state.excelManager.writeSheetFormulas(
    state.excelManager.retargetFormulaSheetReferences(diffSheet, pendingEdit.sourceSheetName)
  );
  await state.excelManager.deleteDiffSheet(pendingEdit.sourceSheetName, pendingEdit.diffSheetName);
}

async function finalize(state: ChatWindowState, pendingEdit: PendingEdit): Promise<RestorePoint> {
  const shouldContinueOriginalQuery = state.chatState.workflowState === "pending_edit_preprocessed";
  const restorePoint = state.restoreManager.promotePotentialRestorePoint(pendingEdit.workflowId);
  state.chatState.pendingEdit = undefined;
  state.chatState.workflowState = "answered";

  removeWorkingTranscriptItem(state.chatState.transcript, pendingEdit.workflowId);
  insertRestoreTranscriptItemAndRender(
    state.mount,
    state.chatState.transcript,
    state.domHandlers,
    restorePoint,
    pendingEdit.workflowId
  );
  appendMessageAndRender(
    state.mount,
    state.chatState.transcript,
    state.domHandlers,
    "system",
    "Accepted changes.",
    pendingEdit.workflowId
  );
  appendUserDecisionLlmMessage(state.chatState, "Accepted changes.", pendingEdit.workflowId);

  if (shouldContinueOriginalQuery) {
    appendMessageAndRender(
      state.mount,
      state.chatState.transcript,
      state.domHandlers,
      "system",
      "Continuing with original query.",
      pendingEdit.workflowId
    );
    await runSubmitMessageWorkflow(
      state,
      getWorkflowHumanMessage(state.chatState.transcript, pendingEdit.workflowId),
      pendingEdit.workflowId,
      false
    );
  }

  return restorePoint;
}

async function appendUpdateAnalysis(
  state: ChatWindowState,
  userRequest: string,
  workflowId: number,
  originalSheet: SheetSnapshot,
  updatedSheetName: string
): Promise<void> {
  appendWorkingTranscriptItem(
    state.chatState.transcript,
    "Analyzing accepted changes...",
    workflowId
  );
  renderChatTranscript(state.mount, state.chatState.transcript, state.domHandlers);
  try {
    const updatedSheet = await state.excelManager.readSheet(updatedSheetName);
    const analysis = await state.llmManager.runUpdateAnalysisPrompt(
      userRequest,
      originalSheet,
      updatedSheet,
      state.chatState.llmConversationMessages
    );
    removeWorkingTranscriptItem(state.chatState.transcript, workflowId);
    appendMessageAndRender(
      state.mount,
      state.chatState.transcript,
      state.domHandlers,
      "system",
      analysis,
      workflowId
    );
    appendAssistantLlmMessage(state.chatState, analysis, workflowId);
  } catch (err) {
    console.debug("OpenRouter update analysis request failed.", err);
    removeWorkingTranscriptItem(state.chatState.transcript, workflowId);
    renderChatTranscript(state.mount, state.chatState.transcript, state.domHandlers);
  }
}
