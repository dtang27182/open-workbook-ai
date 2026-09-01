/* global HTMLElement */

export interface Component<UpdateEvent> {
  getMount(): HTMLElement;
  updateState(event: UpdateEvent): void | Promise<void>;
}
