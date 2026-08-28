/* global document */

import { Component, ComponentView } from "./component";
import { ChatPage } from "./pages/chat/chat-page";
import { OpenRouterAuthPage } from "./pages/openrouter-auth/openrouter-auth-page";
import { render } from "./render";
import { OpenrouterKeyStore } from "../taskpane/pages/openrouter-auth/openrouter-api-key";
import { acquireOpenRouterApiKey } from "../taskpane/pages/openrouter-auth/openrouter-key-exchange";
import { configureOpenRouterClient } from "../taskpane/pages/chat/chat-state-machine/openrouter-client";

export type TaskpanePageName = "openrouter-auth" | "chat";

export type TaskpaneState = {
  activePage: TaskpanePageName;
};

export type TaskpaneUpdateEvent = { type: "sign_in" } | { type: "sign_out" };

export class TaskpaneComponent implements Component<void, never, never, TaskpaneUpdateEvent> {
  readonly componentId = "taskpane-app";

  private readonly openrouterKeyStore: OpenrouterKeyStore;
  private readonly openRouterAuthPage: OpenRouterAuthPage;
  private readonly chatPage: ChatPage;
  private state: TaskpaneState;

  constructor() {
    this.openrouterKeyStore = new OpenrouterKeyStore();
    configureOpenRouterClient(this.openrouterKeyStore);
    this.openRouterAuthPage = new OpenRouterAuthPage(this.handleSignIn);
    this.chatPage = new ChatPage(this.handleSignOut);
    this.state = {
      activePage: this.openrouterKeyStore.hasKey() ? "chat" : "openrouter-auth",
    };
  }

  genView(): ComponentView {
    const element = document.createElement("div");

    element.id = this.componentId;
    if (this.state.activePage === "openrouter-auth") {
      element.append(this.openRouterAuthPage.genView().element);
    } else if (this.state.activePage === "chat") {
      element.append(this.chatPage.genView().element);
    }

    return {
      componentId: this.componentId,
      element,
    };
  }

  updateState(event: TaskpaneUpdateEvent): void {
    if (event.type === "sign_in") {
      this.openRouterAuthPage.updateState({ type: "sign_in_succeeded" });
      this.state.activePage = "chat";
    } else if (event.type === "sign_out") {
      this.openRouterAuthPage.updateState({ type: "reset" });
      this.state.activePage = "openrouter-auth";
    }
  }

  private handleSignIn = async (): Promise<void> => {
    this.openRouterAuthPage.updateState({ type: "sign_in_started" });
    render(this.openRouterAuthPage.genView());

    try {
      this.openrouterKeyStore.set(await acquireOpenRouterApiKey());
      this.updateState({ type: "sign_in" });
    } catch (error) {
      this.openRouterAuthPage.updateState({
        type: "sign_in_failed",
        message:
          error instanceof Error ? error.message : "Could not sign in to OpenRouter. Try again.",
      });
    } finally {
      render(this.genView());
    }
  };

  private handleSignOut = (): void => {
    this.openrouterKeyStore.clear();
    this.updateState({ type: "sign_out" });
    render(this.genView());
  };
}
