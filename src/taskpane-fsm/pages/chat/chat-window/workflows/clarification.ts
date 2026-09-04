import {
  getPendingClarificationToolCall,
  runClarificationResponsePrompt,
} from "../../../../../taskpane/pages/chat/chat-state-machine/llm-model-workflow";
import {
  ChatMessageTranscriptItem,
  LlmConversationHistory,
  SpreadsheetPromptCompletionEvent,
} from "../../../../../taskpane/pages/chat/chat-state-machine/chat-types";
import { renderChatTranscript } from "../dom/chat-window-dom";
import {
  appendMessageAndRender,
  appendWorkingTranscriptItem,
  getWorkflowHumanMessage,
  removeWorkingTranscriptItem,
  updateWorkingTranscriptItemAndRender,
  upsertTranscriptMessageAndRender,
} from "../dom/transcript-helpers";
import { processModelResponse } from "../chat-window";
import { ChatWindowState } from "../chat-window-state";

export async function runClarificationWorkflow(
  state: ChatWindowState,
  answer: string
): Promise<void> {
  const pendingToolCall = getPendingClarificationToolCall(state.chatState.llmConversationMessages);
  const workflowId = pendingToolCall.workflowId;
  const originalSheet = await state.excelController.readActiveSheet();
  const responseEntry = setupTransition(state, answer, workflowId);
  const result = await performActions(
    state,
    answer,
    workflowId,
    state.chatState.llmConversationMessages,
    responseEntry
  );
  await processModelResponse(
    state,
    getWorkflowHumanMessage(state.chatState.transcript, workflowId),
    workflowId,
    originalSheet,
    responseEntry,
    result
  );
}

function setupTransition(
  state: ChatWindowState,
  answer: string,
  workflowId: number
): ChatMessageTranscriptItem {
  appendMessageAndRender(
    state.mount,
    state.chatState.transcript,
    state.domHandlers,
    "human",
    answer,
    workflowId
  );
  appendWorkingTranscriptItem(state.chatState.transcript, "Working...", workflowId);
  renderChatTranscript(state.mount, state.chatState.transcript, state.domHandlers);
  return {
    kind: "message",
    source: "system",
    text: "",
    workflowId,
  };
}

async function performActions(
  state: ChatWindowState,
  answer: string,
  workflowId: number,
  llmConversationMessages: LlmConversationHistory,
  responseEntry: ChatMessageTranscriptItem
): Promise<SpreadsheetPromptCompletionEvent> {
  let completionEvent: SpreadsheetPromptCompletionEvent | undefined;
  for await (const event of runClarificationResponsePrompt(
    answer,
    workflowId,
    llmConversationMessages
  )) {
    if (event.type === "partial_response") {
      upsertTranscriptMessageAndRender(
        state.mount,
        state.chatState.transcript,
        state.domHandlers,
        responseEntry,
        { text: event.text }
      );
    }

    if (event.type === "creating_proposed_change") {
      updateWorkingTranscriptItemAndRender(
        state.mount,
        state.chatState.transcript,
        state.domHandlers,
        "Creating proposed change...",
        workflowId
      );
    }

    if (event.type === "creating_scenario_sheet") {
      updateWorkingTranscriptItemAndRender(
        state.mount,
        state.chatState.transcript,
        state.domHandlers,
        "Creating new sheet to model scenario...",
        workflowId
      );
    }

    if (event.type === "clarification_requested" || event.type === "complete") {
      completionEvent = event;
    }
  }
  removeWorkingTranscriptItem(state.chatState.transcript, workflowId);

  return completionEvent!;
}
