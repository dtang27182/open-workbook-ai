/* global console */

import {
  deleteDiffSheet,
  readSheet,
  retargetFormulaSheetReferences,
  writeSheetFormulas,
} from "../../../taskpane/pages/chat/chat-state-machine/excel-sheet-utils";
import { runUpdateAnalysisPrompt } from "../../../taskpane/pages/chat/chat-state-machine/llm-model-workflow";
import {
  PendingEdit,
  RestorePoint,
  SheetSnapshot,
} from "../../../taskpane/pages/chat/chat-state-machine/chat-types";
import { renderChatTranscript } from "./chat-window-dom";
import {
  appendMessageAndRender,
  appendWorkingTranscriptItem,
  getWorkflowHumanMessage,
  insertRestoreTranscriptItemAndRender,
  removeDiffReviewTranscriptItem,
  removeWorkingTranscriptItem,
} from "./chat-window-transcript-helpers";
import type { ProcessModelResponse } from "./chat-window";
import { ChatWindowState } from "./chat-window-state";
import { runSubmitMessageWorkflow } from "./chat-window-submit-message-workflow";

export async function runAcceptDiffWorkflow(
  state: ChatWindowState,
  processModelResponse: ProcessModelResponse
): Promise<void> {
  const pendingEdit = state.chatState.pendingEdit!;
  const shouldAnalyzeUpdate = state.chatState.fsmState === "pending_edit";
  const userRequest = getWorkflowHumanMessage(state.chatState.transcript, pendingEdit.workflowId);
  await setup(state, pendingEdit);
  await performActions(state, pendingEdit);
  const restorePoint = await finalize(state, processModelResponse, pendingEdit);
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
  const diffSheet = await readSheet(state.excelApi, pendingEdit.diffSheetName);
  await writeSheetFormulas(
    state.excelApi,
    retargetFormulaSheetReferences(diffSheet, pendingEdit.sourceSheetName)
  );
  await deleteDiffSheet(state.excelApi, pendingEdit.sourceSheetName, pendingEdit.diffSheetName);
}

async function finalize(
  state: ChatWindowState,
  processModelResponse: ProcessModelResponse,
  pendingEdit: PendingEdit
): Promise<RestorePoint> {
  const shouldContinueOriginalQuery = state.chatState.fsmState === "pending_edit_preprocessed";
  const restorePoint = state.restoreManager.promotePotentialRestorePoint(pendingEdit.workflowId);
  state.chatState.pendingEdit = undefined;
  state.chatState.fsmState = "answered";

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
  state.appendUserDecisionLlmMessage("Accepted changes.", pendingEdit.workflowId);

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
      processModelResponse,
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
    const updatedSheet = await readSheet(state.excelApi, updatedSheetName);
    const analysis = await runUpdateAnalysisPrompt(
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
    state.appendAssistantLlmMessage(analysis, workflowId);
  } catch (err) {
    console.debug("OpenRouter update analysis request failed.", err);
    removeWorkingTranscriptItem(state.chatState.transcript, workflowId);
    renderChatTranscript(state.mount, state.chatState.transcript, state.domHandlers);
  }
}
