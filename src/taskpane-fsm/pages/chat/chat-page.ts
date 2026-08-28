/* global document */

import { Component, ComponentView } from "../../component";
import { ChatHeader } from "./chat-header";
import { ChatTranscript } from "./chat-transcript";

export class ChatPage implements Component<void, never, never, never> {
  readonly componentId = "chat-page";

  private readonly chatHeader: ChatHeader;
  private readonly chatTranscript: ChatTranscript;

  constructor(onSignOut: () => void) {
    this.chatHeader = new ChatHeader(onSignOut);
    this.chatTranscript = new ChatTranscript();
  }

  genView(): ComponentView {
    const element = document.createElement("section");

    element.id = this.componentId;
    element.className = "chat-view";
    element.append(this.chatHeader.genView().element, this.chatTranscript.genView().element);

    return {
      componentId: this.componentId,
      element,
    };
  }

  updateState(): void {}
}
