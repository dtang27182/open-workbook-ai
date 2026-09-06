/* global document, HTMLButtonElement, HTMLElement, ResizeObserver, structuredClone */

import { ChatInput } from "../chat-input/chat-input";
import DOMPurify from "dompurify";
import { marked } from "marked";
import type { ChatWorkflowStateVals } from "../chat-window-state";
import type { ChatMessageTranscriptItem, ChatTranscriptEntry } from "./transcript-helpers";
import { cloneChatPageElement } from "../../chat-page-template";

export type ChatWindowDomHandlers = {
  onClear: () => void;
  onSubmit: (message: string) => void;
  onAccept: () => void;
  onReject: () => void;
  onRestore: (restorePointId: number) => void;
};

export function createInitialDom(mount: HTMLElement, handlers: ChatWindowDomHandlers): ChatInput {
  const element = document.createElement("div");
  const messages = cloneChatPageElement<HTMLElement>("#chat-messages");
  const composer = document.createElement("div");
  const chatInputMount = document.createElement("div");
  const clearButton = cloneChatPageElement<HTMLButtonElement>("#chat-clear");

  element.id = "chat-window";
  element.className = "chat-window";
  clearButton.onclick = handlers.onClear;
  composer.className = "chat-composer";
  chatInputMount.className = "chat-input-mount";
  composer.append(clearButton, chatInputMount);
  element.append(messages, composer);
  mount.replaceChildren(element);
  const chatInput = new ChatInput(chatInputMount, handlers.onSubmit);
  let previousHeight = 0;
  const panelObserver = new ResizeObserver(([entry]) => {
    if (entry.contentRect.height !== previousHeight) {
      previousHeight = entry.contentRect.height;
      chatInput.updateState({
        type: "panel_resized",
        maxHeight: entry.contentRect.height / 2,
      });
    }
  });
  panelObserver.observe(element);
  return chatInput;
}

export function renderChatTranscript(
  mount: HTMLElement,
  entries: readonly ChatTranscriptEntry[],
  handlers: ChatWindowDomHandlers
): void {
  const messages = mount.querySelector<HTMLElement>("#chat-messages")!;

  messages.innerHTML = "";
  structuredClone(entries).forEach((entry) => {
    if (entry.kind === "restore") {
      messages.appendChild(createRestoreDivider(entry.restorePointId, entry.disabled, handlers));
    }
    if (entry.kind === "message") {
      messages.appendChild(createChatMessage(entry));
    }
    if (entry.kind === "diff_review") {
      messages.appendChild(createDiffReviewDivider(entry.disabled, handlers));
    }
    if (entry.kind === "working") {
      messages.appendChild(createWorkingMessage(entry));
    }
  });
  messages.scrollTop = messages.scrollHeight;
}

export function disableChatControls(
  mount: HTMLElement,
  entries: ChatTranscriptEntry[],
  handlers: ChatWindowDomHandlers,
  chatInput: ChatInput
): void {
  entries.forEach((entry) => {
    if (entry.kind === "restore" || entry.kind === "diff_review") {
      entry.disabled = true;
    }
  });
  chatInput.updateState({ type: "set_disabled", disabled: true });
  renderChatTranscript(mount, entries, handlers);
}

export function configChatControls(
  mount: HTMLElement,
  entries: ChatTranscriptEntry[],
  state: ChatWorkflowStateVals,
  handlers: ChatWindowDomHandlers,
  chatInput: ChatInput
): void {
  entries.forEach((entry) => {
    if (entry.kind === "restore" || entry.kind === "diff_review") {
      entry.disabled = false;
    }
  });
  renderChatTranscript(mount, entries, handlers);
  const isPendingEdit = state === "pending_edit" || state === "pending_edit_preprocessed";

  chatInput.updateState({ type: "set_disabled", disabled: isPendingEdit });
}

function createChatMessage(entry: ChatMessageTranscriptItem): HTMLElement {
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

function createWorkingMessage(
  entry: Extract<ChatTranscriptEntry, { kind: "working" }>
): HTMLElement {
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

function createRestoreDivider(
  restorePointId: number,
  disabled: boolean,
  handlers: ChatWindowDomHandlers
): HTMLElement {
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
    handlers.onRestore(restorePointId);
  };
  divider.appendChild(line);
  divider.appendChild(restoreButton);
  return divider;
}

function createDiffReviewDivider(disabled: boolean, handlers: ChatWindowDomHandlers): HTMLElement {
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
  acceptButton.onclick = handlers.onAccept;
  rejectButton.className = "btn btn-secondary btn-compact chat-diff-action";
  rejectButton.type = "button";
  rejectButton.disabled = disabled;
  rejectButton.textContent = "Reject";
  rejectButton.onclick = handlers.onReject;
  divider.appendChild(line);
  divider.appendChild(acceptButton);
  divider.appendChild(rejectButton);
  return divider;
}
