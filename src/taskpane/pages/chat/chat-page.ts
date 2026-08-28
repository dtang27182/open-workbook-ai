/* global document, HTMLAnchorElement, HTMLButtonElement, HTMLElement, HTMLFormElement, HTMLInputElement, navigator, SubmitEvent */

import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  ChatFsmState,
  ChatMessageTranscriptItem,
  ChatTranscriptEntry,
} from "./chat-state-machine/chat-types";
import type { PageManager, TaskpanePage } from "../../taskpane";
import { OpenrouterKeyStore } from "../openrouter-auth/openrouter-api-key";
import chatPageHtml from "./chat-page.html?raw";
import { ChatStateMachine } from "./chat-state-machine/chat-state-machine";

export class ChatPage implements TaskpanePage {
  readonly name = "chat";
  private readonly chatStateMachine: ChatStateMachine;

  constructor(
    readonly element: HTMLElement,
    private readonly openrouterKeyStore: OpenrouterKeyStore,
    private readonly pageManager: PageManager
  ) {
    this.chatStateMachine = new ChatStateMachine(undefined, {
      renderTranscript: (entries) => this.renderTranscript(entries),
      configChatControls: (state) => this.configChatControls(state),
      disableChatInputControls: () => this.disableChatInputControls(),
    });
  }

  initialize(): void {
    this.element.innerHTML = chatPageHtml;
    const form = this.element.querySelector<HTMLFormElement>("#chat-form")!;
    form.onsubmit = (event) => this.handleChatSubmit(event);
    this.element.querySelector<HTMLButtonElement>("#chat-clear")!.onclick = () => {
      this.chatStateMachine.reset();
    };
    this.element.querySelector<HTMLButtonElement>("#openrouter-sign-out")!.onclick = () => {
      this.handleSignOut();
    };
    this.chatStateMachine.reset();
  }

  activate(): void {
    void this.updateOpenRouterManageKeyLink();
  }

  private async updateOpenRouterManageKeyLink(): Promise<void> {
    const manageKey = this.element.querySelector<HTMLAnchorElement>("#openrouter-manage-key")!;
    if (this.openrouterKeyStore.hasKey()) {
      manageKey.href = await this.openrouterKeyStore.createManagementUrl();
      manageKey.hidden = false;
    } else {
      manageKey.hidden = true;
      manageKey.removeAttribute("href");
    }
  }

  private async handleChatSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const input = this.element.querySelector<HTMLInputElement>("#chat-input")!;
    const message = input.value;

    input.value = ""; // Clear chat input text box

    await this.chatStateMachine.updateState({ type: "submit_message", message });
  }

  private handleSignOut(): void {
    this.openrouterKeyStore.clear();
    this.pageManager.showPage("openrouter-auth");
  }

  private disableChatInputControls() {
    this.element.querySelector<HTMLInputElement>("#chat-input")!.disabled = true;
    this.element.querySelector<HTMLButtonElement>("#chat-send")!.disabled = true;
  }

  private renderTranscript(entries: readonly ChatTranscriptEntry[]) {
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

  private configChatControls(state: ChatFsmState) {
    const isPendingEdit = state === "pending_edit" || state === "pending_edit_preprocessed";

    this.element.querySelector<HTMLInputElement>("#chat-input")!.disabled = isPendingEdit;
    this.element.querySelector<HTMLButtonElement>("#chat-send")!.disabled = isPendingEdit;
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
    if (entry.source === "system") {
      message.appendChild(this.createCopyMarkdownButton(entry.text));
    }
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

  private createCopyMarkdownButton(markdown: string) {
    const copyButton = document.createElement("button");

    copyButton.type = "button";
    copyButton.className = "chat-message-copy";
    copyButton.textContent = "Copy Markdown";
    copyButton.onclick = async () => {
      await navigator.clipboard.writeText(markdown);
      copyButton.textContent = "Copied";
    };
    return copyButton;
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
      void this.chatStateMachine.updateState({ type: "restore_to_point", restorePointId });
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
      void this.chatStateMachine.updateState({ type: "accept_pending_diff" });
    };
    rejectButton.className = "btn btn-secondary btn-compact chat-diff-action";
    rejectButton.type = "button";
    rejectButton.disabled = disabled;
    rejectButton.textContent = "Reject";
    rejectButton.onclick = () => {
      void this.chatStateMachine.updateState({ type: "reject_pending_diff" });
    };
    divider.appendChild(line);
    divider.appendChild(acceptButton);
    divider.appendChild(rejectButton);
    return divider;
  }
}
