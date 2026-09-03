/* global console, HTMLInputElement, HTMLElement */

import { Component } from "../../component-v2";
import { readActiveSheet } from "../../../taskpane/pages/chat/chat-state-machine/excel-sheet-utils";
import {
  ChatFsmState,
  ChatStateMachineInput,
  ExcelApi,
} from "../../../taskpane/pages/chat/chat-state-machine/chat-types";
import {
  ChatWindowDomHandlers,
  configChatControls,
  createInitialDom,
  disableChatControls,
} from "./chat-window-dom";
import { appendMessageAndRender } from "./chat-window-transcript-helpers";
import { AcceptDiffWorkflow } from "./chat-window-accept-diff-workflow";
import { ClarificationWorkflow } from "./chat-window-clarification-workflow";
import { PreprocessWorkflow } from "./chat-window-preprocess-workflow";
import { RejectDiffWorkflow } from "./chat-window-reject-diff-workflow";
import { RestoreWorkflow } from "./chat-window-restore-workflow";
import { ChatWindowState } from "./chat-window-state";
import { SubmitMessageWorkflow } from "./chat-window-submit-message-workflow";

const preprocessingEnabled = true;

export type ChatWindowUpdateEvent = { type: "clear" } | ChatStateMachineInput;

export class ChatWindow implements Component<ChatWindowUpdateEvent> {
  private readonly state: ChatWindowState;
  private readonly submitMessageWorkflow: SubmitMessageWorkflow;
  private readonly clarificationWorkflow: ClarificationWorkflow;
  private readonly preprocessWorkflow: PreprocessWorkflow;
  private readonly acceptDiffWorkflow: AcceptDiffWorkflow;
  private readonly rejectDiffWorkflow: RejectDiffWorkflow;
  private readonly restoreWorkflow: RestoreWorkflow;

  constructor(mount: HTMLElement, excelApi?: ExcelApi) {
    const domHandlers: ChatWindowDomHandlers = {
      onClear: () => {
        void this.updateState({ type: "clear" });
      },
      onSubmit: (message) => {
        void this.updateState({ type: "submit_message", message });
      },
      onAccept: () => {
        void this.updateState({ type: "accept_pending_diff" });
      },
      onReject: () => {
        void this.updateState({ type: "reject_pending_diff" });
      },
      onRestore: (restorePointId) => {
        void this.updateState({ type: "restore_to_point", restorePointId });
      },
    };
    this.state = new ChatWindowState(mount, domHandlers, excelApi);
    this.submitMessageWorkflow = new SubmitMessageWorkflow(this.state);
    const runSubmitMessageWorkflow = (
      message: string,
      workflowId: number,
      showHumanMessage: boolean
    ) => this.submitMessageWorkflow.run(message, workflowId, showHumanMessage);
    this.preprocessWorkflow = new PreprocessWorkflow(this.state, runSubmitMessageWorkflow);
    this.acceptDiffWorkflow = new AcceptDiffWorkflow(this.state, runSubmitMessageWorkflow);
    this.rejectDiffWorkflow = new RejectDiffWorkflow(this.state, runSubmitMessageWorkflow);
    this.clarificationWorkflow = new ClarificationWorkflow(this.state, this.submitMessageWorkflow);
    this.restoreWorkflow = new RestoreWorkflow(this.state);
    createInitialDom(this.state.mount, this.state.domHandlers);
    this.reset();
  }

  getMount(): HTMLElement {
    return this.state.mount;
  }

  private reset(): void {
    this.state.chatState = {
      transcript: [
        {
          kind: "message",
          source: "system",
          text: "Ask me to analyze the data, update the model, or model a new scenario.",
          workflowId: 0,
        },
      ],
      llmConversationMessages: [],
      fsmState: "answered",
      preprocessedSheetNames: [],
    };
    this.state.restoreManager.clearAllRestorePoints();
    this.state.nextDiffSheetNumber = 1;
    this.state.nextScenarioSheetNumber = 1;
    configChatControls(
      this.state.mount,
      this.state.chatState.transcript,
      this.state.chatState.fsmState,
      this.state.domHandlers
    );
  }

