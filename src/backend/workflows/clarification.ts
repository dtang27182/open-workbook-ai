import type { ChatMessageTranscriptItem } from "../chat-session";
import {
  appendMessage,
  appendWorkingTranscriptItem,
  getWorkflowHumanMessage,
  removeWorkingTranscriptItem,
  updateWorkingTranscriptItem,
  upsertTranscriptMessage,
} from "../transcript-helpers";
import type { LlmConversationHistory, SpreadsheetPromptCompletionEvent } from "../llm/llm-manager";
import { processModelResponse } from "./model-response";
import { ChatSessionState } from "../chat-session-state";

export async function* runClarificationWorkflow(
  state: ChatSessionState,
  answer: string
): AsyncGenerator<void> {
  const pendingToolCall = state.llmManager.getPendingClarificationToolCall(
    state.chatState.llmConversationMessages
  );
  const workflowId = pendingToolCall.workflowId;
  const originalSheet = await state.excelManager.readActiveSheet();
  const responseEntry = setupTransition(state, answer, workflowId);
  yield;
  const result = yield* performActions(
    state,
    answer,
    workflowId,
    state.chatState.llmConversationMessages,
    responseEntry
  );
  yield* processModelResponse(
    state,
    getWorkflowHumanMessage(state.chatState.transcript, workflowId),
    workflowId,
    originalSheet,
    responseEntry,
    result
  );
}

function setupTransition(
  state: ChatSessionState,
  answer: string,
  workflowId: number
): ChatMessageTranscriptItem {
  appendMessage(state.chatState.transcript, "human", answer, workflowId);
  appendWorkingTranscriptItem(state.chatState.transcript, "Working...", workflowId);

  return {
    kind: "message",
    source: "system",
    text: "",
    workflowId,
  };
}

async function* performActions(
  state: ChatSessionState,
  answer: string,
  workflowId: number,
  llmConversationMessages: LlmConversationHistory,
  responseEntry: ChatMessageTranscriptItem
): AsyncGenerator<void, SpreadsheetPromptCompletionEvent> {
  let completionEvent: SpreadsheetPromptCompletionEvent | undefined;
  for await (const event of state.llmManager.runClarificationResponsePrompt(
    answer,
    workflowId,
    llmConversationMessages
  )) {
    if (event.type === "partial_response") {
      upsertTranscriptMessage(state.chatState.transcript, responseEntry, { text: event.text });
    } else if (event.type === "creating_proposed_change") {
      updateWorkingTranscriptItem(
        state.chatState.transcript,
        "Creating proposed change...",
        workflowId
      );
    } else if (event.type === "creating_scenario_sheet") {
      updateWorkingTranscriptItem(
        state.chatState.transcript,
        "Creating new sheet to model scenario...",
        workflowId
      );
    } else if (event.type === "clarification_requested" || event.type === "complete") {
      completionEvent = event;
    }
    yield;
  }
  removeWorkingTranscriptItem(state.chatState.transcript, workflowId);

  return completionEvent!;
}
