import { PendingEdit } from "../../../../../taskpane/pages/chat/chat-state-machine/chat-types";
import { renderChatTranscript } from "../dom/chat-window-dom";
import {
  appendMessageAndRender,
  appendWorkingTranscriptItem,
  getWorkflowHumanMessage,
  removeDiffReviewTranscriptItem,
  removeWorkingTranscriptItem,
} from "../dom/transcript-helpers";
import { appendUserDecisionLlmMessage } from "../chat-window";
import { ChatWindowState } from "../chat-window-state";
import { runSubmitMessageWorkflow } from "./submit-message";

export async function runRejectDiffWorkflow(state: ChatWindowState): Promise<void> {
  const pendingEdit = state.chatState.pendingEdit!;
  await setup(state, pendingEdit);
  await performActions(state, pendingEdit);
  await finalize(state, pendingEdit);
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
  await state.excelController.deleteDiffSheet(
    pendingEdit.sourceSheetName,
    pendingEdit.diffSheetName
  );
}

async function finalize(state: ChatWindowState, pendingEdit: PendingEdit): Promise<void> {
  const shouldContinueOriginalQuery = state.chatState.workflowState === "pending_edit_preprocessed";
  state.restoreManager.discardPotentialRestorePoint(pendingEdit.workflowId);
  state.chatState.pendingEdit = undefined;
  state.chatState.workflowState = "answered";

  removeWorkingTranscriptItem(state.chatState.transcript, pendingEdit.workflowId);
  appendMessageAndRender(
    state.mount,
    state.chatState.transcript,
    state.domHandlers,
    "system",
    "Rejected changes.",
    pendingEdit.workflowId
  );
  appendUserDecisionLlmMessage(state.chatState, "Rejected changes.", pendingEdit.workflowId);

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
}
