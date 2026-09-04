import { readActiveSheet } from "../../../taskpane/pages/chat/chat-state-machine/excel-sheet-utils";
import { runMainQueryPrompt } from "../../../taskpane/pages/chat/chat-state-machine/llm-model-workflow";
import {
  ChatMessageTranscriptItem,
  LlmConversationHistory,
  SheetSnapshot,
  SpreadsheetPromptCompletionEvent,
} from "../../../taskpane/pages/chat/chat-state-machine/chat-types";
import { renderChatTranscript } from "./chat-window-dom";
import {
  appendMessageAndRender,
  appendWorkingTranscriptItem,
  removeWorkingTranscriptItem,
  updateWorkingTranscriptItemAndRender,
  upsertTranscriptMessageAndRender,
} from "./chat-window-transcript-helpers";
import type { ProcessModelResponse } from "./chat-window";
import { ChatWindowState } from "./chat-window-state";

export class SubmitMessageWorkflow {
  constructor(
    private readonly state: ChatWindowState,
    private readonly processModelResponse: ProcessModelResponse
  ) {}

  async run(message: string, workflowId: number, showHumanMessage = true): Promise<void> {
    const { originalSheet, llmConversationMessages } = await this.gatherInputs();
    const responseEntry = this.setupTransition(
      message,
      workflowId,
      showHumanMessage,
      originalSheet
    );
    const result = await this.performActions(
      message,
      workflowId,
      originalSheet,
      llmConversationMessages,
      responseEntry
    );
    await this.processModelResponse(message, workflowId, originalSheet, responseEntry, result);
  }

  private async gatherInputs(): Promise<{
    originalSheet: SheetSnapshot;
    llmConversationMessages: LlmConversationHistory;
  }> {
    return {
      originalSheet: await readActiveSheet(this.state.excelApi),
      llmConversationMessages: this.state.chatState.llmConversationMessages,
    };
  }

  private setupTransition(
    message: string,
    workflowId: number,
    showHumanMessage: boolean,
    originalSheet: SheetSnapshot
  ): ChatMessageTranscriptItem {
    this.state.restoreManager.createPotentialRestorePoint(
      workflowId,
      this.state.chatState,
      originalSheet
    );
    if (showHumanMessage) {
      appendMessageAndRender(
        this.state.mount,
        this.state.chatState.transcript,
        this.state.domHandlers,
        "human",
        message,
        workflowId
      );
    }
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
    message: string,
    workflowId: number,
    originalSheet: SheetSnapshot,
    llmConversationMessages: LlmConversationHistory,
    responseEntry: ChatMessageTranscriptItem
  ): Promise<SpreadsheetPromptCompletionEvent> {
    let completionEvent: SpreadsheetPromptCompletionEvent | undefined;
    for await (const event of runMainQueryPrompt(
      message,
      workflowId,
      originalSheet,
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
