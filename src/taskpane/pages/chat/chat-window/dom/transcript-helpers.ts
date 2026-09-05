/* global HTMLElement */

import type { RestorePoint } from "../restore-manager";
import { ChatWindowDomHandlers, renderChatTranscript } from "./chat-window-dom";

export type ChatTranscriptSource = "human" | "system";

export type ChatTranscriptItem =
  | {
      kind: "message";
      source: ChatTranscriptSource;
      text: string;
      workflowId: number;
    }
  | {
      kind: "restore";
      restorePointId: number;
      workflowId: number;
      disabled: boolean;
    }
  | {
      kind: "diff_review";
      workflowId: number;
      disabled: boolean;
    }
  | {
      kind: "working";
      source: "system";
      text: string;
      workflowId: number;
    };

export type ChatTranscriptEntry = ChatTranscriptItem;

export type ChatMessageTranscriptItem = Extract<ChatTranscriptItem, { kind: "message" }>;

export type ChatWorkingTranscriptItem = Extract<ChatTranscriptItem, { kind: "working" }>;

export function appendMessageAndRender(
  mount: HTMLElement,
  transcript: ChatTranscriptEntry[],
  handlers: ChatWindowDomHandlers,
  source: "human" | "system",
  text: string,
  workflowId: number
): ChatMessageTranscriptItem {
  const entry: ChatMessageTranscriptItem = {
    kind: "message",
    source,
    text,
    workflowId,
  };
  transcript.push(entry);
  renderChatTranscript(mount, transcript, handlers);
  return entry;
}

export function upsertTranscriptMessageAndRender(
  mount: HTMLElement,
  transcript: ChatTranscriptEntry[],
  handlers: ChatWindowDomHandlers,
  entry: ChatMessageTranscriptItem,
  update: Partial<Pick<ChatMessageTranscriptItem, "text">>
): void {
  if (!hasTranscriptMessage(transcript, entry)) {
    transcript.push(entry);
  }
  Object.assign(entry, update);
  renderChatTranscript(mount, transcript, handlers);
}

export function insertRestoreTranscriptItemAndRender(
  mount: HTMLElement,
  transcript: ChatTranscriptEntry[],
  handlers: ChatWindowDomHandlers,
  restorePoint: RestorePoint,
  workflowId: number
): void {
  transcript.splice(restorePoint.chatState.transcript.length, 0, {
    kind: "restore",
    restorePointId: restorePoint.id,
    workflowId,
    disabled: true,
  });
  renderChatTranscript(mount, transcript, handlers);
}

export function appendDiffReviewTranscriptItemAndRender(
  mount: HTMLElement,
  transcript: ChatTranscriptEntry[],
  handlers: ChatWindowDomHandlers,
  workflowId: number
): void {
  transcript.push({
    kind: "diff_review",
    workflowId,
    disabled: true,
  });
  renderChatTranscript(mount, transcript, handlers);
}

export function removeDiffReviewTranscriptItem(
  transcript: ChatTranscriptEntry[],
  workflowId: number
): void {
  const entryIndex = transcript.findIndex(
    (entry) => entry.kind === "diff_review" && entry.workflowId === workflowId
  );
  transcript.splice(entryIndex, 1);
}

export function appendWorkingTranscriptItem(
  transcript: ChatTranscriptEntry[],
  text: string,
  workflowId: number
): void {
  transcript.push({
    kind: "working",
    source: "system",
    text,
    workflowId,
  });
}

export function removeWorkingTranscriptItem(
  transcript: ChatTranscriptEntry[],
  workflowId: number
): void {
  transcript.splice(
    0,
    transcript.length,
    ...transcript.filter((entry) => entry.kind !== "working" || entry.workflowId !== workflowId)
  );
}

export function updateWorkingTranscriptItemAndRender(
  mount: HTMLElement,
  transcript: ChatTranscriptEntry[],
  handlers: ChatWindowDomHandlers,
  text: string,
  workflowId: number
): void {
  const entryIndex = transcript.findIndex(
    (entry) => entry.kind === "working" && entry.workflowId === workflowId
  );
  const [entry] = transcript.splice(entryIndex, 1) as ChatWorkingTranscriptItem[];
  entry.text = text;
  transcript.push(entry);
  renderChatTranscript(mount, transcript, handlers);
}

export function getWorkflowHumanMessage(
  transcript: readonly ChatTranscriptEntry[],
  workflowId: number
): string {
  return (
    transcript.find(
      (entry) =>
        entry.kind === "message" && entry.source === "human" && entry.workflowId === workflowId
    ) as ChatMessageTranscriptItem
  ).text;
}

function hasTranscriptMessage(
  transcript: readonly ChatTranscriptEntry[],
  entry: ChatMessageTranscriptItem
): boolean {
  return transcript.some(
    (transcriptEntry) =>
      transcriptEntry.kind === "message" &&
      transcriptEntry.workflowId === entry.workflowId &&
      transcriptEntry === entry
  );
}
