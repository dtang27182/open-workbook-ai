import type { ChatMessageTranscriptItem } from "../chat-session";
import type { CellEdit, SheetSnapshot } from "../excel-manager";
import type { ChatSessionState } from "../chat-session-state";
import type {
  ComparisonRange,
  LlmConversationHistory,
  SpreadsheetPromptCompletionEvent,
} from "../llm/llm-manager";
import {
  appendMessage,
  appendWorkingTranscriptItem,
  removeWorkingTranscriptItem,
  upsertTranscriptMessage,
  appendAssistantLlmMessage,
} from "../transcript-helpers";

export async function* processModelResponse(
  state: ChatSessionState,
  userRequest: string,
  workflowId: number,
  originalSheet: SheetSnapshot,
  responseEntry: ChatMessageTranscriptItem,
  response: SpreadsheetPromptCompletionEvent
): AsyncGenerator<void> {
  state.chatState.llmConversationMessages = response.updatedLlmConversationMessages;

  if (response.type === "clarification_requested") {
    upsertTranscriptMessage(state.chatState.transcript, responseEntry, { text: response.question });
    state.chatState.workflowState = "awaiting_clarification";
  } else if (!response.reply.shouldEditSheet) {
    upsertTranscriptMessage(state.chatState.transcript, responseEntry, {
      text: response.reply.message,
    });
    state.restoreManager.discardPotentialRestorePoint(workflowId);
    state.chatState.workflowState = "answered";
  } else if (response.reply.createNewSheet) {
    upsertTranscriptMessage(state.chatState.transcript, responseEntry, {
      text: response.reply.message,
    });
    yield;
    yield* createScenarioWithComparison(
      state,
      userRequest,
      workflowId,
      originalSheet,
      response.reply.cellEdits,
      response.reply.comparisonRanges,
      state.chatState.llmConversationMessages
    );
    state.restoreManager.discardPotentialRestorePoint(workflowId);
    state.chatState.workflowState = "answered";
  } else if (response.reply.shouldEditSheet && !response.reply.createNewSheet) {
    upsertTranscriptMessage(state.chatState.transcript, responseEntry, {
      text: response.reply.message,
    });
    yield;
    const diff = await state.excelManager.createNextDiffSheet(
      originalSheet,
      response.reply.cellEdits
    );
    state.chatState.pendingEdit = {
      sourceSheetName: originalSheet.name,
      diffSheetName: diff.sheetName,
      workflowId,
    };
    state.chatState.workflowState = "pending_edit";
  }
  yield;
}

async function* createScenarioWithComparison(
  state: ChatSessionState,
  userRequest: string,
  workflowId: number,
  originalSheet: SheetSnapshot,
  scenarioModelEdits: CellEdit[],
  comparisonRanges: ComparisonRange[],
  llmConversationMessages: LlmConversationHistory
): AsyncGenerator<void> {
  const scenarioSheetName = await state.excelManager.createNextScenarioSheet(
    originalSheet,
    scenarioModelEdits
  );
  if (state.chatState.preprocessedSheetNames.includes(originalSheet.name)) {
    state.chatState.preprocessedSheetNames.push(scenarioSheetName);
  }
  const scenarioSheet = await state.excelManager.readSheet(scenarioSheetName);
  appendWorkingTranscriptItem(
    state.chatState.transcript,
    "Creating comparison between new scenario against baseline...",
    workflowId
  );

  yield;
  const comparison = await state.llmManager.runScenarioComparisonPrompt(
    userRequest,
    originalSheet,
    scenarioSheet,
    comparisonRanges,
    llmConversationMessages
  );
  await state.excelManager.applyCellEditsToSheet(scenarioSheet, comparison.cellEdits);
  removeWorkingTranscriptItem(state.chatState.transcript, workflowId);
  appendMessage(state.chatState.transcript, "system", comparison.analysis, workflowId);
  appendAssistantLlmMessage(state.chatState, comparison.analysis, workflowId);
  yield;
}
