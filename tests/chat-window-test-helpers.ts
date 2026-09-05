import { ChatWindow } from "../src/taskpane/pages/chat/chat-window/chat-window";
import type { ExcelApi } from "../src/taskpane/pages/chat/chat-window/excel-manager";
import type { ChatState } from "../src/taskpane/pages/chat/chat-window/chat-window-state";
import type { ChatMessageTranscriptItem } from "../src/taskpane/pages/chat/chat-window/dom/transcript-helpers";
import { OpenrouterKeyStore } from "../src/taskpane/pages/openrouter-auth/openrouter-api-key";

export function createChatWindowForTest(
  excelApi: ExcelApi,
  keyStore: OpenrouterKeyStore
): ChatWindow {
  return new ChatWindow(document.createElement("div"), keyStore, excelApi);
}

export function getChatStateForTest(chatWindow: ChatWindow): ChatState {
  // Keep test inspection here rather than adding state accessors to the component API.
  return chatWindow["state"].chatState;
}

export async function submitChatMessageForTest(chatWindow: ChatWindow, message: string) {
  await chatWindow.updateState({ type: "submit_message", message });
  const chatState = getChatStateForTest(chatWindow);
  const responseEntry = chatState.transcript
    .filter((entry): entry is ChatMessageTranscriptItem => entry.kind === "message")
    .at(-1)!;
  return {
    message: responseEntry.text,
    didCreateDiff: chatState.pendingEdit !== undefined,
  };
}
