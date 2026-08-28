/* global document, HTMLElement, Office */

import { ChatPage } from "./pages/chat/chat-page";
import { configureOpenRouterClient } from "./pages/chat/chat-state-machine/openrouter-client";
import { OpenrouterKeyStore } from "./pages/openrouter-auth/openrouter-api-key";
import { OpenRouterAuthPage } from "./pages/openrouter-auth/openrouter-auth-page";

export type TaskpanePageName = "openrouter-auth" | "chat";

export interface TaskpanePage {
  readonly name: TaskpanePageName;
  readonly element: HTMLElement;

  initialize(): void;
  activate(): void;
}

export class PageManager {
  private readonly pages: Map<TaskpanePageName, TaskpanePage>;

  constructor(private readonly keyStore: OpenrouterKeyStore) {
    const openRouterAuthPage = new OpenRouterAuthPage(
      document.getElementById("openrouter-auth-page")!,
      this.keyStore,
      this
    );
    const chatPage = new ChatPage(document.getElementById("chat-view")!, this.keyStore, this);

    this.pages = new Map([
      [openRouterAuthPage.name, openRouterAuthPage],
      [chatPage.name, chatPage],
    ]);
  }

  initialize(): void {
    for (const page of this.pages.values()) {
      page.initialize();
    }

    this.showPage(this.keyStore.hasKey() ? "chat" : "openrouter-auth");
  }

  showPage(name: TaskpanePageName): void {
    for (const page of this.pages.values()) {
      page.element.hidden = page.name !== name;
    }

    this.pages.get(name)!.activate();
  }
}

// This is the browser entrypoint for the task pane page declared in manifest.xml.
// It attaches handlers to the task pane UI after Office is ready.
Office.onReady(() => {
  const openrouterKeyStore = new OpenrouterKeyStore();
  configureOpenRouterClient(openrouterKeyStore);
  const pageManager = new PageManager(openrouterKeyStore);

  pageManager.initialize();
  document.getElementById("app-body")!.hidden = false;
});
