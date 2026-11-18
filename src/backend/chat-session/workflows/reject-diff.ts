import type { PendingEdit, ChatSessionState } from "../chat-session-state";
import {
  appendMessage,
  appendWorkingTranscriptItem,
  getWorkflowHumanMessage,
  removeWorkingTranscriptItem,
} from "../transcript-helpers";
import { appendUserDecisionLlmMessage } from "../transcript-helpers";
import { runSubmitMessageWorkflow } from "./submit-message";

export async function* runRejectDiffWorkflow(state: ChatSessionState): AsyncGenerator<void> {
  const pendingEdit = state.chatState.pendingEdit!;
  setup(state, pendingEdit);
  yield;
  await performActions(state, pendingEdit);
  yield* finalize(state, pendingEdit);
}

function setup(state: ChatSessionState, pendingEdit: PendingEdit): void {
  appendWorkingTranscriptItem(
    state.chatState.transcript,
    "Rejecting changes...",
    pendingEdit.workflowId
  );
}

async function performActions(state: ChatSessionState, pendingEdit: PendingEdit): Promise<void> {
  await state.excelManager.deleteDiffSheet(pendingEdit.sourceSheetName, pendingEdit.diffSheetName);
}

async function* finalize(state: ChatSessionState, pendingEdit: PendingEdit): AsyncGenerator<void> {
  const shouldContinueOriginalQuery = state.chatState.workflowState === "pending_edit_preprocessed";
  state.restoreManager.discardPotentialRestorePoint(pendingEdit.workflowId);
  state.chatState.pendingEdit = undefined;
  state.chatState.workflowState = "answered";

  removeWorkingTranscriptItem(state.chatState.transcript, pendingEdit.workflowId);
  appendMessage(state.chatState.transcript, "system", "Rejected changes.", pendingEdit.workflowId, {
    kind: "edit_decision",
    decision: "rejected",
    sourceSheetName: pendingEdit.sourceSheetName,
  });
  appendUserDecisionLlmMessage(state.chatState, "Rejected changes.", pendingEdit.workflowId);

  yield;
  if (shouldContinueOriginalQuery) {
    appendMessage(
      state.chatState.transcript,
      "system",
      "Continuing with original query.",
      pendingEdit.workflowId
    );
    yield;
    yield* runSubmitMessageWorkflow(
      state,
      getWorkflowHumanMessage(state.chatState.transcript, pendingEdit.workflowId),
      pendingEdit.workflowId,
      false
    );
  }
}
