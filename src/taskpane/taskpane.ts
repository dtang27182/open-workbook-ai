/* global document, Office */

import { TaskpaneComponent } from "./taskpane-component";

Office.onReady(({ host }) => {
  if (host && Office.context.requirements.isSetSupported("TaskPaneApi", "1.1")) {
    Office.extensionLifeCycle.taskpane.setWidth(420);
  }
  const appBody = document.getElementById("app-body")!;

  new TaskpaneComponent(appBody);
  appBody.hidden = false;
});
