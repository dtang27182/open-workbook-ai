/* global document, HTMLElement */

import chatPageHtml from "./chat-page.html?raw";

const chatPageTemplate = document.createElement("template");

chatPageTemplate.innerHTML = chatPageHtml;

export function cloneChatPageElement<T extends HTMLElement>(selector: string): T {
  return chatPageTemplate.content.querySelector<T>(selector)!.cloneNode(true) as T;
}
