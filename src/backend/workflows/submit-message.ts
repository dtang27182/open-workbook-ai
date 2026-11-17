import type { ChatMessageTranscriptItem } from "../chat-session";
import {
  appendMessage,
  appendWorkingTranscriptItem,
  removeWorkingTranscriptItem,
  updateWorkingTranscriptItem,
  upsertTranscriptMessage,
} from "../transcript-helpers";
import type { LlmConversationHistory, SpreadsheetPromptCompletionEvent } from "../llm/llm-manager";
import type { SheetSnapshot } from "../excel-manager";
import { processModelResponse } from "./model-response";
import { ChatSessionState } from "../chat-session-state";

export async function* runSubmitMessageWorkflow(
  state: ChatSessionState,
  message: string,
  workflowId: number,
  showHumanMessage = true
): AsyncGenerator<void> {
  const { originalSheet, llmConversationMessages } = await gatherInputs(state);
  const responseEntry = setupTransition(
    state,
    message,
    workflowId,
    showHumanMessage,
    originalSheet
  );
  yield;
  const result = yield* performActions(
    state,
    message,
    workflowId,
    originalSheet,
    llmConversationMessages,
    responseEntry
  );
  yield* processModelResponse(state, message, workflowId, originalSheet, responseEntry, result);
}

async function gatherInputs(state: ChatSessionState): Promise<{
  originalSheet: SheetSnapshot;
  llmConversationMessages: LlmConversationHistory;
}> {
  return {
    originalSheet: await state.excelManager.readActiveSheet(),
    llmConversationMessages: state.chatState.llmConversationMessages,
  };
}

function setupTransition(
  state: ChatSessionState,
  message: string,
  workflowId: number,
  showHumanMessage: boolean,
  originalSheet: SheetSnapshot
): ChatMessageTranscriptItem {
  state.restoreManager.createPotentialRestorePoint(workflowId, state.chatState, originalSheet);
  if (showHumanMessage) {
    appendMessage(state.chatState.transcript, "human", message, workflowId);
  }
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
  message: string,
  workflowId: number,
  originalSheet: SheetSnapshot,
  llmConversationMessages: LlmConversationHistory,
  responseEntry: ChatMessageTranscriptItem
): AsyncGenerator<void, SpreadsheetPromptCompletionEvent> {
  let completionEvent: SpreadsheetPromptCompletionEvent | undefined;
  for await (const event of state.llmManager.runMainQueryPrompt(
    message,
    workflowId,
    originalSheet,
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
