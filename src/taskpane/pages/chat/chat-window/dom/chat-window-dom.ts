/* global document, HTMLButtonElement, HTMLElement, ResizeObserver, structuredClone */

import { ChatInput } from "../chat-input/chat-input";
import DOMPurify from "dompurify";
import { marked } from "marked";
import type { ChatWorkflowStateVals } from "../chat-window-state";
import type {
  ChatFormulaInferenceTranscriptItem,
  ChatMessagePresentation,
  ChatMessageTranscriptItem,
  ChatTranscriptEntry,
} from "./transcript-helpers";
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
  const providerDetails = cloneChatPageElement<HTMLElement>(".provider-link-details");
  const messages = cloneChatPageElement<HTMLElement>("#chat-messages");
  const chatInputMount = document.createElement("div");
  const reviewFooter = document.createElement("div");

  element.id = "chat-window";
  element.className = "chat-window";
  providerDetails.querySelector<HTMLButtonElement>("#chat-clear")!.onclick = handlers.onClear;
  reviewFooter.className = "chat-review-footer";
  reviewFooter.hidden = true;
  chatInputMount.className = "chat-input-mount";
  element.append(providerDetails, messages, chatInputMount, reviewFooter);
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
  const chatInputMount = mount.querySelector<HTMLElement>(".chat-input-mount")!;
  const reviewFooter = mount.querySelector<HTMLElement>(".chat-review-footer")!;
  const scopeStrip = mount.querySelector<HTMLElement>(".provider-link-details")!;
  const scope = scopeStrip.querySelector<HTMLElement>(".chat-scope")!;
  const review = entries.find((entry) => entry.kind === "diff_review");

  chatInputMount.hidden = review !== undefined;
  reviewFooter.hidden = review === undefined;
  reviewFooter.replaceChildren();
  scopeStrip.classList.toggle("review-pending", review !== undefined);
  if (review) {
    const sheetName = document.createElement("span");
    sheetName.className = "chat-sheet-name";
    sheetName.textContent = review.diffSheetName;
    scope.replaceChildren("Changes staged on ", sheetName, " — original untouched");
  } else {
    scope.textContent = "Active worksheet";
  }

  messages.innerHTML = "";
  structuredClone(entries).forEach((entry) => {
    if (entry.kind === "restore") {
      messages.appendChild(createRestoreDivider(entry.restorePointId, entry.disabled, handlers));
    } else if (entry.kind === "message") {
      messages.appendChild(createChatMessage(entry));
    } else if (entry.kind === "formula_inference") {
      messages.appendChild(createFormulaInferenceMessage(entry));
    } else if (entry.kind === "diff_review") {
      reviewFooter.appendChild(createDiffReviewDivider(entry.disabled, handlers));
    } else if (entry.kind === "working") {
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
  let message: HTMLElement;

  if (entry.presentation === undefined) {
    message = document.createElement("div");
    const body = document.createElement("div");

    message.className = `chat-message ${entry.source}`;
    body.className = "chat-message-text";
    if (entry.source === "human") {
      body.textContent = entry.text;
    } else if (entry.source === "system") {
      const label = document.createElement("div");
      label.className = "chat-message-source";
      label.textContent = "Assistant";
      message.appendChild(label);
      body.innerHTML = DOMPurify.sanitize(marked.parse(entry.text, { async: false }), {
        USE_PROFILES: { html: true },
      });
    }
    message.appendChild(body);
  } else if (entry.presentation.kind === "edit_decision") {
    message = createEditDecisionMessage(entry.presentation);
  }
  return message;
}

function createFormulaInferenceMessage(entry: ChatFormulaInferenceTranscriptItem): HTMLElement {
  const message = document.createElement("div");
  const label = document.createElement("div");
  const body = document.createElement("div");
  const decision = document.createElement("p");
  const decisionLabel = document.createElement("strong");
  const summary = document.createElement("p");
  const confidence = document.createElement("div");
  const confidenceLabel = document.createElement("strong");
  const bars = document.createElement("span");
  const confidenceValue = document.createElement("span");

  message.className = "chat-message system chat-formula-inference";
  label.className = "chat-message-source";
  label.textContent = "Assistant";
  body.className = "chat-message-text";
  decisionLabel.textContent = "Formula inference: ";
  decision.append(decisionLabel, entry.plan.shouldInferFormulas ? "Required" : "Not required");
  summary.textContent = entry.plan.summary;
  confidence.className = "chat-confidence";
  confidenceLabel.textContent = "Confidence";
  bars.className = "chat-confidence-bars";
  bars.setAttribute("aria-hidden", "true");
  const filledBars = { low: 1, medium: 2, high: 3 }[entry.plan.confidence];
  for (let index = 0; index < 3; index++) {
    const bar = document.createElement("span");
    bar.className = "chat-confidence-bar";
    bar.classList.toggle("filled", index < filledBars);
    bars.appendChild(bar);
  }
  confidenceValue.className = "chat-confidence-value";
  confidenceValue.textContent = entry.plan.confidence;
  confidence.append(confidenceLabel, bars, confidenceValue);
  body.append(decision, summary, confidence);
  message.append(label, body);

  if (entry.plan.regions.length > 0) {
    const title = document.createElement("h3");
    const cards = document.createElement("div");
    title.className = "chat-inference-title";
    title.textContent = "Inference plan";
    cards.className = "chat-inference-cards";
    entry.plan.regions.forEach((region) => {
      const card = document.createElement("div");
      const heading = document.createElement("div");
      const range = document.createElement("code");
      const structure = document.createElement("span");
      const relationship = document.createElement("p");
      const references = document.createElement("div");
      card.className = "chat-inference-card";
      heading.className = "chat-inference-card-heading";
      range.textContent = region.targetRange;
      structure.textContent = region.structure;
      relationship.textContent = region.relationship;
      references.className = "chat-inference-references";
      references.textContent = `sources ${region.sourceRanges.join(", ")} · evidence ${region.evidenceCells.join(", ")}`;
      heading.append(range, structure);
      card.append(heading, relationship, references);
      cards.appendChild(card);
    });
    message.append(title, cards);
  }
  return message;
}

function createEditDecisionMessage(presentation: ChatMessagePresentation): HTMLElement {
  const message = document.createElement("div");
  const indicator = document.createElement("span");
  const body = document.createElement("span");
  const sheetName = document.createElement("span");

  message.className = `chat-edit-decision ${presentation.decision}`;
  indicator.className = "chat-decision-indicator";
  indicator.setAttribute("aria-hidden", "true");
  sheetName.className = "chat-sheet-name";
  sheetName.textContent = presentation.sourceSheetName;
  if (presentation.decision === "accepted") {
    indicator.textContent = "✓";
    body.append("Changes applied to ", sheetName, " · diff sheet removed");
  } else if (presentation.decision === "rejected") {
    indicator.textContent = "✕";
    body.append("Changes rejected · ", sheetName, " unchanged");
  }
  message.append(indicator, body);
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
  label.textContent = "Assistant";
  body.className = "chat-working";
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
  const caption = document.createElement("span");
  const restoreButton = document.createElement("button");

  divider.className = "chat-restore-divider";
  line.className = "chat-restore-line";
  caption.className = "chat-restore-caption";
  caption.textContent = "Before this edit";
  restoreButton.className = "btn btn-secondary btn-compact chat-message-restore";
  restoreButton.type = "button";
  restoreButton.disabled = disabled;
  restoreButton.textContent = "Restore";
  restoreButton.onclick = () => {
    handlers.onRestore(restorePointId);
  };
  divider.appendChild(line);
  divider.appendChild(caption);
  divider.appendChild(restoreButton);
  return divider;
}

function createDiffReviewDivider(disabled: boolean, handlers: ChatWindowDomHandlers): HTMLElement {
  const divider = document.createElement("div");
  const acceptButton = document.createElement("button");
  const rejectButton = document.createElement("button");

  divider.className = "chat-diff-actions";
  acceptButton.className = "btn chat-diff-action";
  acceptButton.type = "button";
  acceptButton.disabled = disabled;
  acceptButton.textContent = "Accept";
  acceptButton.onclick = handlers.onAccept;
  rejectButton.className = "btn btn-secondary chat-diff-action";
  rejectButton.type = "button";
  rejectButton.disabled = disabled;
  rejectButton.textContent = "Reject";
  rejectButton.onclick = handlers.onReject;
  divider.appendChild(acceptButton);
  divider.appendChild(rejectButton);
  return divider;
}
