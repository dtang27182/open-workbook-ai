import { readActiveSheet } from "../../../taskpane/pages/chat/chat-state-machine/excel-sheet-utils";
import {
  getPendingClarificationToolCall,
  runClarificationResponsePrompt,
} from "../../../taskpane/pages/chat/chat-state-machine/llm-model-workflow";
import {
  ChatMessageTranscriptItem,
  LlmConversationHistory,
  SpreadsheetPromptCompletionEvent,
} from "../../../taskpane/pages/chat/chat-state-machine/chat-types";
import { renderChatTranscript } from "./chat-window-dom";
import {
  appendMessageAndRender,
  appendWorkingTranscriptItem,
  getWorkflowHumanMessage,
  removeWorkingTranscriptItem,
  updateWorkingTranscriptItemAndRender,
  upsertTranscriptMessageAndRender,
} from "./chat-window-transcript-helpers";
import type { ProcessModelResponse } from "./chat-window";
import { ChatWindowState } from "./chat-window-state";

export class ClarificationWorkflow {
  constructor(
    private readonly state: ChatWindowState,
    private readonly processModelResponse: ProcessModelResponse
  ) {}

  async run(answer: string): Promise<void> {
    const pendingToolCall = getPendingClarificationToolCall(
      this.state.chatState.llmConversationMessages
    );
    const workflowId = pendingToolCall.workflowId;
    const originalSheet = await readActiveSheet(this.state.excelApi);
    const responseEntry = this.setupTransition(answer, workflowId);
    const result = await this.performActions(
      answer,
      workflowId,
      this.state.chatState.llmConversationMessages,
      responseEntry
    );
    await this.processModelResponse(
      getWorkflowHumanMessage(this.state.chatState.transcript, workflowId),
      workflowId,
      originalSheet,
      responseEntry,
      result
    );
  }

  private setupTransition(answer: string, workflowId: number): ChatMessageTranscriptItem {
    appendMessageAndRender(
      this.state.mount,
      this.state.chatState.transcript,
      this.state.domHandlers,
      "human",
      answer,
      workflowId
    );
    appendWorkingTranscriptItem(this.state.chatState.transcript, "Working...", workflowId);
    renderChatTranscript(this.state.mount, this.state.chatState.transcript, this.state.domHandlers);
    return {
      kind: "message",
      source: "system",
      text: "",
      workflowId,
    };
  }

  private async performActions(
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
          this.state.mount,
          this.state.chatState.transcript,
          this.state.domHandlers,
          responseEntry,
          { text: event.text }
        );
      }

      if (event.type === "creating_proposed_change") {
        updateWorkingTranscriptItemAndRender(
          this.state.mount,
          this.state.chatState.transcript,
          this.state.domHandlers,
          "Creating proposed change...",
          workflowId
        );
      }

      if (event.type === "creating_scenario_sheet") {
        updateWorkingTranscriptItemAndRender(
          this.state.mount,
          this.state.chatState.transcript,
          this.state.domHandlers,
          "Creating new sheet to model scenario...",
          workflowId
        );
      }

      if (event.type === "clarification_requested" || event.type === "complete") {
        completionEvent = event;
      }
    }
    removeWorkingTranscriptItem(this.state.chatState.transcript, workflowId);

    return completionEvent!;
  }
}
