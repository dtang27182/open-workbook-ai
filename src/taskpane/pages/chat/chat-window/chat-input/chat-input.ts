/* global HTMLElement, HTMLFormElement, HTMLTextAreaElement, HTMLButtonElement, ResizeObserver, window */

import { Component } from "../../../../component";
import { cloneChatPageElement } from "../../chat-page-template";

export type ChatInputUpdateEvent =
  | { type: "text_updated" }
  | { type: "panel_resized"; maxHeight: number }
  | { type: "clear" }
  | { type: "set_disabled"; disabled: boolean };

export class ChatInput implements Component<ChatInputUpdateEvent> {
  private readonly mount: HTMLElement;
  private readonly form: HTMLFormElement;
  private readonly input: HTMLTextAreaElement;
  private readonly sendButton: HTMLButtonElement;
  private readonly widthObserver: ResizeObserver;
  private maxHeight = 0;

  constructor(mount: HTMLElement, onSubmit: (message: string) => void) {
    this.mount = mount;
    this.form = cloneChatPageElement<HTMLFormElement>("#chat-form");
    this.input = this.form.querySelector<HTMLTextAreaElement>("#chat-input")!;
    this.sendButton = this.form.querySelector<HTMLButtonElement>("#chat-send")!;
    this.mount.replaceChildren(this.form);

    this.form.onsubmit = (event) => {
      event.preventDefault();
      if (!this.sendButton.disabled) {
        onSubmit(this.input.value);
      }
    };
    this.input.oninput = () => this.updateState({ type: "text_updated" });
    this.input.onkeydown = (event) => {
      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.isComposing
      ) {
        event.preventDefault();
        if (!this.sendButton.disabled) {
          this.form.requestSubmit();
        }
      }
    };

    let previousWidth = 0;
    this.widthObserver = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width !== previousWidth) {
        previousWidth = entry.contentRect.width;
        this.updateState({ type: "panel_resized", maxHeight: this.maxHeight });
      }
    });
    this.widthObserver.observe(this.input);
  }

  getMount(): HTMLElement {
    return this.mount;
  }

  updateState(event: ChatInputUpdateEvent): void {
    if (event.type === "text_updated") {
      this.resizeChatInput();
    } else if (event.type === "panel_resized") {
      this.maxHeight = event.maxHeight;
      this.resizeChatInput();
    } else if (event.type === "clear") {
      this.input.value = "";
      this.input.style.height = "";
      this.input.style.minHeight = "";
      this.input.style.maxHeight = "";
      this.input.style.overflowY = "";
      this.resizeChatInput();
    } else if (event.type === "set_disabled") {
      this.input.disabled = event.disabled;
      this.sendButton.disabled = event.disabled;
    }
  }

  private resizeChatInput(): void {
    if (this.input.isConnected && this.input.clientWidth > 0 && this.maxHeight > 0) {
      const style = window.getComputedStyle(this.input);
      const minHeight = Math.min(
        parseFloat(style.getPropertyValue("--chat-input-min-height")),
        this.maxHeight
      );
      this.input.style.minHeight = `${minHeight}px`;
      this.input.style.maxHeight = `${this.maxHeight}px`;
      this.input.style.height = `${minHeight}px`;
      this.input.style.overflowY = "hidden";
      const contentHeight =
        this.input.value === ""
          ? minHeight
          : this.input.scrollHeight +
            parseFloat(style.borderTopWidth) +
            parseFloat(style.borderBottomWidth);
      this.input.style.height = `${Math.min(Math.max(contentHeight, minHeight), this.maxHeight)}px`;
      this.input.style.overflowY = contentHeight > this.maxHeight ? "auto" : "hidden";
    }
  }
}
