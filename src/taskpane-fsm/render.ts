/* global document, HTMLElement */

import { ComponentView } from "./component";

export function render(view: ComponentView, mount?: HTMLElement): void {
  const currentElement = document.getElementById(view.componentId);

  if (currentElement) {
    currentElement.replaceWith(view.element);
  } else if (mount) {
    mount.replaceChildren(view.element);
  }
}
