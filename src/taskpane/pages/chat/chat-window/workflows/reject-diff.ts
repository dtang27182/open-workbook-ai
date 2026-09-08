import type { PendingEdit, ChatWindowState } from "../chat-window-state";
import { renderChatTranscript, updateReviewWarning } from "../dom/chat-window-dom";
import {
  appendMessageAndRender,
  appendWorkingTranscriptItem,
  getWorkflowHumanMessage,
  removeWorkingTranscriptItem,
} from "../dom/transcript-helpers";
import { appendUserDecisionLlmMessage } from "../chat-window";
import { runSubmitMessageWorkflow } from "./submit-message";

export async function runRejectDiffWorkflow(state: ChatWindowState): Promise<void> {
  const pendingEdit = state.chatState.pendingEdit!;
  await setup(state, pendingEdit);
  await performActions(state, pendingEdit);
  await finalize(state, pendingEdit);
}

async function setup(state: ChatWindowState, pendingEdit: PendingEdit): Promise<void> {
  appendWorkingTranscriptItem(
    state.chatState.transcript,
    "Rejecting changes...",
    pendingEdit.workflowId
  );
  renderChatTranscript(state.mount, state.chatState.transcript, state.domHandlers);
}

async function performActions(state: ChatWindowState, pendingEdit: PendingEdit): Promise<void> {
  await state.excelManager.deleteDiffSheet(pendingEdit.sourceSheetName, pendingEdit.diffSheetName);
}

async function finalize(state: ChatWindowState, pendingEdit: PendingEdit): Promise<void> {
  const shouldContinueOriginalQuery = state.chatState.workflowState === "pending_edit_preprocessed";
  state.restoreManager.discardPotentialRestorePoint(pendingEdit.workflowId);
  state.chatState.pendingEdit = undefined;
  state.chatState.workflowState = "answered";
  updateReviewWarning(state.mount, undefined);

  removeWorkingTranscriptItem(state.chatState.transcript, pendingEdit.workflowId);
  appendMessageAndRender(
    state.mount,
    state.chatState.transcript,
    state.domHandlers,
    "system",
    "Rejected changes.",
    pendingEdit.workflowId,
    {
      kind: "edit_decision",
      decision: "rejected",
      sourceSheetName: pendingEdit.sourceSheetName,
    }
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
