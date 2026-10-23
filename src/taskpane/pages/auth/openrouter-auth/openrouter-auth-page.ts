/* global document, HTMLButtonElement, HTMLElement */

import openrouterAuthPageHtml from "./openrouter-auth-page.html?raw";
import { Component } from "../../../component";
import { AddApiKeyPage } from "../add-api-key/add-api-key-page";

export type OpenRouterAuthState =
  | { phase: "select_sign_in_method" }
  | { phase: "enter_key" }
  | { phase: "signing_in" }
  | { phase: "error"; message: string };

export type OpenRouterAuthUpdateEvent =
  | { type: "sign_in_byok" }
  | { type: "back_to_methods" }
  | { type: "sign_in_3p_auth" }
  | { type: "sign_in_succeeded" }
  | { type: "sign_in_failed"; message: string }
  | { type: "reset" };

export class OpenRouterAuthPage implements Component<OpenRouterAuthUpdateEvent> {
  private state: OpenRouterAuthState = { phase: "select_sign_in_method" };
  private readonly methodMount: HTMLElement;
  private readonly keyPage: AddApiKeyPage;

  constructor(
    private readonly mount: HTMLElement,
    private readonly onSignIn3pAuth: () => Promise<void>,
    onSaveKey: (apiKey: string) => void,
    private readonly onBack: () => void
  ) {
    this.methodMount = document.createElement("div");
    this.methodMount.className = "taskpane-page-mount";
    const keyMount = document.createElement("div");
    keyMount.className = "taskpane-page-mount";
    this.keyPage = new AddApiKeyPage(keyMount, "openrouter", onSaveKey, this.navToMethods);
    this.methodMount.replaceChildren(this.createElement());
    this.mount.replaceChildren(this.methodMount);
    this.mount.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.state.phase === "enter_key") {
        this.updateState({ type: "back_to_methods" });
      } else if (event.key === "Escape" && this.state.phase !== "signing_in") {
        this.onBack();
      }
    });
  }

  getMount(): HTMLElement {
    return this.mount;
  }

  updateState(event: OpenRouterAuthUpdateEvent): void {
    if (event.type === "sign_in_byok") {
      this.keyPage.updateState({ type: "reset" });
      this.state = { phase: "enter_key" };
    } else if (event.type === "back_to_methods") {
      this.keyPage.updateState({ type: "reset" });
      this.state = { phase: "select_sign_in_method" };
    } else if (event.type === "sign_in_3p_auth") {
      this.state = { phase: "signing_in" };
    } else if (event.type === "sign_in_succeeded") {
      this.state = { phase: "select_sign_in_method" };
    } else if (event.type === "sign_in_failed") {
      this.state = { phase: "error", message: event.message };
    } else if (event.type === "reset") {
      this.keyPage.updateState({ type: "reset" });
      this.state = { phase: "select_sign_in_method" };
    }

    if (this.state.phase === "enter_key") {
      this.mount.replaceChildren(this.keyPage.getMount());
    } else {
      this.methodMount.replaceChildren(this.createElement());
      this.mount.replaceChildren(this.methodMount);
    }
  }

  private navToMethods = (): void => {
    this.updateState({ type: "back_to_methods" });
  };

  private createElement(): HTMLElement {
    const element = document.createElement("section");
    element.id = "openrouter-auth-page";
    element.className = "auth-view";
    element.innerHTML = openrouterAuthPageHtml;

    const backButton = element.querySelector<HTMLButtonElement>("#openrouter-all-providers")!;
    backButton.onclick = this.onBack;
    backButton.disabled = this.state.phase === "signing_in";
    const signInButton = element.querySelector<HTMLButtonElement>("#openrouter-sign-in")!;
    const keyButton = element.querySelector<HTMLButtonElement>("#openrouter-use-key")!;
    const status = element.querySelector<HTMLElement>("#openrouter-auth-status")!;
    const error = element.querySelector<HTMLElement>("#openrouter-auth-error")!;

    signInButton.onclick = () => {
      void this.onSignIn3pAuth();
    };
    keyButton.onclick = () => this.updateState({ type: "sign_in_byok" });

    if (this.state.phase === "signing_in") {
      signInButton.disabled = true;
      keyButton.disabled = true;
      status.hidden = false;
      status.textContent = "Complete sign-in in the OpenRouter window.";
      error.hidden = true;
    } else if (this.state.phase === "error") {
      status.hidden = true;
      error.hidden = false;
      error.textContent = this.state.message;
    } else if (this.state.phase === "select_sign_in_method") {
      status.hidden = true;
      error.hidden = true;
    }
    return element;
  }
}
