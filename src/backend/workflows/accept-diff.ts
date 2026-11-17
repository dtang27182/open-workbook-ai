/* global console */

import type { PendingEdit, ChatSessionState } from "../chat-session-state";
import type { SheetSnapshot } from "../excel-manager";
import type { RestorePoint } from "../restore-manager";
import {
  appendMessage,
  appendWorkingTranscriptItem,
  getWorkflowHumanMessage,
  insertRestoreTranscriptItem,
  removeWorkingTranscriptItem,
} from "../transcript-helpers";
import { appendAssistantLlmMessage, appendUserDecisionLlmMessage } from "../transcript-helpers";
import { runSubmitMessageWorkflow } from "./submit-message";

export async function* runAcceptDiffWorkflow(state: ChatSessionState): AsyncGenerator<void> {
  const pendingEdit = state.chatState.pendingEdit!;
  const shouldAnalyzeUpdate = state.chatState.workflowState === "pending_edit";
  const userRequest = getWorkflowHumanMessage(state.chatState.transcript, pendingEdit.workflowId);
  setup(state, pendingEdit);
  yield;
  await performActions(state, pendingEdit);
  const restorePoint = yield* finalize(state, pendingEdit);
  if (shouldAnalyzeUpdate) {
    yield* appendUpdateAnalysis(
      state,
      userRequest,
      pendingEdit.workflowId,
      restorePoint.sheet,
      pendingEdit.sourceSheetName
    );
  }
}

function setup(state: ChatSessionState, pendingEdit: PendingEdit): void {
  appendWorkingTranscriptItem(
    state.chatState.transcript,
    "Applying changes...",
    pendingEdit.workflowId
  );
}

async function performActions(state: ChatSessionState, pendingEdit: PendingEdit): Promise<void> {
  const diffSheet = await state.excelManager.readSheet(pendingEdit.diffSheetName);
  await state.excelManager.writeSheetFormulas(
    state.excelManager.retargetFormulaSheetReferences(diffSheet, pendingEdit.sourceSheetName)
  );
  await state.excelManager.deleteDiffSheet(pendingEdit.sourceSheetName, pendingEdit.diffSheetName);
}

async function* finalize(
  state: ChatSessionState,
  pendingEdit: PendingEdit
): AsyncGenerator<void, RestorePoint> {
  const shouldContinueOriginalQuery = state.chatState.workflowState === "pending_edit_preprocessed";
  const restorePoint = state.restoreManager.promotePotentialRestorePoint(pendingEdit.workflowId);
  state.chatState.pendingEdit = undefined;
  state.chatState.workflowState = "answered";

  removeWorkingTranscriptItem(state.chatState.transcript, pendingEdit.workflowId);
  insertRestoreTranscriptItem(state.chatState.transcript, restorePoint, pendingEdit.workflowId);
  appendMessage(state.chatState.transcript, "system", "Accepted changes.", pendingEdit.workflowId, {
    kind: "edit_decision",
    decision: "accepted",
    sourceSheetName: pendingEdit.sourceSheetName,
  });
  appendUserDecisionLlmMessage(state.chatState, "Accepted changes.", pendingEdit.workflowId);

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

  return restorePoint;
}

async function* appendUpdateAnalysis(
  state: ChatSessionState,
  userRequest: string,
  workflowId: number,
  originalSheet: SheetSnapshot,
  updatedSheetName: string
): AsyncGenerator<void> {
  appendWorkingTranscriptItem(
    state.chatState.transcript,
    "Analyzing accepted changes...",
    workflowId
  );

  yield;
  try {
    const updatedSheet = await state.excelManager.readSheet(updatedSheetName);
    const analysis = await state.llmManager.runUpdateAnalysisPrompt(
      userRequest,
      originalSheet,
      updatedSheet,
      state.chatState.llmConversationMessages
    );
    removeWorkingTranscriptItem(state.chatState.transcript, workflowId);
    appendMessage(state.chatState.transcript, "system", analysis, workflowId);
    appendAssistantLlmMessage(state.chatState, analysis, workflowId);
  } catch (err) {
    console.debug("OpenRouter update analysis request failed.", err);
    removeWorkingTranscriptItem(state.chatState.transcript, workflowId);
  }
  yield;
}
