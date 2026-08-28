/* global HTMLElement */

export interface Component<ViewInputs, OutputInputs, Outputs, UpdateEvent> {
  readonly componentId: string;

  genOutputs?(input: OutputInputs): Outputs;
  genView(input: ViewInputs): ComponentView;
  updateState(event: UpdateEvent): void | Promise<void>;
}

export type ComponentView = {
  componentId: string;
  element: HTMLElement;
};
