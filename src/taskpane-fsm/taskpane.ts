/* global document, Office */

import { render } from "./render";
import { TaskpaneComponent } from "./taskpane-component";

Office.onReady(() => {
  const appBody = document.getElementById("app-body")!;
  const taskpane = new TaskpaneComponent();

  render(taskpane.genView(), appBody);
  appBody.hidden = false;
});
