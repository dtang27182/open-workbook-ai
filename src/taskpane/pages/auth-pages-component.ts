/* global document, HTMLElement */

import { Component } from "../component";
import { AddOpenAIKeyPage } from "./add-openai-key/add-openai-key-page";
import { ChooseProviderPage } from "./choose-provider/choose-provider-page";
import {
  OpenRouterAuthPage,
  type OpenRouterAuthUpdateEvent,
} from "./openrouter-auth/openrouter-auth-page";
import authPagesComponentHtml from "./auth-pages-component.html?raw";

export type AuthPagesUpdateEvent =
  | { type: "choose_openai" }
  | { type: "choose_openrouter" }
  | { type: "reset" }
  | { type: "openrouter_status"; event: OpenRouterAuthUpdateEvent };

export class AuthPagesComponent implements Component<AuthPagesUpdateEvent> {
  private readonly chooseProviderPage: ChooseProviderPage;
  private readonly addOpenAiKeyPage: AddOpenAIKeyPage;
  private readonly openRouterAuthPage: OpenRouterAuthPage;
  private state: { activePage: "picker" | "add-openai-key" | "openrouter-auth" };

  constructor(
    private readonly mount: HTMLElement,
    onSaveOpenAiKey: (apiKey: string) => void,
    onSignInOpenRouter: () => Promise<void>
  ) {
    this.state = { activePage: "picker" };
    const initialDom = this.createInitialDom();
    this.chooseProviderPage = new ChooseProviderPage(
      initialDom.chooseProviderMount,
      this.handleChooseOpenAi,
      this.handleChooseOpenRouter
    );
    this.addOpenAiKeyPage = new AddOpenAIKeyPage(
      initialDom.addOpenAiKeyMount,
      onSaveOpenAiKey,
      this.navToChooseProvider
    );
    this.openRouterAuthPage = new OpenRouterAuthPage(
      initialDom.openRouterAuthMount,
      onSignInOpenRouter,
      this.navToChooseProvider
    );
  }

  getMount(): HTMLElement {
    return this.mount;
  }

  updateState(event: AuthPagesUpdateEvent): void {
    if (event.type === "choose_openai") {
      this.addOpenAiKeyPage.updateState({ type: "reset" });
      this.state.activePage = "add-openai-key";
      this.mount.replaceChildren(this.addOpenAiKeyPage.getMount());
    } else if (event.type === "choose_openrouter") {
      this.openRouterAuthPage.updateState({ type: "reset" });
      this.state.activePage = "openrouter-auth";
      this.mount.replaceChildren(this.openRouterAuthPage.getMount());
    } else if (event.type === "reset") {
      if (this.state.activePage === "add-openai-key") {
        this.addOpenAiKeyPage.updateState({ type: "reset" });
      } else if (this.state.activePage === "openrouter-auth") {
        this.openRouterAuthPage.updateState({ type: "reset" });
      }
      this.state.activePage = "picker";
      this.mount.replaceChildren(this.chooseProviderPage.getMount());
    } else if (event.type === "openrouter_status") {
      this.openRouterAuthPage.updateState(event.event);
    }
  }

  private handleChooseOpenAi = (): void => {
    this.updateState({ type: "choose_openai" });
  };

  private handleChooseOpenRouter = (): void => {
    this.updateState({ type: "choose_openrouter" });
  };

  private navToChooseProvider = (): void => {
    this.updateState({ type: "reset" });
  };

  private createInitialDom(): {
    chooseProviderMount: HTMLElement;
    addOpenAiKeyMount: HTMLElement;
    openRouterAuthMount: HTMLElement;
  } {
    const template = document.createElement("template");
    template.innerHTML = authPagesComponentHtml;
    const chooseProviderMount =
      template.content.querySelector<HTMLElement>("#choose-provider-mount")!;
    const addOpenAiKeyMount = template.content.querySelector<HTMLElement>("#add-openai-key-mount")!;
    const openRouterAuthMount =
      template.content.querySelector<HTMLElement>("#openrouter-auth-mount")!;
    this.mount.replaceChildren(chooseProviderMount);
    return { chooseProviderMount, addOpenAiKeyMount, openRouterAuthMount };
  }
}