  async updateState(event: ChatWindowUpdateEvent): Promise<void> {
    if (event.type === "clear") {
      this.reset();
    } else if (
      event.type === "submit_message" ||
      event.type === "accept_pending_diff" ||
      event.type === "reject_pending_diff" ||
      event.type === "restore_to_point"
    ) {
      disableChatControls(
        this.state.mount,
        this.state.chatState.transcript,
        this.state.domHandlers
      );
      try {
        this.validateInputForCurrentState(event);

        if (event.type === "submit_message") {
          await this.submitMessage(event.message);
        } else if (event.type === "accept_pending_diff") {
          await this.acceptDiffWorkflow.run();
        } else if (event.type === "reject_pending_diff") {
          await this.rejectDiffWorkflow.run();
        } else if (event.type === "restore_to_point") {
          await this.restoreWorkflow.run(event.restorePointId);
        }
      } catch (err) {
        console.debug(err);
        this.appendErrorMessage(this.getErrorMessage(event));
      } finally {
        configChatControls(
          this.state.mount,
          this.state.chatState.transcript,
          this.state.chatState.fsmState,
          this.state.domHandlers
        );
      }
    }
  }

  private async submitMessage(message: string): Promise<void> {
    this.state.mount.querySelector<HTMLInputElement>("#chat-input")!.value = "";
    if (this.state.chatState.fsmState === "awaiting_clarification") {
      await this.clarificationWorkflow.run(message);
      return;
    }

    const currentSheet = await readActiveSheet(this.state.excelApi);
    const workflowId = this.state.nextWorkflowId++;

    if (
      preprocessingEnabled &&
      !this.state.chatState.preprocessedSheetNames.includes(currentSheet.name)
    ) {
      await this.preprocessWorkflow.run(message, workflowId);
    } else {
      await this.submitMessageWorkflow.run(message, workflowId, true);
    }
  }

  private appendErrorMessage(message: string) {
    if (this.state.chatState.pendingEdit) {
      this.state.chatState.transcript = this.state.chatState.transcript.filter(
        (entry) =>
          entry.workflowId !== this.state.chatState.pendingEdit!.workflowId ||
          (entry.kind !== "diff_review" && entry.kind !== "working")
      );
    } else {
      this.state.chatState.transcript = this.state.chatState.transcript.filter(
        (entry) => entry.kind !== "working"
      );
    }
    this.state.chatState.fsmState = "errored";
    appendMessageAndRender(
      this.state.mount,
      this.state.chatState.transcript,
      this.state.domHandlers,
      "system",
      message,
      0
    );
  }

  private validateInputForCurrentState(input: ChatStateMachineInput) {
    if (input.type === "submit_message") {
      if (
        !this.isTerminalTurnState(this.state.chatState.fsmState) &&
        this.state.chatState.fsmState !== "awaiting_clarification"
      ) {
        throw new Error(
          `Cannot submit a chat message while the chat state is ${this.state.chatState.fsmState}.`
        );
      }
      return;
    }

    if (input.type === "accept_pending_diff") {
      if (!this.isPendingEditState(this.state.chatState.fsmState)) {
        throw new Error("Cannot accept changes unless the latest turn is pending_edit.");
      }
      return;
    }

    if (input.type === "reject_pending_diff") {
      if (!this.isPendingEditState(this.state.chatState.fsmState)) {
        throw new Error("Cannot reject changes unless the latest turn is pending_edit.");
      }
      return;
    }

    if (input.type === "restore_to_point") {
      return;
    }
  }

  private getErrorMessage(input: ChatStateMachineInput): string {
    if (input.type === "submit_message") {
      return "I could not get an assistant response. Check the active worksheet and OpenRouter configuration, then ask again.";
    }

    if (input.type === "accept_pending_diff") {
      return "I could not accept the changes.";
    }

    if (input.type === "reject_pending_diff") {
      return "I could not reject the changes.";
    }

    if (input.type === "restore_to_point") {
      return "I could not restore the sheet.";
    }
  }

  private isTerminalTurnState(state: ChatFsmState): boolean {
    return state === "answered" || state === "errored";
  }

  private isPendingEditState(state: ChatFsmState): boolean {
    return state === "pending_edit" || state === "pending_edit_preprocessed";
  }
}
