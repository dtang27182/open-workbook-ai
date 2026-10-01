/* global document, HTMLElement */

import { AccountMenu } from "./account-menu/account-menu";
import { Component } from "./component";
import { ChatPage } from "./pages/chat/chat-page";
import { OpenRouterAuthPage } from "./pages/openrouter-auth/openrouter-auth-page";
import { OpenrouterKeyStore } from "./pages/openrouter-auth/openrouter-api-key";
import { acquireOpenRouterApiKey } from "./pages/openrouter-auth/openrouter-key-exchange";
import taskpaneComponentHtml from "./taskpane-component.html?raw";

export type TaskpanePageName = "openrouter-auth" | "chat";

export type TaskpaneState = {
  activePage: TaskpanePageName;
};

export type TaskpaneUpdateEvent = { type: "sign_in" } | { type: "sign_out" };

export class TaskpaneComponent implements Component<TaskpaneUpdateEvent> {
  private readonly mount: HTMLElement;
  private readonly openrouterKeyStore: OpenrouterKeyStore;
  private readonly openRouterAuthPage: OpenRouterAuthPage;
  private readonly chatPage: ChatPage;
  private readonly signedInContainer: HTMLElement;
  private readonly accountMenu: AccountMenu;
  private state: TaskpaneState;

  constructor(mount: HTMLElement) {
    this.mount = mount;
    this.openrouterKeyStore = new OpenrouterKeyStore();
    this.state = {
      activePage: this.openrouterKeyStore.hasKey() ? "chat" : "openrouter-auth",
    };
    const initialDom = this.createInitialDom();
    this.signedInContainer = initialDom.signedInContainer;
    this.accountMenu = new AccountMenu(initialDom.accountMenuMount, this.handleSignOut);
    this.openRouterAuthPage = new OpenRouterAuthPage(
      initialDom.openRouterAuthMount,
      this.handleSignIn
    );
    this.chatPage = new ChatPage(initialDom.chatMount, this.openrouterKeyStore);
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
        this.mount.replaceChildren(this.signedInContainer);
      } catch (error) {
        await this.openRouterAuthPage.updateState({
          type: "sign_in_failed",
          message:
            error instanceof Error ? error.message : "Could not sign in to OpenRouter. Try again.",
        });
      }
    } else if (event.type === "sign_out") {
      this.accountMenu.updateState({ type: "close" });
      this.openrouterKeyStore.clear();
      await this.openRouterAuthPage.updateState({ type: "reset" });
      this.state.activePage = "openrouter-auth";
      this.mount.replaceChildren(this.openRouterAuthPage.getMount());
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
    signedInContainer: HTMLElement;
    accountMenuMount: HTMLElement;
  } {
    const template = document.createElement("template");
    template.innerHTML = taskpaneComponentHtml;
    const openRouterAuthMount =
      template.content.querySelector<HTMLElement>("#openrouter-auth-mount")!;
    const chatMount = template.content.querySelector<HTMLElement>("#chat-mount")!;
    const signedInContainer = template.content.querySelector<HTMLElement>(".signed-in-view")!;
    const accountMenuMount = signedInContainer.querySelector<HTMLElement>("#account-menu-mount")!;

    if (this.state.activePage === "openrouter-auth") {
      this.mount.replaceChildren(openRouterAuthMount);
    } else if (this.state.activePage === "chat") {
      this.mount.replaceChildren(signedInContainer);
    }

    return {
      openRouterAuthMount,
      chatMount,
      signedInContainer,
      accountMenuMount,
    };
  }
}
