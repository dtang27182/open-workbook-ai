import { ProviderManager } from "../src/backend/provider-manager";
import { ChatSession, type ChatMessageTranscriptItem, type ModelProvider } from "../src/backend/chat-session";
import { ChatWindow } from "../src/taskpane/pages/chat/chat-window/chat-window";
import type { ExcelApi } from "../src/backend/excel-manager";
import type { ChatState } from "../src/backend/chat-session-state";
import { OpenrouterKeyStore } from "../src/backend/auth/openrouter-api-key";
import { OpenAIKeyStore } from "../src/backend/auth/openai-key-store";

export function createChatWindowForTest(
  excelApi: ExcelApi,
  keyStore: OpenrouterKeyStore,
  openAiKeyStore: OpenAIKeyStore = new OpenAIKeyStore(),
  configuredProvider: ModelProvider = "openrouter"
): ChatWindow {
  const providerManager = new ProviderManager(keyStore, openAiKeyStore);
  if (providerManager.getProvider() === undefined) {
    providerManager.signIn(configuredProvider, "test-key");
  }
  return new ChatWindow(
    document.createElement("div"),
    new ChatSession(providerManager, excelApi)
  );
}

export function getChatStateForTest(chatWindow: ChatWindow): ChatState {
  // Keep test inspection here rather than adding state accessors to the component API.
  return chatWindow["session"]["state"].chatState;
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
