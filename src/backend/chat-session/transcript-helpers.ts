import type { ChatState } from "./chat-session-state";
import type { RestorePoint } from "./restore-manager";
import type { FormulaInferencePlan } from "./llm/preprocess-formula-inference";
import type {
  ChatMessagePresentation,
  ChatMessageTranscriptItem,
  ChatTranscriptEntry,
  ChatWorkingTranscriptItem,
} from "./chat-session";

export function appendMessage(
  transcript: ChatTranscriptEntry[],
  source: "human" | "system",
  text: string,
  workflowId: number,
  presentation?: ChatMessagePresentation
): ChatMessageTranscriptItem {
  const entry: ChatMessageTranscriptItem = {
    kind: "message",
    source,
    text,
    workflowId,
    presentation,
  };
  transcript.push(entry);
  return entry;
}

export function appendFormulaInferencePlan(
  transcript: ChatTranscriptEntry[],
  plan: FormulaInferencePlan,
  workflowId: number
): void {
  transcript.push({ kind: "formula_inference", plan, workflowId });
}

export function upsertTranscriptMessage(
  transcript: ChatTranscriptEntry[],
  entry: ChatMessageTranscriptItem,
  update: Partial<Pick<ChatMessageTranscriptItem, "text">>
): void {
  if (!hasTranscriptMessage(transcript, entry)) {
    transcript.push(entry);
  }
  Object.assign(entry, update);
}

export function insertRestoreTranscriptItem(
  transcript: ChatTranscriptEntry[],
  restorePoint: RestorePoint,
  workflowId: number
): void {
  transcript.splice(restorePoint.chatState.transcript.length, 0, {
    kind: "restore",
    restorePointId: restorePoint.id,
    workflowId,
  });
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

export function updateWorkingTranscriptItem(
  transcript: ChatTranscriptEntry[],
  text: string,
  workflowId: number
): void {
  const entryIndex = transcript.findIndex(
    (entry) => entry.kind === "working" && entry.workflowId === workflowId
  );
  const [entry] = transcript.splice(entryIndex, 1) as ChatWorkingTranscriptItem[];
  entry.text = text;
  transcript.push(entry);
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

export function appendUserDecisionLlmMessage(
  chatState: ChatState,
  text: string,
  workflowId: number
): void {
  chatState.llmConversationMessages = [
    ...chatState.llmConversationMessages,
    { role: "user", text, workflowId },
  ];
}

export function appendAssistantLlmMessage(
  chatState: ChatState,
  text: string,
  workflowId: number
): void {
  chatState.llmConversationMessages = [
    ...chatState.llmConversationMessages,
    { role: "assistant", text, workflowId },
  ];
}
