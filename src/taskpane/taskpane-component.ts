/* global document, HTMLElement */

import { AccountMenu } from "./account-menu/account-menu";
import { Component } from "./component";
import { ChatSession } from "./pages/chat/chat-window/chat-session";
import { ChatPage } from "./pages/chat/chat-page";
import { AuthPagesComponent } from "./pages/auth/auth-pages-component";
import { acquireOpenRouterApiKey } from "./pages/auth/openrouter-auth/openrouter-key-exchange";
import taskpaneComponentHtml from "./taskpane-component.html?raw";

export type TaskpanePageName = "auth" | "chat";

export type TaskpaneState = {
  activePage: TaskpanePageName;
  configuredProvider: "openai" | "openrouter" | undefined;
};

export type TaskpaneUpdateEvent =
  | { type: "sign_in_3p_auth" }
  | { type: "save_openrouter_key"; apiKey: string }
  | { type: "sign_in_openai"; apiKey: string }
  | { type: "sign_out" };

export class TaskpaneComponent implements Component<TaskpaneUpdateEvent> {
  private readonly mount: HTMLElement;
  private readonly authPages: AuthPagesComponent;
  private readonly chatPage: ChatPage;
  private readonly chatSession: ChatSession;
  private readonly signedInContainer: HTMLElement;
  private readonly accountMenu: AccountMenu;
  private state: TaskpaneState;

  constructor(mount: HTMLElement) {
    this.mount = mount;
    this.chatSession = new ChatSession();
    const providerStatus = this.chatSession.getProviderStatus();
    this.state = {
      activePage: providerStatus === undefined ? "auth" : "chat",
      configuredProvider: providerStatus?.provider,
    };
    const initialDom = this.createInitialDom();
    this.signedInContainer = initialDom.signedInContainer;
    this.accountMenu = new AccountMenu(
      initialDom.accountMenuMount,
      this.handleSignOut,
      providerStatus
    );
    this.authPages = new AuthPagesComponent(
      initialDom.authPagesMount,
      this.handleSaveOpenAiKey,
      this.handleSignInOpenRouter3pAuth,
      this.handleSaveOpenRouterKey
    );
    this.chatPage = new ChatPage(initialDom.chatMount, this.chatSession);
  }

  getMount(): HTMLElement {
    return this.mount;
  }

  async updateState(event: TaskpaneUpdateEvent): Promise<void> {
    if (event.type === "sign_in_3p_auth") {
      this.authPages.updateState({ type: "openrouter_status", event: { type: "sign_in_3p_auth" } });
      try {
        const apiKey = await acquireOpenRouterApiKey();
        this.authPages.updateState({
          type: "openrouter_status",
          event: { type: "sign_in_succeeded" },
        });
        this.completeOpenRouterSignIn(apiKey);
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
    } else if (event.type === "save_openrouter_key") {
      this.completeOpenRouterSignIn(event.apiKey);
    } else if (event.type === "sign_in_openai") {
      this.chatSession.signIn("openai", event.apiKey);
      this.state.configuredProvider = "openai";
      this.state.activePage = "chat";
      this.accountMenu.updateState({
        type: "set_identity",
        identity: { provider: "openai", keySuffix: event.apiKey.slice(-4) },
      });
      this.chatPage.updateState({ type: "provider_changed" });
      this.authPages.updateState({ type: "reset" });
      this.mount.replaceChildren(this.signedInContainer);
    } else if (event.type === "sign_out") {
      this.accountMenu.updateState({ type: "close" });
      this.chatSession.signOut();
      this.accountMenu.updateState({ type: "set_identity", identity: undefined });
      this.authPages.updateState({ type: "reset" });
      this.state.configuredProvider = undefined;
      this.chatPage.updateState({ type: "provider_changed" });
      this.state.activePage = "auth";
      this.mount.replaceChildren(this.authPages.getMount());
    }
  }

  private handleSignInOpenRouter3pAuth = async (): Promise<void> => {
    await this.updateState({ type: "sign_in_3p_auth" });
  };

  private handleSaveOpenRouterKey = (apiKey: string): void => {
    const trimmedKey = apiKey.trim();
    if (trimmedKey.length > 0) {
      void this.updateState({ type: "save_openrouter_key", apiKey: trimmedKey });
    }
  };

  private completeOpenRouterSignIn(apiKey: string): void {
    this.chatSession.signIn("openrouter", apiKey);
    this.state.configuredProvider = "openrouter";
    this.state.activePage = "chat";
    this.accountMenu.updateState({
      type: "set_identity",
      identity: { provider: "openrouter", keySuffix: apiKey.slice(-4) },
    });
    this.chatPage.updateState({ type: "provider_changed" });
    this.authPages.updateState({ type: "reset" });
    this.mount.replaceChildren(this.signedInContainer);
  }

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
