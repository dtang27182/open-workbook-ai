/* global HTMLElement */

import { Component as LegacyComponent } from "./component";
import { Component } from "./component-v2";

export class LegacyComponentAdapter<UpdateEvent> implements Component<UpdateEvent> {
  private readonly mount: HTMLElement;

  constructor(
    mount: HTMLElement,
    private readonly component: LegacyComponent<void, never, never, UpdateEvent>
  ) {
    this.mount = mount;
    this.mount.replaceChildren(this.component.genView().element);
  }

  getMount(): HTMLElement {
    return this.mount;
  }

  async updateState(event: UpdateEvent): Promise<void> {
    await this.component.updateState(event);
    this.mount.replaceChildren(this.component.genView().element);
  }
}
