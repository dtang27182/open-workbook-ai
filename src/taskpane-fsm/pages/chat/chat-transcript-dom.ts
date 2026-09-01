/* global document, HTMLButtonElement, HTMLFormElement, HTMLInputElement, HTMLElement, structuredClone */

import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  ChatFsmState,
  ChatMessageTranscriptItem,
  ChatTranscriptEntry,
} from "../../../taskpane/pages/chat/chat-state-machine/chat-types";
import { cloneChatPageElement } from "./chat-page-template";

export type ChatTranscriptDomHandlers = {
  onClear: () => void;
  onSubmit: (message: string) => void;
  onAccept: () => void;
  onReject: () => void;
  onRestore: (restorePointId: number) => void;
};

export function createInitialDom(mount: HTMLElement, handlers: ChatTranscriptDomHandlers): void {
  const element = document.createElement("div");
  const messages = cloneChatPageElement<HTMLElement>("#chat-messages");
  const form = cloneChatPageElement<HTMLFormElement>("#chat-form");
  const clearButton = cloneChatPageElement<HTMLButtonElement>("#chat-clear");
  const input = form.querySelector<HTMLInputElement>("#chat-input")!;

  element.id = "chat-transcript";
  element.className = "chat-transcript";
  clearButton.onclick = handlers.onClear;
  form.onsubmit = (event) => {
    event.preventDefault();
    handlers.onSubmit(input.value);
  };
  form.prepend(clearButton);
  element.append(messages, form);
  mount.replaceChildren(element);
}

export function renderChatTranscript(
  mount: HTMLElement,
  entries: readonly ChatTranscriptEntry[],
  handlers: ChatTranscriptDomHandlers
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
  handlers: ChatTranscriptDomHandlers
): void {
  entries.forEach((entry) => {
    if (entry.kind === "restore" || entry.kind === "diff_review") {
      entry.disabled = true;
    }
  });
  mount.querySelector<HTMLInputElement>("#chat-input")!.disabled = true;
  mount.querySelector<HTMLButtonElement>("#chat-send")!.disabled = true;
  renderChatTranscript(mount, entries, handlers);
}

export function configChatControls(
  mount: HTMLElement,
  entries: ChatTranscriptEntry[],
  state: ChatFsmState,
  handlers: ChatTranscriptDomHandlers
): void {
  entries.forEach((entry) => {
    if (entry.kind === "restore" || entry.kind === "diff_review") {
      entry.disabled = false;
    }
  });
  renderChatTranscript(mount, entries, handlers);
  const isPendingEdit = state === "pending_edit" || state === "pending_edit_preprocessed";

  mount.querySelector<HTMLInputElement>("#chat-input")!.disabled = isPendingEdit;
  mount.querySelector<HTMLButtonElement>("#chat-send")!.disabled = isPendingEdit;
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
  handlers: ChatTranscriptDomHandlers
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

function createDiffReviewDivider(
  disabled: boolean,
  handlers: ChatTranscriptDomHandlers
): HTMLElement {
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
