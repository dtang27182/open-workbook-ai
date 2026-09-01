/* global document, Office */

import { TaskpaneComponent } from "./taskpane-component";

Office.onReady(() => {
  const appBody = document.getElementById("app-body")!;

  new TaskpaneComponent(appBody);
  appBody.hidden = false;
});
