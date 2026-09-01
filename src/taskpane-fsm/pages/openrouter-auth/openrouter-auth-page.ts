/* global document, HTMLButtonElement, HTMLElement */

import openrouterAuthPageHtml from "../../../taskpane/pages/openrouter-auth/openrouter-auth-page.html?raw";
import { Component } from "../../component-v2";

export type OpenRouterAuthState =
  | { phase: "select_provider" }
  | { phase: "signing_in" }
  | { phase: "error"; message: string };

export type OpenRouterAuthUpdateEvent =
  | { type: "sign_in_started" }
  | { type: "sign_in_succeeded" }
  | { type: "sign_in_failed"; message: string }
  | { type: "reset" };

export class OpenRouterAuthPage implements Component<OpenRouterAuthUpdateEvent> {
  private state: OpenRouterAuthState = { phase: "select_provider" };

  constructor(
    private readonly mount: HTMLElement,
    private readonly onSignIn: () => Promise<void>
  ) {
    this.mount.replaceChildren(this.createElement());
  }

  getMount(): HTMLElement {
    return this.mount;
  }

  updateState(event: OpenRouterAuthUpdateEvent): void {
    if (event.type === "sign_in_started") {
      this.state = { phase: "signing_in" };
    } else if (event.type === "sign_in_succeeded") {
      this.state = { phase: "select_provider" };
    } else if (event.type === "sign_in_failed") {
      this.state = { phase: "error", message: event.message };
    } else if (event.type === "reset") {
      this.state = { phase: "select_provider" };
    }

    this.mount.replaceChildren(this.createElement());
  }

  private createElement(): HTMLElement {
    const element = document.createElement("section");

    element.id = "openrouter-auth-page";
    element.className = "auth-view";
    element.innerHTML = openrouterAuthPageHtml;

    const signInButton = element.querySelector<HTMLButtonElement>("#openrouter-sign-in")!;
    const status = element.querySelector<HTMLElement>("#openrouter-auth-status")!;
    const error = element.querySelector<HTMLElement>("#openrouter-auth-error")!;

    signInButton.onclick = () => {
      void this.onSignIn();
    };

    if (this.state.phase === "select_provider") {
      signInButton.disabled = false;
      signInButton.textContent = "Sign in with OpenRouter";
      signInButton.autofocus = true;
      status.hidden = true;
      status.textContent = "";
      error.hidden = true;
      error.textContent = "";
    } else if (this.state.phase === "signing_in") {
      signInButton.disabled = true;
      signInButton.textContent = "Signing in…";
      signInButton.autofocus = false;
      status.hidden = false;
      status.textContent = "Complete sign-in in the OpenRouter window.";
      error.hidden = true;
      error.textContent = "";
    } else if (this.state.phase === "error") {
      signInButton.disabled = false;
      signInButton.textContent = "Sign in with OpenRouter";
      signInButton.autofocus = true;
      status.hidden = true;
      status.textContent = "";
      error.hidden = false;
      error.textContent = this.state.message;
    }

    return element;
  }
}
