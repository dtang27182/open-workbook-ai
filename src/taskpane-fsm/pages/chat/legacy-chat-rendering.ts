/* global document, HTMLButtonElement, HTMLElement, HTMLInputElement */

import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  ChatFsmState,
  ChatMessageTranscriptItem,
  ChatStateMachineUI,
  ChatTranscriptEntry,
} from "../../../taskpane/pages/chat/chat-state-machine/chat-types";

type LegacyChatRenderingHandlers = {
  onAccept: () => void;
  onReject: () => void;
  onRestore: (restorePointId: number) => void;
};

export class LegacyChatRendering implements ChatStateMachineUI {
  constructor(
    private readonly element: HTMLElement,
    private readonly handlers: LegacyChatRenderingHandlers
  ) {}

  renderTranscript(entries: readonly ChatTranscriptEntry[]) {
    const messages = this.element.querySelector<HTMLElement>("#chat-messages")!;
    messages.innerHTML = "";
    entries.forEach((entry) => {
      if (entry.kind === "restore") {
        messages.appendChild(this.createRestoreDivider(entry.restorePointId, entry.disabled));
      }
      if (entry.kind === "message") {
        messages.appendChild(this.createChatMessage(entry));
      }
      if (entry.kind === "diff_review") {
        messages.appendChild(this.createDiffReviewDivider(entry.disabled));
      }
      if (entry.kind === "working") {
        messages.appendChild(this.createWorkingMessage(entry));
      }
    });
    messages.scrollTop = messages.scrollHeight;
  }

  configChatControls(state: ChatFsmState) {
    const isPendingEdit = state === "pending_edit" || state === "pending_edit_preprocessed";

    this.element.querySelector<HTMLInputElement>("#chat-input")!.disabled = isPendingEdit;
    this.element.querySelector<HTMLButtonElement>("#chat-send")!.disabled = isPendingEdit;
  }

  disableChatInputControls() {
    this.element.querySelector<HTMLInputElement>("#chat-input")!.disabled = true;
    this.element.querySelector<HTMLButtonElement>("#chat-send")!.disabled = true;
  }

  private createChatMessage(entry: ChatMessageTranscriptItem) {
    const message = document.createElement("div");
    const label = document.createElement("div");
    const body = document.createElement("div");

    message.className = `chat-message ${entry.source}`;
    label.className = "chat-message-source";
    label.textContent = entry.source;
    body.className = "chat-message-text";
    if (entry.source === "human") {
      body.textContent = entry.text;
    }
    if (entry.source === "system") {
      body.innerHTML = DOMPurify.sanitize(marked.parse(entry.text, { async: false }), {
        USE_PROFILES: { html: true },
      });
    }
    message.appendChild(label);
    message.appendChild(body);
    return message;
  }

  private createWorkingMessage(entry: Extract<ChatTranscriptEntry, { kind: "working" }>) {
    const message = document.createElement("div");
    const label = document.createElement("div");
    const body = document.createElement("div");
    const indicator = document.createElement("span");

    message.className = `chat-message ${entry.source}`;
    label.className = "chat-message-source";
    label.textContent = entry.source;
    body.className = "chat-message-text chat-working";
    body.textContent = entry.text;
    body.setAttribute("role", "status");
    indicator.className = "chat-working-indicator";
    indicator.setAttribute("aria-hidden", "true");
    body.prepend(indicator);
    message.appendChild(label);
    message.appendChild(body);
    return message;
  }

  private createRestoreDivider(restorePointId: number, disabled: boolean) {
    const divider = document.createElement("div");
    const line = document.createElement("div");
    const restoreButton = document.createElement("button");

    divider.className = "chat-restore-divider";
    line.className = "chat-restore-line";
    restoreButton.className = "btn btn-secondary btn-compact chat-message-restore";
    restoreButton.type = "button";
    restoreButton.disabled = disabled;
    restoreButton.textContent = "Restore";
    restoreButton.onclick = () => {
      this.handlers.onRestore(restorePointId);
    };
    divider.appendChild(line);
    divider.appendChild(restoreButton);
    return divider;
  }

  private createDiffReviewDivider(disabled: boolean) {
    const divider = document.createElement("div");
    const line = document.createElement("div");
    const acceptButton = document.createElement("button");
    const rejectButton = document.createElement("button");

    divider.className = "chat-restore-divider";
    line.className = "chat-restore-line";
    acceptButton.className = "btn btn-secondary btn-compact chat-diff-action";
    acceptButton.type = "button";
    acceptButton.disabled = disabled;
    acceptButton.textContent = "Accept";
    acceptButton.onclick = () => {
      this.handlers.onAccept();
    };
    rejectButton.className = "btn btn-secondary btn-compact chat-diff-action";
    rejectButton.type = "button";
    rejectButton.disabled = disabled;
    rejectButton.textContent = "Reject";
    rejectButton.onclick = () => {
      this.handlers.onReject();
    };
    divider.appendChild(line);
    divider.appendChild(acceptButton);
    divider.appendChild(rejectButton);
    return divider;
  }
}
