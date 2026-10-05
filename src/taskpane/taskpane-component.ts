/* global document, HTMLElement */

import { AccountMenu, type AccountIdentity } from "./account-menu/account-menu";
import { Component } from "./component";
import { ChatPage } from "./pages/chat/chat-page";
import { AuthPagesComponent } from "./pages/auth-pages-component";
import { OpenAIKeyStore } from "./pages/add-openai-key/openai-key-store";
import { OpenrouterKeyStore } from "./pages/openrouter-auth/openrouter-api-key";
import { acquireOpenRouterApiKey } from "./pages/openrouter-auth/openrouter-key-exchange";
import taskpaneComponentHtml from "./taskpane-component.html?raw";

export type TaskpanePageName = "auth" | "chat";

export type TaskpaneState = {
  activePage: TaskpanePageName;
  configuredProvider: "openai" | "openrouter" | undefined;
};

export type TaskpaneUpdateEvent =
  | { type: "sign_in_openrouter" }
  | { type: "sign_in_openai"; apiKey: string }
  | { type: "sign_out" };

export class TaskpaneComponent implements Component<TaskpaneUpdateEvent> {
  private readonly mount: HTMLElement;
  private readonly openrouterKeyStore: OpenrouterKeyStore;
  private readonly openAiKeyStore: OpenAIKeyStore;
  private readonly authPages: AuthPagesComponent;
  private readonly chatPage: ChatPage;
  private readonly signedInContainer: HTMLElement;
  private readonly accountMenu: AccountMenu;
  private state: TaskpaneState;

  constructor(mount: HTMLElement) {
    this.mount = mount;
    this.openrouterKeyStore = new OpenrouterKeyStore();
    this.openAiKeyStore = new OpenAIKeyStore();
    if (!this.openrouterKeyStore.hasKey() && !this.openAiKeyStore.hasKey()) {
      this.state = { activePage: "auth", configuredProvider: undefined };
    } else if (this.openAiKeyStore.hasKey() && !this.openrouterKeyStore.hasKey()) {
      this.state = { activePage: "chat", configuredProvider: "openai" };
    } else if (this.openrouterKeyStore.hasKey() && !this.openAiKeyStore.hasKey()) {
      this.state = { activePage: "chat", configuredProvider: "openrouter" };
    } else if (this.openrouterKeyStore.hasKey() && this.openAiKeyStore.hasKey()) {
      throw new Error("Both OpenAI and OpenRouter API keys are configured.");
    }
    const initialDom = this.createInitialDom();
    this.signedInContainer = initialDom.signedInContainer;
    let identity: AccountIdentity | undefined;
    if (this.state.configuredProvider === "openai") {
      identity = { provider: "openai", keySuffix: this.openAiKeyStore.get().slice(-4) };
    } else if (this.state.configuredProvider === "openrouter") {
      identity = { provider: "openrouter", keySuffix: this.openrouterKeyStore.get().slice(-4) };
    }
    this.accountMenu = new AccountMenu(initialDom.accountMenuMount, this.handleSignOut, identity);
    this.authPages = new AuthPagesComponent(
      initialDom.authPagesMount,
      this.handleSaveOpenAiKey,
      this.handleSignInOpenRouter
    );
    this.chatPage = new ChatPage(initialDom.chatMount, this.openrouterKeyStore);
  }

  getMount(): HTMLElement {
    return this.mount;
  }

  async updateState(event: TaskpaneUpdateEvent): Promise<void> {
    if (event.type === "sign_in_openrouter") {
      this.authPages.updateState({ type: "openrouter_status", event: { type: "sign_in_started" } });
      try {
        this.openrouterKeyStore.set(await acquireOpenRouterApiKey());
        this.authPages.updateState({
          type: "openrouter_status",
          event: { type: "sign_in_succeeded" },
        });
        this.state.configuredProvider = "openrouter";
        this.accountMenu.updateState({
          type: "set_identity",
          identity: { provider: "openrouter", keySuffix: this.openrouterKeyStore.get().slice(-4) },
        });
        this.state.activePage = "chat";
        this.mount.replaceChildren(this.signedInContainer);
      } catch (error) {
        this.authPages.updateState({
          type: "openrouter_status",
          event: {
            type: "sign_in_failed",
            message:
              error instanceof Error
                ? error.message
                : "Could not sign in to OpenRouter. Try again.",
          },
        });
      }
    } else if (event.type === "sign_in_openai") {
      this.openAiKeyStore.set(event.apiKey);
      this.state.configuredProvider = "openai";
      this.state.activePage = "chat";
      this.accountMenu.updateState({
        type: "set_identity",
        identity: { provider: "openai", keySuffix: event.apiKey.slice(-4) },
      });
      this.authPages.updateState({ type: "reset" });
      this.mount.replaceChildren(this.signedInContainer);
    } else if (event.type === "sign_out") {
      this.accountMenu.updateState({ type: "close" });
      if (this.state.configuredProvider === "openai") {
        this.openAiKeyStore.clear();
      } else if (this.state.configuredProvider === "openrouter") {
        this.openrouterKeyStore.clear();
      }
      this.accountMenu.updateState({ type: "set_identity", identity: undefined });
      this.authPages.updateState({ type: "reset" });
      this.state.configuredProvider = undefined;
      this.state.activePage = "auth";
      this.mount.replaceChildren(this.authPages.getMount());
    }
  }

  private handleSignInOpenRouter = async (): Promise<void> => {
    await this.updateState({ type: "sign_in_openrouter" });
  };

  private handleSaveOpenAiKey = (apiKey: string): void => {
    const trimmedKey = apiKey.trim();
    if (trimmedKey.length > 0) {
      void this.updateState({ type: "sign_in_openai", apiKey: trimmedKey });
    }
  };

  private handleSignOut = (): void => {
    void this.updateState({ type: "sign_out" });
  };

  private createInitialDom(): {
    authPagesMount: HTMLElement;
    chatMount: HTMLElement;
    signedInContainer: HTMLElement;
    accountMenuMount: HTMLElement;
  } {
    const template = document.createElement("template");
    template.innerHTML = taskpaneComponentHtml;
    const authPagesMount = template.content.querySelector<HTMLElement>("#auth-pages-mount")!;
    const chatMount = template.content.querySelector<HTMLElement>("#chat-mount")!;
    const signedInContainer = template.content.querySelector<HTMLElement>(".signed-in-view")!;
    const accountMenuMount = signedInContainer.querySelector<HTMLElement>("#account-menu-mount")!;

    if (this.state.activePage === "auth") {
      this.mount.replaceChildren(authPagesMount);
    } else if (this.state.activePage === "chat") {
      this.mount.replaceChildren(signedInContainer);
    }

    return {
      authPagesMount,
      chatMount,
      signedInContainer,
      accountMenuMount,
    };
  }
}
