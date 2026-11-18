/* global document, HTMLElement */

import { Component } from "../../component";
import { AddApiKeyPage } from "./add-api-key/add-api-key-page";
import { ChooseProviderPage } from "./choose-provider/choose-provider-page";
import { WelcomePage } from "./welcome/welcome-page";
import {
  OpenRouterAuthPage,
  type OpenRouterAuthUpdateEvent,
} from "./openrouter-auth/openrouter-auth-page";
import authPagesComponentHtml from "./auth-pages-component.html?raw";

export type AuthPagesUpdateEvent =
  | { type: "show_provider_picker" }
  | { type: "choose_openai" }
  | { type: "choose_openrouter" }
  | { type: "back_to_providers" }
  | { type: "reset" }
  | { type: "openrouter_status"; event: OpenRouterAuthUpdateEvent };

export class AuthPagesComponent implements Component<AuthPagesUpdateEvent> {
  private readonly welcomePage: WelcomePage;
  private readonly chooseProviderPage: ChooseProviderPage;
  private readonly addOpenAiKeyPage: AddApiKeyPage;
  private readonly openRouterAuthPage: OpenRouterAuthPage;
  private state: { activePage: "welcome" | "picker" | "add-openai-key" | "openrouter-auth" };

  constructor(
    private readonly mount: HTMLElement,
    onSaveOpenAiKey: (apiKey: string) => void,
    onSignInOpenRouter3pAuth: () => Promise<void>,
    onSaveOpenRouterKey: (apiKey: string) => void
  ) {
    this.state = { activePage: "welcome" };
    const initialDom = this.createInitialDom();
    this.welcomePage = new WelcomePage(initialDom.welcomeMount, this.handleGetStarted);
    this.chooseProviderPage = new ChooseProviderPage(
      initialDom.chooseProviderMount,
      this.handleChooseOpenAi,
      this.handleChooseOpenRouter
    );
    this.addOpenAiKeyPage = new AddApiKeyPage(
      initialDom.addOpenAiKeyMount,
      "openai",
      onSaveOpenAiKey,
      this.navToChooseProvider
    );
    this.openRouterAuthPage = new OpenRouterAuthPage(
      initialDom.openRouterAuthMount,
      onSignInOpenRouter3pAuth,
      onSaveOpenRouterKey,
      this.navToChooseProvider
    );
  }

  getMount(): HTMLElement {
    return this.mount;
  }

  updateState(event: AuthPagesUpdateEvent): void {
    if (event.type === "show_provider_picker") {
      this.state.activePage = "picker";
      this.mount.replaceChildren(this.chooseProviderPage.getMount());
    } else if (event.type === "choose_openai") {
      this.addOpenAiKeyPage.updateState({ type: "reset" });
      this.state.activePage = "add-openai-key";
      this.mount.replaceChildren(this.addOpenAiKeyPage.getMount());
    } else if (event.type === "choose_openrouter") {
      this.openRouterAuthPage.updateState({ type: "reset" });
      this.state.activePage = "openrouter-auth";
      this.mount.replaceChildren(this.openRouterAuthPage.getMount());
    } else if (event.type === "back_to_providers") {
      if (this.state.activePage === "add-openai-key") {
        this.addOpenAiKeyPage.updateState({ type: "reset" });
      } else if (this.state.activePage === "openrouter-auth") {
        this.openRouterAuthPage.updateState({ type: "reset" });
      }
      this.state.activePage = "picker";
      this.mount.replaceChildren(this.chooseProviderPage.getMount());
    } else if (event.type === "reset") {
      if (this.state.activePage === "add-openai-key") {
        this.addOpenAiKeyPage.updateState({ type: "reset" });
      } else if (this.state.activePage === "openrouter-auth") {
        this.openRouterAuthPage.updateState({ type: "reset" });
      }
      this.state.activePage = "welcome";
      this.mount.replaceChildren(this.welcomePage.getMount());
    } else if (event.type === "openrouter_status") {
      this.openRouterAuthPage.updateState(event.event);
    }
  }

  private handleGetStarted = (): void => {
    this.updateState({ type: "show_provider_picker" });
  };

  private handleChooseOpenAi = (): void => {
    this.updateState({ type: "choose_openai" });
  };

  private handleChooseOpenRouter = (): void => {
    this.updateState({ type: "choose_openrouter" });
  };

  private navToChooseProvider = (): void => {
    this.updateState({ type: "back_to_providers" });
  };

  private createInitialDom(): {
    welcomeMount: HTMLElement;
    chooseProviderMount: HTMLElement;
    addOpenAiKeyMount: HTMLElement;
    openRouterAuthMount: HTMLElement;
  } {
    const template = document.createElement("template");
    template.innerHTML = authPagesComponentHtml;
    const welcomeMount = template.content.querySelector<HTMLElement>("#welcome-mount")!;
    const chooseProviderMount =
      template.content.querySelector<HTMLElement>("#choose-provider-mount")!;
    const addOpenAiKeyMount = template.content.querySelector<HTMLElement>("#add-openai-key-mount")!;
    const openRouterAuthMount =
      template.content.querySelector<HTMLElement>("#openrouter-auth-mount")!;
    this.mount.replaceChildren(welcomeMount);
    return { welcomeMount, chooseProviderMount, addOpenAiKeyMount, openRouterAuthMount };
  }
}
