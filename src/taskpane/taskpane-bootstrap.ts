declare const TASKPANE_IMPLEMENTATION: "current" | "taskpane-fsm";

if (TASKPANE_IMPLEMENTATION === "current") {
  void import("./taskpane");
} else if (TASKPANE_IMPLEMENTATION === "taskpane-fsm") {
  void import("../taskpane-fsm/taskpane");
}
