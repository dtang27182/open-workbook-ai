import { deleteDiffSheet } from "../../../taskpane/pages/chat/chat-state-machine/excel-sheet-utils";
import { PendingEdit } from "../../../taskpane/pages/chat/chat-state-machine/chat-types";
import { renderChatTranscript } from "./chat-window-dom";
import {
  appendMessageAndRender,
  appendWorkingTranscriptItem,
  getWorkflowHumanMessage,
  removeDiffReviewTranscriptItem,
  removeWorkingTranscriptItem,
} from "./chat-window-transcript-helpers";
import type { ProcessModelResponse } from "./chat-window";
import { ChatWindowState } from "./chat-window-state";
import { runSubmitMessageWorkflow } from "./chat-window-submit-message-workflow";

export async function runRejectDiffWorkflow(
  state: ChatWindowState,
  processModelResponse: ProcessModelResponse
): Promise<void> {
  const pendingEdit = state.chatState.pendingEdit!;
  await setup(state, pendingEdit);
  await performActions(state, pendingEdit);
  await finalize(state, processModelResponse, pendingEdit);
}

async function setup(state: ChatWindowState, pendingEdit: PendingEdit): Promise<void> {
  removeDiffReviewTranscriptItem(state.chatState.transcript, pendingEdit.workflowId);
  appendWorkingTranscriptItem(
    state.chatState.transcript,
    "Rejecting changes...",
    pendingEdit.workflowId
  );
  renderChatTranscript(state.mount, state.chatState.transcript, state.domHandlers);
}

async function performActions(state: ChatWindowState, pendingEdit: PendingEdit): Promise<void> {
  await deleteDiffSheet(state.excelApi, pendingEdit.sourceSheetName, pendingEdit.diffSheetName);
}

async function finalize(
  state: ChatWindowState,
  processModelResponse: ProcessModelResponse,
  pendingEdit: PendingEdit
): Promise<void> {
  const shouldContinueOriginalQuery = state.chatState.fsmState === "pending_edit_preprocessed";
  state.restoreManager.discardPotentialRestorePoint(pendingEdit.workflowId);
  state.chatState.pendingEdit = undefined;
  state.chatState.fsmState = "answered";

  removeWorkingTranscriptItem(state.chatState.transcript, pendingEdit.workflowId);
  appendMessageAndRender(
    state.mount,
    state.chatState.transcript,
    state.domHandlers,
    "system",
    "Rejected changes.",
    pendingEdit.workflowId
  );
  state.appendUserDecisionLlmMessage("Rejected changes.", pendingEdit.workflowId);

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
}
