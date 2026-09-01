/* global document, HTMLElement */

import { Component } from "./component-v2";
import { LegacyComponentAdapter } from "./legacy-component-adapter";
import { ChatPage } from "./pages/chat/chat-page";
import { OpenRouterAuthPage } from "./pages/openrouter-auth/openrouter-auth-page";
import { OpenrouterKeyStore } from "../taskpane/pages/openrouter-auth/openrouter-api-key";
import { acquireOpenRouterApiKey } from "../taskpane/pages/openrouter-auth/openrouter-key-exchange";
import { configureOpenRouterClient } from "../taskpane/pages/chat/chat-state-machine/openrouter-client";

export type TaskpanePageName = "openrouter-auth" | "chat";

export type TaskpaneState = {
  activePage: TaskpanePageName;
};

export type TaskpaneUpdateEvent = { type: "sign_in" } | { type: "sign_out" };

export class TaskpaneComponent implements Component<TaskpaneUpdateEvent> {
  private readonly mount: HTMLElement;
  private readonly openrouterKeyStore: OpenrouterKeyStore;
  private readonly openRouterAuthPage: OpenRouterAuthPage;
  private readonly chatPage: LegacyComponentAdapter<never>;
  private state: TaskpaneState;

  constructor(mount: HTMLElement) {
    this.mount = mount;
    this.openrouterKeyStore = new OpenrouterKeyStore();
    configureOpenRouterClient(this.openrouterKeyStore);
    this.state = {
      activePage: this.openrouterKeyStore.hasKey() ? "chat" : "openrouter-auth",
    };
    const initialDom = this.createInitialDom();
    this.openRouterAuthPage = new OpenRouterAuthPage(
      initialDom.openRouterAuthMount,
      this.handleSignIn
    );
    this.chatPage = new LegacyComponentAdapter(
      initialDom.chatMount,
      new ChatPage(this.handleSignOut)
    );
  }

  getMount(): HTMLElement {
    return this.mount;
  }

  async updateState(event: TaskpaneUpdateEvent): Promise<void> {
    if (event.type === "sign_in") {
      await this.openRouterAuthPage.updateState({ type: "sign_in_started" });
      try {
        this.openrouterKeyStore.set(await acquireOpenRouterApiKey());
        await this.openRouterAuthPage.updateState({ type: "sign_in_succeeded" });
        this.state.activePage = "chat";
        this.mount.replaceChildren(this.debugHeaderElement, this.chatPage.getMount());
      } catch (error) {
        await this.openRouterAuthPage.updateState({
          type: "sign_in_failed",
          message:
            error instanceof Error ? error.message : "Could not sign in to OpenRouter. Try again.",
        });
      }
    } else if (event.type === "sign_out") {
      this.openrouterKeyStore.clear();
      await this.openRouterAuthPage.updateState({ type: "reset" });
      this.state.activePage = "openrouter-auth";
      this.mount.replaceChildren(this.debugHeaderElement, this.openRouterAuthPage.getMount());
    }
  }

  private handleSignIn = async (): Promise<void> => {
    await this.updateState({ type: "sign_in" });
  };

  private handleSignOut = (): void => {
    void this.updateState({ type: "sign_out" });
  };

  private createInitialDom(): {
    openRouterAuthMount: HTMLElement;
    chatMount: HTMLElement;
  } {
    const debugHeaderElement = document.createElement("header");
    const openRouterAuthMount = document.createElement("div");
    const chatMount = document.createElement("div");

    openRouterAuthMount.style.display = "contents";
    chatMount.style.display = "contents";
    if (this.state.activePage === "openrouter-auth") {
      this.mount.replaceChildren(debugHeaderElement, openRouterAuthMount);
    } else if (this.state.activePage === "chat") {
      this.mount.replaceChildren(debugHeaderElement, chatMount);
    }

    return {
      openRouterAuthMount,
      chatMount,
    };
  }
}
