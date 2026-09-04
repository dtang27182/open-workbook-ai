import {
  ChatMessageTranscriptItem,
  LlmConversationHistory,
  SheetSnapshot,
  SpreadsheetPromptCompletionEvent,
} from "../../../../../taskpane/pages/chat/chat-state-machine/chat-types";
import { renderChatTranscript } from "../dom/chat-window-dom";
import {
  appendMessageAndRender,
  appendWorkingTranscriptItem,
  removeWorkingTranscriptItem,
  updateWorkingTranscriptItemAndRender,
  upsertTranscriptMessageAndRender,
} from "../dom/transcript-helpers";
import { processModelResponse } from "../chat-window";
import { ChatWindowState } from "../chat-window-state";

export async function runSubmitMessageWorkflow(
  state: ChatWindowState,
  message: string,
  workflowId: number,
  showHumanMessage = true
): Promise<void> {
  const { originalSheet, llmConversationMessages } = await gatherInputs(state);
  const responseEntry = setupTransition(
    state,
    message,
    workflowId,
    showHumanMessage,
    originalSheet
  );
  const result = await performActions(
    state,
    message,
    workflowId,
    originalSheet,
    llmConversationMessages,
    responseEntry
  );
  await processModelResponse(state, message, workflowId, originalSheet, responseEntry, result);
}

async function gatherInputs(state: ChatWindowState): Promise<{
  originalSheet: SheetSnapshot;
  llmConversationMessages: LlmConversationHistory;
}> {
  return {
    originalSheet: await state.excelManager.readActiveSheet(),
    llmConversationMessages: state.chatState.llmConversationMessages,
  };
}

function setupTransition(
  state: ChatWindowState,
  message: string,
  workflowId: number,
  showHumanMessage: boolean,
  originalSheet: SheetSnapshot
): ChatMessageTranscriptItem {
  state.restoreManager.createPotentialRestorePoint(workflowId, state.chatState, originalSheet);
  if (showHumanMessage) {
    appendMessageAndRender(
      state.mount,
      state.chatState.transcript,
      state.domHandlers,
      "human",
      message,
      workflowId
    );
  }
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
  message: string,
  workflowId: number,
  originalSheet: SheetSnapshot,
  llmConversationMessages: LlmConversationHistory,
  responseEntry: ChatMessageTranscriptItem
): Promise<SpreadsheetPromptCompletionEvent> {
  let completionEvent: SpreadsheetPromptCompletionEvent | undefined;
  for await (const event of state.llmManager.runMainQueryPrompt(
    message,
    workflowId,
    originalSheet,
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
