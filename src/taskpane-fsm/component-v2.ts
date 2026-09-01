/* global HTMLElement */

export interface Component<UpdateEvent> {
  getMount(): HTMLElement;
  setMount(mount: HTMLElement): void;
  updateState(event: UpdateEvent): void | Promise<void>;
}
