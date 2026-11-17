import { ProviderManager } from "../src/taskpane/pages/chat/chat-window/provider-manager";
import { ChatSession } from "../src/taskpane/pages/chat/chat-window/chat-session";
import { ChatWindow } from "../src/taskpane/pages/chat/chat-window/chat-window";
import type { ExcelApi } from "../src/taskpane/pages/chat/chat-window/excel-manager";
import type { ChatState } from "../src/taskpane/pages/chat/chat-window/chat-session-state";
import type { ChatMessageTranscriptItem } from "../src/taskpane/pages/chat/chat-window/transcript";
import { OpenrouterKeyStore } from "../src/taskpane/pages/auth/openrouter-auth/openrouter-api-key";
import { OpenAIKeyStore } from "../src/taskpane/pages/auth/add-openai-key/openai-key-store";
import type { ModelProvider } from "../src/taskpane/pages/chat/chat-window/llm/main-model-options";

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
