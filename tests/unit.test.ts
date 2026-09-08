import assert from "node:assert/strict";
import { ChatInput } from "../src/taskpane/pages/chat/chat-window/chat-input/chat-input";
import test from "node:test";

import {
  type LlmConversationHistory,
  LLMManager,
} from "../src/taskpane/pages/chat/chat-window/llm/llm-manager";
import {
  type OpenRouterRequestBody,
  OpenRouterClient,
} from "../src/taskpane/pages/chat/chat-window/llm/openrouter-client";
import {
  type SheetSnapshot,
  ExcelManager,
} from "../src/taskpane/pages/chat/chat-window/excel-manager";
import type { ChatState } from "../src/taskpane/pages/chat/chat-window/chat-window-state";
import {
  type ChatWindowDomHandlers,
  configChatControls,
  createInitialDom,
  disableChatControls,
  renderChatTranscript,
  updateReviewWarning,
} from "../src/taskpane/pages/chat/chat-window/dom/chat-window-dom";
import type { ChatTranscriptEntry } from "../src/taskpane/pages/chat/chat-window/dom/transcript-helpers";
import type {
  FormulaInferencePlan,
  PreprocessPromptEvent,
} from "../src/taskpane/pages/chat/chat-window/llm/preprocess-formula-inference";
import { OpenrouterKeyStore } from "../src/taskpane/pages/openrouter-auth/openrouter-api-key";
import { RestoreManager } from "../src/taskpane/pages/chat/chat-window/restore-manager";
import {
  formatSheetAsMarkdown,
  formatSheetDataAsMarkdown,
} from "../src/taskpane/pages/chat/chat-window/llm/sheet-markdown";
import { createExcelTestWorkbook } from "./excel-test-double";
import {
  createChatWindowForTest,
  getChatStateForTest,
  submitChatMessageForTest,
} from "./chat-window-test-helpers";

const openrouterKeyStore = new OpenrouterKeyStore();

const sheetFormulas = [
  ["PRODUCT", "UNITS"],
  ["Aldoxin", 1200],
];

const sheetValues = [
  ["PRODUCT", "UNITS"],
  ["Aldoxin", 1200],
];

test("Chat Input Submits Multiline Text Through Send And Plain Enter", (context) => {
  const messages: string[] = [];
  const chatInput = new ChatInput(document.createElement("div"), (message) =>
    messages.push(message)
  );
  document.body.appendChild(chatInput.getMount());
  context.after(() => chatInput.getMount().remove());
  const input = chatInput.getMount().querySelector<HTMLTextAreaElement>("textarea")!;
  const send = chatInput.getMount().querySelector<HTMLButtonElement>("#chat-send")!;
  input.value = "First line\nSecond line";

  send.click();
  input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
  assert.deepEqual(messages, [input.value, input.value]);

  for (const modifiers of [
    { shiftKey: true },
    { ctrlKey: true },
    { altKey: true },
    { metaKey: true },
    { isComposing: true },
  ]) {
    const event = new window.KeyboardEvent("keydown", {
      key: "Enter",
      cancelable: true,
      ...modifiers,
    });
    input.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
  }
  assert.equal(messages.length, 2);
  assert.equal(input.value, "First line\nSecond line");
});

test("Chat Input Disabling Preserves The Draft And Clearing Reuses The Form", (context) => {
  const messages: string[] = [];
  const chatInput = new ChatInput(document.createElement("div"), (message) =>
    messages.push(message)
  );
  document.body.appendChild(chatInput.getMount());
  context.after(() => chatInput.getMount().remove());
  const form = chatInput.getMount().querySelector<HTMLFormElement>("form")!;
  const input = form.querySelector<HTMLTextAreaElement>("textarea")!;
  const send = form.querySelector<HTMLButtonElement>("#chat-send")!;
  input.value = "Keep this\ndraft";

  chatInput.updateState({ type: "set_disabled", disabled: true });
  assert.equal(input.disabled, true);
  assert.equal(send.disabled, true);
  send.click();
  form.requestSubmit();
  assert.deepEqual(messages, []);
  assert.equal(input.value, "Keep this\ndraft");

  chatInput.updateState({ type: "set_disabled", disabled: false });
  assert.equal(input.disabled, false);
  assert.equal(send.disabled, false);
  send.click();
  assert.deepEqual(messages, ["Keep this\ndraft"]);

  chatInput.updateState({ type: "clear" });
  assert.equal(input.value, "");
  assert.equal(chatInput.getMount().querySelector("form"), form);
});

test("Chat Input Caps And Shrinks Its Height Using Supplied Layout Measurements", () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const chatInput = new ChatInput(mount, () => {});
  const input = mount.querySelector<HTMLTextAreaElement>("textarea")!;
  // jsdom supplies no layout; simulate measurements to check sizing decisions.
  input.style.setProperty("--chat-input-min-height", "34px");
  input.style.border = "1px solid black";
  input.value = "A multiline draft";
  let scrollHeight = 140;
  Object.defineProperty(input, "clientWidth", { value: 200 });
  Object.defineProperty(input, "scrollHeight", { get: () => scrollHeight });

  try {
    chatInput.updateState({ type: "panel_resized", maxHeight: 100 });
    assert.equal(input.style.height, "100px");
    assert.equal(input.style.overflowY, "auto");

    chatInput.updateState({ type: "panel_resized", maxHeight: 200 });
    assert.equal(input.style.height, "142px");
    assert.equal(input.style.overflowY, "hidden");

    scrollHeight = 50;
    input.dispatchEvent(new window.Event("input"));
    assert.equal(input.style.height, "52px");

    // Even when the placeholder wraps, an empty draft stays at one line.
    scrollHeight = 80;
    chatInput.updateState({ type: "clear" });
    assert.equal(input.style.height, "34px");

    chatInput.updateState({ type: "panel_resized", maxHeight: 20 });
    assert.equal(input.style.height, "20px");
    assert.equal(input.style.minHeight, "20px");
  } finally {
    mount.remove();
  }
});

test("Chat Window Retains Its Draft On Clear And Captures Multiline Submission Before Clearing", async () => {
  const workbook = createWorkbook();
  const chatWindow = createChatWindowForTest(workbook.excelApi, openrouterKeyStore);
  const form = chatWindow.getMount().querySelector<HTMLFormElement>("form")!;
  const input = form.querySelector<HTMLTextAreaElement>("textarea")!;
  const send = form.querySelector<HTMLButtonElement>("#chat-send")!;
  const clear = chatWindow.getMount().querySelector<HTMLButtonElement>("#chat-clear")!;
  const reviewButtons = Array.from(chatWindow.getMount().querySelectorAll(".chat-diff-action"));
  const draft = "Make all column headers lower case.\nKeep the remaining cells unchanged.";
  input.value = draft;
  clear.click();
  assert.equal(form.contains(clear), false);
  assert.equal(input.value, draft);
  assert.equal(chatWindow.getMount().querySelector("form"), form);

  const mocks = installMocks();
  try {
    const submission = submitChatMessageForTest(chatWindow, draft);
    assert.equal(input.value, "");
    assert.equal(input.disabled, true);
    assert.equal(send.disabled, true);
    await submission;
    assert.equal(input.disabled, true);
    assert.equal(send.disabled, true);
    assert.equal(clear.disabled, false);
    assert.ok(
      getChatStateForTest(chatWindow).transcript.some(
        (entry) => entry.kind === "message" && entry.source === "human" && entry.text === draft
      )
    );
    assert.ok(
      mocks.requests.some((request) =>
        request.input.some((item) =>
          JSON.stringify(item).includes("Keep the remaining cells unchanged.")
        )
      )
    );

    await chatWindow.updateState({ type: "clear" });
    reviewButtons.forEach((button, index) => {
      assert.equal(chatWindow.getMount().querySelectorAll(".chat-diff-action")[index], button);
    });
    assert.equal(
      chatWindow.getMount().querySelector<HTMLElement>(".chat-review-footer")!.hidden,
      true
    );
    assert.equal(input.disabled, false);
    assert.equal(send.disabled, false);
    assert.equal(chatWindow.getMount().querySelector(".chat-scope")!.textContent, "Active worksheet");
    assert.equal(chatWindow.getMount().querySelector("form"), form);
  } finally {
    await waitForBackgroundWork();
    mocks.restore();
  }
});

test("Model Proposed Updates Are Reflected In The Generated Diff Sheet", async () => {
  const workbook = createWorkbook();
  const chatWindow = createChatWindowForTest(workbook.excelApi, openrouterKeyStore);
  const mocks = installMocks();

  try {
    const result = await submitChatMessageForTest(
      chatWindow,
      "Make all column headers lower case."
    );

    assert.equal(result.didCreateDiff, true);
    assert.deepEqual(workbook.getSheet("Sheet1").formulas, sheetFormulas);
    assert.deepEqual(workbook.getSheet("Diff 1").formulas, [
      ["product", "units"],
      ["Aldoxin", 1200],
    ]);
    assert.equal(workbook.getActiveSheetName(), "Diff 1");
    assert.equal(workbook.getCellFormat("Diff 1", "A1").fillColor, "#00B050");
    assert.equal(workbook.getCellFormat("Diff 1", "B1").fillColor, "#00B050");
  } finally {
    await waitForBackgroundWork();
    mocks.restore();
  }
});

test("Review Footer Replaces The Composer And Preserves Control Bindings And Drafts", (context) => {
  const mount = document.createElement("div");
  const actions: string[] = [];
  const handlers: ChatWindowDomHandlers = {
    onClear: () => actions.push("clear"),
    onSubmit: () => actions.push("submit"),
    onAccept: () => actions.push("accept"),
    onReject: () => actions.push("reject"),
    onRestore: (id) => actions.push(`restore ${id}`),
  };
  const chatInput = createInitialDom(mount, handlers);
  document.body.appendChild(mount);
  context.after(() => mount.remove());
  const form = mount.querySelector("form")!;
  const input = mount.querySelector("textarea")!;
  const chatInputMount = chatInput.getMount();
  const footer = mount.querySelector<HTMLElement>(".chat-review-footer")!;
  const buttons = Array.from(footer.querySelectorAll<HTMLButtonElement>("button"));
  assert.equal(footer.hidden, true);
  const entries: ChatTranscriptEntry[] = [
    { kind: "restore", restorePointId: 7, workflowId: 1, disabled: false },
  ];
  input.value = "Keep this\nunsent draft";
  updateReviewWarning(mount, "Diff <2>");
  assert.equal(footer.hidden, true);
  configChatControls(mount, entries, "pending_edit", handlers, chatInput);

  assert.equal(chatInputMount.hidden, true);
  assert.equal(footer.hidden, false);
  assert.equal(input.disabled, true);
  assert.equal(mount.querySelectorAll(".chat-diff-action").length, 2);
  assert.equal(mount.querySelector("#chat-messages .chat-diff-action"), null);
  assert.equal(form.contains(footer), false);
  assert.equal(mount.querySelector(".chat-scope .chat-sheet-name")!.textContent, "Diff <2>");
  buttons[0].focus();
  renderChatTranscript(mount, [], handlers);
  assert.equal(document.activeElement, buttons[0]);
  assert.equal(footer.hidden, false);
  assert.equal(input.disabled, true);
  assert.equal(mount.querySelector(".chat-scope .chat-sheet-name")!.textContent, "Diff <2>");
  renderChatTranscript(mount, entries, handlers);
  footer.querySelector<HTMLButtonElement>("button")!.click();
  footer.querySelectorAll<HTMLButtonElement>("button")[1].click();
  mount.querySelector<HTMLButtonElement>(".chat-message-restore")!.click();
  assert.deepEqual(actions, ["accept", "reject", "restore 7"]);

  disableChatControls(mount, entries, handlers, chatInput);
  entries.push({ kind: "working", source: "system", text: "Processing...", workflowId: 2 });
  renderChatTranscript(mount, entries, handlers);
  assert.equal(footer.hidden, true);
  assert.equal(chatInputMount.hidden, false);
  assert.equal(input.disabled, true);
  assert.equal(mount.querySelector(".chat-scope .chat-sheet-name")!.textContent, "Diff <2>");
  mount
    .querySelectorAll<HTMLButtonElement>(".chat-message-restore")
    .forEach((button) => {
      assert.equal(button.disabled, true);
      button.click();
    });
  mount.querySelector<HTMLButtonElement>("#chat-clear")!.click();
  assert.deepEqual(actions, ["accept", "reject", "restore 7", "clear"]);

  updateReviewWarning(mount, "Diff <3>");
  for (const state of [
    "pending_edit_preprocessed",
    "pending_edit",
    "awaiting_clarification",
    "errored",
    "answered",
  ] as const) {
    configChatControls(mount, [], state, handlers, chatInput);
    const pending = state === "pending_edit" || state === "pending_edit_preprocessed";
    assert.equal(footer.hidden, !pending);
    assert.equal(chatInputMount.hidden, pending);
    assert.equal(input.disabled, pending);
    assert.equal(mount.querySelector<HTMLButtonElement>("#chat-send")!.disabled, pending);
    assert.equal(
      mount.querySelector(".provider-link-details")!.classList.contains("review-pending"),
      true
    );
    buttons.forEach((button, index) => {
      assert.equal(footer.querySelectorAll("button")[index], button);
    });
    if (pending) {
      mount.querySelector<HTMLButtonElement>("#chat-send")!.click();
      input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
      form.requestSubmit();
      assert.deepEqual(actions, ["accept", "reject", "restore 7", "clear"]);
      assert.equal(mount.querySelector(".chat-sheet-name")!.textContent, "Diff <3>");
    }
  }
  assert.equal(footer.hidden, true);
  assert.equal(footer.querySelectorAll("button").length, 2);
  assert.equal(chatInputMount.hidden, false);
  assert.equal(input.disabled, false);
  assert.equal(input.value, "Keep this\nunsent draft");
  assert.equal(mount.querySelector("form"), form);
  updateReviewWarning(mount, undefined);
  assert.equal(mount.querySelector(".chat-scope")!.textContent, "Active worksheet");
});

test("Inference Cards Render Structured Fields And Confidence Without Interpreting HTML", () => {
  const chatWindow = createChatWindowForTest(createWorkbook().excelApi, openrouterKeyStore);
  const handlers: ChatWindowDomHandlers = {
    onClear() {},
    onSubmit() {},
    onAccept() {},
    onReject() {},
    onRestore() {},
  };
  const plan: FormulaInferencePlan = {
    shouldInferFormulas: true,
    confidence: "high",
    summary: "Repeated <img src=x onerror=alert(1)> calculations",
    regions: [
      {
        targetRange: "B2:B3",
        structure: "Monthly <b>outputs</b>",
        relationship: "Multiply inputs <script>alert(1)</script>",
        sourceRanges: ["A2:A3", "C2:C3"],
        evidenceCells: ["B2", "B3"],
      },
    ],
  };
  for (const confidence of ["low", "medium", "high"] as const) {
    renderChatTranscript(
      chatWindow.getMount(),
      [{ kind: "formula_inference", workflowId: 1, plan: { ...plan, confidence } }],
      handlers
    );
    const message = chatWindow.getMount().querySelector(".chat-formula-inference")!;
    assert.equal(
      message.querySelectorAll(".chat-confidence-bar.filled").length,
      { low: 1, medium: 2, high: 3 }[confidence]
    );
    assert.equal(message.querySelector(".chat-confidence-value")!.textContent, confidence);
    assert.ok(message.textContent.includes(plan.summary));
    const card = message.querySelector(".chat-inference-card")!;
    for (const text of [
      plan.regions[0].targetRange,
      plan.regions[0].structure,
      plan.regions[0].relationship,
      ...plan.regions[0].sourceRanges,
      ...plan.regions[0].evidenceCells,
    ]) {
      assert.ok(card.textContent.includes(text));
    }
    assert.equal(card.closest(".chat-message-text"), null);
    assert.equal(message.querySelector("img, script, b"), null);
  }
  renderChatTranscript(
    chatWindow.getMount(),
    [
      {
        kind: "formula_inference",
        workflowId: 1,
        plan: { ...plan, shouldInferFormulas: false, regions: [] },
      },
      {
        kind: "message",
        source: "system",
        workflowId: 1,
        text: "Accepted changes. **Confidence:** high\n\n<script>alert(1)</script>",
      },
      { kind: "message", source: "human", workflowId: 1, text: "<b>My draft</b>\nSecond line" },
    ],
    handlers
  );
  assert.equal(chatWindow.getMount().querySelectorAll(".chat-inference-card").length, 0);
  assert.ok(chatWindow.getMount().textContent.includes("Not required"));
  assert.equal(chatWindow.getMount().querySelector(".chat-edit-decision, script"), null);
  assert.equal(chatWindow.getMount().querySelector(".human .chat-message-source"), null);
  assert.equal(
    chatWindow.getMount().querySelector(".human .chat-message-text")!.textContent,
    "<b>My draft</b>\nSecond line"
  );
});

test("Review Decisions Keep Worksheet Effects And The Existing Restore Boundary", async () => {
  for (const decision of ["accept", "reject"] as const) {
    const workbook = createWorkbook();
    const chatWindow = createChatWindowForTest(workbook.excelApi, openrouterKeyStore);
    const mocks = installMocks((request) => {
      if ((request.text as { format: { type: string } }).format.type === "text") {
        return createOutputTextResponse("Updated analysis.");
      } else {
        return getOpenRouterResponseBody(request);
      }
    });
    try {
      await submitChatMessageForTest(chatWindow, "Lowercase the headers.");
      const footer = chatWindow.getMount().querySelector<HTMLElement>(".chat-review-footer")!;
      const buttons = Array.from(footer.querySelectorAll("button"));
      footer.querySelectorAll<HTMLButtonElement>("button")[decision === "accept" ? 0 : 1].click();
      assert.equal(
        chatWindow.getMount().querySelector<HTMLTextAreaElement>("textarea")!.disabled,
        true
      );
      await waitForBackgroundWork();
      assert.equal(footer.hidden, true);
      assert.equal(workbook.getActiveSheetName(), "Sheet1");
      assert.throws(() => workbook.getSheet("Diff 1"));
      assert.equal(chatWindow.getMount().querySelectorAll(".chat-edit-decision").length, 1);
      assert.equal(
        chatWindow.getMount().querySelector(".chat-edit-decision .chat-sheet-name")!.textContent,
        "Sheet1"
      );
      const chatState = getChatStateForTest(chatWindow);
      assert.ok(
        chatState.llmConversationMessages.some(
          (message) =>
            "text" in message &&
            message.text === (decision === "accept" ? "Accepted changes." : "Rejected changes.")
        )
      );
      assert.ok(chatState.llmConversationMessages.every((message) => !("presentation" in message)));
      if (decision === "accept") {
        assert.deepEqual(workbook.getSheet("Sheet1").formulas[0], ["product", "units"]);
        assert.equal(mocks.requests.length, 3);
        const restoreIndex = chatState.transcript.findIndex((entry) => entry.kind === "restore");
        // With no preprocessing edits, the main-query checkpoint already contains the request.
        assert.equal(restoreIndex, 2);
        assert.ok(
          chatWindow
            .getMount()
            .querySelector(".chat-restore-divider")!
            .previousElementSibling!.classList.contains("human")
        );
        await submitChatMessageForTest(chatWindow, "Another edit.");
        assert.equal(footer.hidden, false);
        chatWindow.getMount().querySelector<HTMLButtonElement>(".chat-message-restore")!.click();
        await waitForBackgroundWork();
        assert.equal(footer.hidden, true);
        assert.deepEqual(workbook.getSheet("Sheet1").formulas, sheetFormulas);
        assert.equal(chatWindow.getMount().querySelector(".chat-edit-decision"), null);
        assert.equal(getChatStateForTest(chatWindow).transcript.length, 2);
        assert.equal(chatWindow.getMount().querySelector(".chat-scope")!.textContent, "Active worksheet");
        buttons.forEach((button, index) => {
          assert.equal(footer.querySelectorAll("button")[index], button);
        });
      } else if (decision === "reject") {
        assert.deepEqual(workbook.getSheet("Sheet1").formulas, sheetFormulas);
        assert.equal(mocks.requests.length, 2);
        assert.equal(chatWindow.getMount().querySelector(".chat-message-restore"), null);
      }
    } finally {
      await waitForBackgroundWork();
      mocks.restore();
    }
  }
});

test("Preprocessing Keeps One Structured Plan Through Decisions And Later Restore", async (context) => {
  const plan: FormulaInferencePlan = {
    shouldInferFormulas: true,
    confidence: "medium",
    summary: "Infer the repeated total.",
    regions: [
      {
        targetRange: "B2",
        structure: "Total",
        relationship: "Double the input",
        sourceRanges: ["B1"],
        evidenceCells: ["B2"],
      },
    ],
  };
  context.mock.method(
    LLMManager.prototype,
    "runPreprocessPrompt",
    async function* (): AsyncGenerator<PreprocessPromptEvent> {
      yield { type: "detection_complete", plan };
      yield { type: "region_complete", region: plan.regions[0], cellEditCount: 1 };
      yield { type: "complete", cellEdits: [{ address: "B2", newFormula: "=600*2" }] };
    }
  );
  for (const decision of ["accept_pending_diff", "reject_pending_diff"] as const) {
    const workbook = createWorkbook();
    const chatWindow = createChatWindowForTest(workbook.excelApi, openrouterKeyStore);
    const mocks = installMocks((request) => {
      assert.equal(chatWindow.getMount().querySelector(".chat-scope")!.textContent, "Active worksheet");
      assert.equal(chatWindow.getMount().querySelector("textarea")!.disabled, true);
      assert.equal(
        chatWindow.getMount().querySelector<HTMLElement>(".chat-review-footer")!.hidden,
        true
      );
      return getOpenRouterResponseBody(request);
    });
    try {
      await submitChatMessageForTest(chatWindow, "Lowercase the headers.");
      assert.equal(getChatStateForTest(chatWindow).workflowState, "pending_edit_preprocessed");
      assert.equal(chatWindow.getMount().querySelectorAll(".chat-formula-inference").length, 1);
      assert.equal(mocks.requests.length, 0);
      const buttons = Array.from(chatWindow.getMount().querySelectorAll(".chat-diff-action"));
      const firstDiffName = getChatStateForTest(chatWindow).pendingEdit!.diffSheetName;
      assert.equal(
        chatWindow.getMount().querySelector(".chat-scope .chat-sheet-name")!.textContent,
        firstDiffName
      );
      const review = chatWindow.updateState({ type: decision });
      assert.equal(
        chatWindow.getMount().querySelector<HTMLElement>(".chat-review-footer")!.hidden,
        true
      );
      await review;
      const chatState = getChatStateForTest(chatWindow);
      assert.equal(chatState.workflowState, "pending_edit");
      assert.equal(mocks.requests.length, 1);
      assert.equal(chatWindow.getMount().querySelectorAll(".chat-diff-action").length, 2);
      buttons.forEach((button, index) => {
        assert.equal(chatWindow.getMount().querySelectorAll(".chat-diff-action")[index], button);
      });
      assert.notEqual(chatState.pendingEdit!.diffSheetName, firstDiffName);
      assert.equal(
        chatWindow.getMount().querySelector(".chat-scope .chat-sheet-name")!.textContent,
        chatState.pendingEdit!.diffSheetName
      );
      assert.ok(chatState.transcript.every((entry) => entry.kind !== ("diff_review" as string)));
      const inference = chatState.transcript.filter((entry) => entry.kind === "formula_inference");
      assert.equal(inference.length, 1);
      assert.deepEqual(inference[0].plan, plan);
      const pendingWorkflowId = chatState.pendingEdit!.workflowId;
      assert.equal(inference[0].workflowId, pendingWorkflowId);
      await chatWindow.updateState({ type: "reject_pending_diff" });
      assert.equal(chatWindow.getMount().querySelectorAll(".chat-edit-decision").length, 2);
      assert.equal(
        chatWindow.getMount().querySelector<HTMLElement>(".chat-review-footer")!.hidden,
        true
      );
      if (decision === "accept_pending_diff") {
        assert.ok(
          chatWindow
            .getMount()
            .querySelector(".chat-restore-divider")!
            .nextElementSibling!.classList.contains("human")
        );
        chatWindow.getMount().querySelector<HTMLButtonElement>(".chat-message-restore")!.click();
        await waitForBackgroundWork();
        assert.deepEqual(workbook.getSheet("Sheet1").formulas, sheetFormulas);
        assert.equal(chatWindow.getMount().querySelector(".chat-formula-inference"), null);
      } else if (decision === "reject_pending_diff") {
        assert.equal(chatWindow.getMount().querySelector(".chat-message-restore"), null);
        assert.deepEqual(workbook.getSheet("Sheet1").formulas, sheetFormulas);
      }
    } finally {
      await waitForBackgroundWork();
      mocks.restore();
    }
  }
});

test(
  "Accepted Review Keeps Controls Disabled Until Analysis Completes",
  { timeout: 5000 },
  async (context) => {
    const chatWindow = createChatWindowForTest(createWorkbook().excelApi, openrouterKeyStore);
    const mocks = installMocks();
    let finishAnalysis!: () => void;
    const analysis = new Promise<string>((resolve) => {
      finishAnalysis = () => resolve("Updated analysis.");
    });
    let signalAnalysisStarted!: () => void;
    const analysisStarted = new Promise<void>((resolve) => {
      signalAnalysisStarted = resolve;
    });
    context.mock.method(LLMManager.prototype, "runUpdateAnalysisPrompt", () => {
      signalAnalysisStarted();
      return analysis;
    });
    let acceptance: Promise<void> | undefined;
    try {
      await submitChatMessageForTest(chatWindow, "Lowercase the headers.");
      const mount = chatWindow.getMount();
      const footer = mount.querySelector<HTMLElement>(".chat-review-footer")!;
      const buttons = Array.from(footer.querySelectorAll<HTMLButtonElement>("button"));
      acceptance = chatWindow.updateState({ type: "accept_pending_diff" });
      assert.equal(footer.hidden, true);
      await analysisStarted;

      // Acceptance has appended a confirmation, a Restore divider, and working text.
      // Although the workflow state is answered, analysis still owns the action.
      assert.equal(getChatStateForTest(chatWindow).workflowState, "answered");
      assert.ok(mount.querySelector(".chat-edit-decision.accepted"));
      assert.equal(mount.querySelector(".chat-scope")!.textContent, "Active worksheet");
      assert.ok(mount.querySelector(".chat-working"));
      assert.equal(footer.hidden, true);
      assert.equal(mount.querySelector<HTMLElement>(".chat-input-mount")!.hidden, false);
      const input = mount.querySelector("textarea")!;
      input.value = "Keep this draft";
      assert.equal(input.disabled, true);
      const requestCount = mocks.requests.length;
      const transcript = structuredClone(getChatStateForTest(chatWindow).transcript);
      mount
        .querySelectorAll<HTMLButtonElement>(".chat-message-restore, #chat-send")
        .forEach((button) => {
          assert.equal(button.disabled, true);
          button.click();
        });
      input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
      mount.querySelector("form")!.requestSubmit();
      assert.equal(mocks.requests.length, requestCount);
      assert.deepEqual(getChatStateForTest(chatWindow).transcript, transcript);
      assert.equal(input.value, "Keep this draft");

      finishAnalysis();
      await acceptance;
      assert.equal(input.disabled, false);
      assert.equal(mount.querySelector<HTMLButtonElement>("#chat-send")!.disabled, false);
      assert.equal(mount.querySelector<HTMLButtonElement>(".chat-message-restore")!.disabled, false);
      buttons.forEach((button, index) => {
        assert.equal(footer.querySelectorAll("button")[index], button);
      });
      assert.equal(footer.hidden, true);
    } finally {
      finishAnalysis();
      await acceptance;
      mocks.restore();
    }
  }
);

test("Review Warning Remains Until Worksheet Rejection Completes", async (context) => {
  const chatWindow = createChatWindowForTest(createWorkbook().excelApi, openrouterKeyStore);
  const mocks = installMocks();
  let finishDeletion!: () => void;
  const deletion = new Promise<void>((resolve) => {
    finishDeletion = resolve;
  });
  const deleteDiffSheet = ExcelManager.prototype.deleteDiffSheet;
  context.mock.method(ExcelManager.prototype, "deleteDiffSheet", async function (
    this: ExcelManager,
    sourceSheetName: string,
    diffSheetName: string
  ) {
    await deletion;
    await deleteDiffSheet.call(this, sourceSheetName, diffSheetName);
  });
  let rejection: Promise<void> | undefined;
  try {
    await submitChatMessageForTest(chatWindow, "Lowercase the headers.");
    const mount = chatWindow.getMount();
    const diffName = getChatStateForTest(chatWindow).pendingEdit!.diffSheetName;
    rejection = chatWindow.updateState({ type: "reject_pending_diff" });
    await waitForBackgroundWork();
    assert.equal(getChatStateForTest(chatWindow).workflowState, "pending_edit");
    assert.equal(mount.querySelector<HTMLElement>(".chat-review-footer")!.hidden, true);
    assert.equal(mount.querySelector(".chat-scope .chat-sheet-name")!.textContent, diffName);
    assert.equal(mount.querySelector(".provider-link-details")!.classList.contains("review-pending"), true);
    finishDeletion();
    await rejection;
    assert.equal(getChatStateForTest(chatWindow).workflowState, "answered");
    assert.equal(mount.querySelector(".chat-scope")!.textContent, "Active worksheet");
    assert.equal(mount.querySelector(".provider-link-details")!.classList.contains("review-pending"), false);
  } finally {
    finishDeletion();
    await rejection;
    mocks.restore();
  }
});

test("Failed Review Removes Footer Even When Pending Edit Data Remains", async (context) => {
  const chatWindow = createChatWindowForTest(createWorkbook().excelApi, openrouterKeyStore);
  const mocks = installMocks();
  context.mock.method(ExcelManager.prototype, "deleteDiffSheet", async () => {
    throw new Error("Worksheet unavailable");
  });
  try {
    await submitChatMessageForTest(chatWindow, "Lowercase the headers.");
    await chatWindow.updateState({ type: "reject_pending_diff" });
    assert.equal(getChatStateForTest(chatWindow).workflowState, "errored");
    assert.ok(getChatStateForTest(chatWindow).pendingEdit);
    assert.equal(
      chatWindow.getMount().querySelector<HTMLElement>(".chat-review-footer")!.hidden,
      true
    );
    assert.equal(chatWindow.getMount().querySelector<HTMLElement>(".chat-input-mount")!.hidden, false);
    assert.equal(
      chatWindow.getMount().querySelector(".chat-scope")!.textContent,
      "Active worksheet"
    );
    assert.equal(chatWindow.getMount().querySelector(".chat-edit-decision"), null);
    assert.equal(chatWindow.getMount().querySelector("textarea")!.disabled, false);
  } finally {
    await waitForBackgroundWork();
    mocks.restore();
  }
});

test("Restore Manager Copies Inputs When Creating Restore Point Snapshots", () => {
  const restoreManager = new RestoreManager();
  const chatState = createRestoreManagerChatState();
  const sheet = createRestoreManagerSheet("Sheet1");

  restoreManager.createPotentialRestorePoint(1, chatState, sheet);
  chatState.transcript.push({
    kind: "message",
    source: "system",
    text: "Later message",
    workflowId: 1,
  });
  chatState.llmConversationMessages = [
    ...chatState.llmConversationMessages,
    { role: "assistant", text: "Later response", workflowId: 1 },
  ];
  chatState.nextWorkflowId++;
  sheet.formulas[0][0] = "Changed";

  const promotedRestorePoint = restoreManager.promotePotentialRestorePoint(1);
  assert.equal(promotedRestorePoint.chatState.transcript.length, 1);
  assert.deepEqual(promotedRestorePoint.chatState.llmConversationMessages, [
    { role: "user", text: "Initial request", workflowId: 1 },
  ]);
  assert.equal(promotedRestorePoint.chatState.nextWorkflowId, 1);
  assert.deepEqual(promotedRestorePoint.sheet.formulas, [["Original"]]);

  const storedRestorePoint = restoreManager.getRestorePoint(promotedRestorePoint.id);
  assert.strictEqual(storedRestorePoint, promotedRestorePoint);
});

test("Excel Manager Creates Numbered Sheets And Resets Their Counters", async () => {
  const workbook = createWorkbook();
  const controller = new ExcelManager(workbook.excelApi);
  const originalSheet = await controller.readActiveSheet();

  assert.deepEqual(await controller.readSheet("Sheet1"), originalSheet);

  const firstDiff = await controller.createNextDiffSheet(originalSheet, [
    { address: "C3", newFormula: "=1" },
  ]);
  const secondDiff = await controller.createNextDiffSheet(originalSheet, []);
  const firstScenario = await controller.createNextScenarioSheet(originalSheet, []);
  const secondScenario = await controller.createNextScenarioSheet(originalSheet, []);

  assert.equal(firstDiff.sheetName, "Diff 1");
  assert.equal(secondDiff.sheetName, "Diff 2");
  assert.equal(firstScenario, "Scenario 1");
  assert.equal(secondScenario, "Scenario 2");
  assert.deepEqual(firstDiff.updatedSheet.formulas, [
    ["PRODUCT", "UNITS", null],
    ["Aldoxin", 1200, null],
    [null, null, "=1"],
  ]);
  assert.deepEqual(firstDiff.updatedSheet.values, [
    ["PRODUCT", "UNITS", null],
    ["Aldoxin", 1200, null],
    [null, null, null],
  ]);

  await controller.deleteDiffSheet("Sheet1", "Diff 1");
  await controller.deleteDiffSheet("Sheet1", "Diff 2");
  await controller.deleteDiffSheet("Sheet1", "Scenario 1");
  await controller.deleteDiffSheet("Sheet1", "Scenario 2");
  controller.resetSheetNumbers();

  assert.equal((await controller.createNextDiffSheet(originalSheet, [])).sheetName, "Diff 1");
  assert.equal(await controller.createNextScenarioSheet(originalSheet, []), "Scenario 1");
});

test("Excel Manager Writes, Applies, And Deletes Sheet Changes", async () => {
  const workbook = createWorkbook();
  const controller = new ExcelManager(workbook.excelApi);
  const originalSheet = await controller.readActiveSheet();

  await controller.applyCellEditsToSheet(originalSheet, [
    { address: "B2", newFormula: 2400 },
  ]);
  assert.equal(workbook.getSheet("Sheet1").formulas[1][1], 2400);
  assert.equal(workbook.getCellFormat("Sheet1", "B2").fillColor, "#00B050");

  await controller.writeSheetFormulas(originalSheet);
  assert.deepEqual(workbook.getSheet("Sheet1").formulas, sheetFormulas);

  const diff = await controller.createNextDiffSheet(originalSheet, []);
  await controller.deleteDiffSheet("Sheet1", diff.sheetName);
  assert.equal(workbook.hasSheet(diff.sheetName), false);
  assert.equal(workbook.getActiveSheetName(), "Sheet1");
});

test("Excel Manager Retargets Escaped Sheet References", () => {
  const controller = new ExcelManager();
  const retargetedSheet = controller.retargetFormulaSheetReferences(
    {
      ...createRestoreManagerSheet("O'Brien"),
      formulas: [["='O''Brien'!A1", "Label"]],
      values: [[1, "Label"]],
      columnCount: 2,
    },
    "D'Angelo"
  );

  assert.equal(retargetedSheet.name, "D'Angelo");
  assert.deepEqual(retargetedSheet.formulas, [["='D''Angelo'!A1", "Label"]]);
});

test("Restore Manager Finalizes And Clears Restore History Without Resetting IDs", () => {
  const restoreManager = new RestoreManager();
  const chatState = createRestoreManagerChatState();

  restoreManager.createPotentialRestorePoint(1, chatState, createRestoreManagerSheet("Sheet1"));
  const firstRestorePoint = restoreManager.promotePotentialRestorePoint(1);
  restoreManager.createPotentialRestorePoint(2, chatState, createRestoreManagerSheet("Sheet2"));
  const secondRestorePoint = restoreManager.promotePotentialRestorePoint(2);

  restoreManager.finalizeRestore(firstRestorePoint.id);
  assert.equal(restoreManager.getRestorePoint(firstRestorePoint.id), undefined);
  assert.equal(restoreManager.getRestorePoint(secondRestorePoint.id), undefined);

  restoreManager.createPotentialRestorePoint(3, chatState, createRestoreManagerSheet("Sheet3"));
  const thirdRestorePoint = restoreManager.promotePotentialRestorePoint(3);
  restoreManager.clearAllRestorePoints();
  assert.equal(restoreManager.getRestorePoint(thirdRestorePoint.id), undefined);

  restoreManager.createPotentialRestorePoint(4, chatState, createRestoreManagerSheet("Sheet4"));
  const fourthRestorePoint = restoreManager.promotePotentialRestorePoint(4);
  assert.equal(fourthRestorePoint.id, thirdRestorePoint.id + 1);
});

test("Sheet Markdown Preserves Values Formulas And Escaping", () => {
  const sheet: SheetSnapshot = {
    name: "Sheet1",
    formulas: [["Label|Name", "=A2*2"], ["Line\nBreak", 2]],
    values: [["Label|Name", 4], ["{Value}", 2]],
    rowIndex: 2,
    columnIndex: 1,
    rowCount: 2,
    columnCount: 2,
  };

  assert.equal(
    formatSheetDataAsMarkdown(sheet, sheet.values),
    [
      "| | B | C |",
      "| --- | --- | --- |",
      "| **3** | Label\\|Name | 4 |",
      "| **4** | \\u007BValue\\u007D | 2 |",
    ].join("\n")
  );
  assert.equal(
    formatSheetAsMarkdown(sheet),
    [
      "| | B | C |",
      "| --- | --- | --- |",
      "| **3** | Label\\|Name | =A2*2 [value: 4] |",
      "| **4** | \\u007BValue\\u007D | 2 |",
    ].join("\n")
  );
});

test("LLM Manager Preserves Main Query Streaming And Replacement History", async () => {
  const manager = new LLMManager(openrouterKeyStore);
  const mocks = installMocks(() =>
    createOutputTextResponse({
      shouldEditSheet: true,
      createNewSheet: false,
      answer: null,
      editExplanation: "Updated the requested cells.",
      cellEdits: [{ address: "B2", newFormula: 2400 }],
      comparisonRanges: [],
    })
  );
  const history: LlmConversationHistory = [
    {
      role: "user",
      text: "Earlier request",
      workflowId: 1,
      sheetContext: {
        range: { rowIndex: 0, columnIndex: 0, rowCount: 1, columnCount: 1 },
        sheetMarkdown: "Earlier context",
      },
    },
  ];

  try {
    const events = [];
    for await (const event of manager.runMainQueryPrompt(
      "Update the units.",
      2,
      createRestoreManagerSheet("Sheet1"),
      history
    )) {
      events.push(event);
    }

    assert.deepEqual(
      events.map((event) => event.type),
      ["partial_response", "creating_proposed_change", "complete"]
    );
    const completion = events.at(-1)!;
    assert.equal(completion.type, "complete");
    if (completion.type === "complete") {
      assert.deepEqual(completion.updatedLlmConversationMessages[0], {
        role: "user",
        text: "Earlier request",
        workflowId: 1,
      });
      assert.equal(completion.updatedLlmConversationMessages.length, 3);
      assert.deepEqual(completion.updatedLlmConversationMessages.at(-1), {
        role: "assistant",
        text: "Updated the requested cells.",
        workflowId: 2,
      });
    }
  } finally {
    mocks.restore();
  }
});

test("LLM Manager Continues A Pending Clarification", async () => {
  const manager = new LLMManager(openrouterKeyStore);
  const history: LlmConversationHistory = [
    { role: "user", text: "Update the forecast.", workflowId: 3 },
    {
      type: "function_call",
      id: "tool-1",
      callId: "call-1",
      name: "ask_clarifying_question",
      arguments: JSON.stringify({ question: "Which period?" }),
      workflowId: 3,
    },
  ];
  const mocks = installMocks(() =>
    createOutputTextResponse({
      shouldEditSheet: false,
      createNewSheet: false,
      answer: "The clarification was applied.",
      editExplanation: null,
      cellEdits: [],
      comparisonRanges: [],
    })
  );

  try {
    assert.strictEqual(manager.getPendingClarificationToolCall(history), history[1]);
    const events = [];
    for await (const event of manager.runClarificationResponsePrompt("FY2028", 3, history)) {
      events.push(event);
    }

    const functionCallOutput = mocks.requests[0].input.find(
      (item) => "type" in item && item.type === "function_call_output"
    );
    assert.deepEqual(functionCallOutput, {
      type: "function_call_output",
      call_id: "call-1",
      output: "FY2028",
    });
    const completion = events.at(-1)!;
    assert.equal(completion.type, "complete");
    if (completion.type === "complete") {
      assert.deepEqual(completion.updatedLlmConversationMessages.at(-2), {
        type: "function_call_output",
        callId: "call-1",
        output: "FY2028",
        workflowId: 3,
      });
      assert.deepEqual(completion.updatedLlmConversationMessages.at(-1), {
        role: "assistant",
        text: "The clarification was applied.",
        workflowId: 3,
      });
    }
  } finally {
    mocks.restore();
  }
});

test("LLM Manager Preserves Preprocess Scenario And Update Analysis Operations", async () => {
  const manager = new LLMManager(openrouterKeyStore);
  const mocks = installMocks((requestBody) => {
    const format = requestBody.text as { format: { type: string; name?: string } };
    if (format.format.name === "formula_inference_plan") {
      return createNoEditResponse();
    } else if (format.format.name === "scenario_comparison_response") {
      return createOutputTextResponse({
        cellEdits: [{ address: "A4", newFormula: "Comparison" }],
        analysis: "Scenario analysis.",
      });
    } else {
      return createOutputTextResponse("Accepted update analysis.");
    }
  });
  const originalSheet = createRestoreManagerSheet("Baseline");
  const scenarioSheet = createRestoreManagerSheet("Scenario 1");

  try {
    const preprocessEvents = [];
    for await (const event of manager.runPreprocessPrompt(originalSheet)) {
      preprocessEvents.push(event);
    }
    assert.deepEqual(preprocessEvents, [{ type: "complete", cellEdits: [] }]);

    const comparison = await manager.runScenarioComparisonPrompt(
      "Compare the scenario.",
      originalSheet,
      scenarioSheet,
      [{ purpose: "Compare outputs", address: "A1:A1" }],
      []
    );
    assert.deepEqual(comparison, {
      cellEdits: [{ address: "A4", newFormula: "Comparison" }],
      analysis: "Scenario analysis.",
    });
    await assert.rejects(
      manager.runScenarioComparisonPrompt(
        "Compare the scenario.",
        originalSheet,
        scenarioSheet,
        [],
        []
      ),
      /at least one comparison range/
    );

    assert.equal(
      await manager.runUpdateAnalysisPrompt(
        "Update the forecast.",
        originalSheet,
        scenarioSheet,
        []
      ),
      "Accepted update analysis."
    );
  } finally {
    mocks.restore();
  }
});

test("OpenRouter Clients Share Key Changes Only Through Their Supplied Stores", async (t) => {
  const firstStore = new OpenrouterKeyStore();
  const secondStore = new OpenrouterKeyStore();
  firstStore.set("first-key");
  secondStore.set("second-key");
  const firstClient = new OpenRouterClient(firstStore);
  const sharedClient = new OpenRouterClient(firstStore);
  const secondClient = new OpenRouterClient(secondStore);
  const authorizations: string[] = [];
  t.mock.method(globalThis, "fetch", async (_input, init) => {
    authorizations.push(new Headers(init.headers).get("Authorization")!);
    return createOpenRouterResponse(
      createOutputTextResponse("Response"),
      JSON.parse(init.body).stream === true
    );
  });
  const request = createClientRequest();

  await firstClient.request(request);
  await secondClient.request(request);
  firstStore.set("replacement-key");
  await sharedClient.request(request);
  await collectEvents(firstClient.requestStreamEvents(request));
  await secondClient.request(request);
  assert.deepEqual(authorizations, [
    "Bearer first-key",
    "Bearer second-key",
    "Bearer replacement-key",
    "Bearer replacement-key",
    "Bearer second-key",
  ]);

  firstStore.clear();
  await assert.rejects(firstClient.request(request), /Sign in with OpenRouter/);
  await assert.rejects(
    collectEvents(sharedClient.requestStreamEvents(request)),
    /Sign in with OpenRouter/
  );
  assert.equal(authorizations.length, 5);
  assert.equal(secondStore.get(), "second-key");
});

test("OpenRouter Request Errors Preserve Key Invalidation Behavior", async (t) => {
  const affectedStore = new OpenrouterKeyStore();
  const otherStore = new OpenrouterKeyStore();
  otherStore.set("other-key");
  const client = new OpenRouterClient(affectedStore);
  let status = 401;
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify({ error: { message: "Provider error." } }), { status })
  );

  for (const streaming of [false, true]) {
    for (status of [401, 500]) {
      affectedStore.set("affected-key");
      await assert.rejects(
        streaming
          ? collectEvents(client.requestStreamEvents(createClientRequest()))
          : client.request(createClientRequest()),
        { message: status === 401 ? "OpenRouter rejected the API key." : "Provider error." }
      );
      assert.equal(affectedStore.hasKey(), status !== 401);
      assert.equal(otherStore.get(), "other-key");
    }
  }
});

test("OpenRouter Streaming Assembles Text And Clarification Across Chunks", async (t) => {
  const keyStore = new OpenrouterKeyStore();
  keyStore.set("stream-key");
  const client = new OpenRouterClient(keyStore);
  const toolCall = {
    type: "function_call",
    id: "question-item",
    call_id: "question-call",
    name: "ask_clarifying_question",
    arguments: "",
  };
  const argumentsText = JSON.stringify({ question: "Which period?" });
  const streamEvents = [
    { type: "response.output_item.added", item: toolCall },
    { type: "response.function_call_arguments.done", arguments: argumentsText },
    { type: "response.output_text.delta", delta: "Hello " },
    { type: "response.output_text.delta", delta: "world" },
  ];
  t.mock.method(globalThis, "fetch", async (_input, init) => {
    assert.equal(JSON.parse(init.body).stream, true);
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer stream-key");
    return new Response(
      new ReadableStream({
        start(controller) {
          for (const event of streamEvents) {
            const bytes = new TextEncoder().encode("data: " + JSON.stringify(event) + "\n\n");
            controller.enqueue(bytes.slice(0, 9));
            controller.enqueue(bytes.slice(9));
          }
          controller.close();
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } }
    );
  });

  assert.deepEqual(await collectEvents(client.requestStreamEvents(createClientRequest())), [
    { type: "output_text", outputText: "Hello " },
    { type: "output_text", outputText: "Hello world" },
    {
      type: "complete",
      response: {
        output: [
          { content: [{ type: "output_text", text: "Hello world" }] },
          { ...toolCall, arguments: argumentsText },
        ],
      },
    },
  ]);
});

function createClientRequest(): OpenRouterRequestBody {
  return {
    model: "test-model",
    instructions: "Test request",
    input: [{ role: "user", content: "Hello" }],
    max_output_tokens: 100,
  };
}

async function collectEvents<T>(events: AsyncGenerator<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const event of events) {
    result.push(event);
  }
  return result;
}

function createRestoreManagerChatState(): ChatState {
  return {
    transcript: [
      {
        kind: "message",
        source: "system",
        text: "Initial message",
        workflowId: 0,
      },
    ],
    llmConversationMessages: [{ role: "user", text: "Initial request", workflowId: 1 }],
    workflowState: "answered",
    preprocessedSheetNames: [],
    nextWorkflowId: 1,
  };
}

function createRestoreManagerSheet(name: string): SheetSnapshot {
  return {
    name,
    values: [["Original"]],
    formulas: [["Original"]],
    rowIndex: 0,
    columnIndex: 0,
    rowCount: 1,
    columnCount: 1,
  };
}

function createWorkbook() {
  return createExcelTestWorkbook({
    activeSheetName: "Sheet1",
    sheets: {
      Sheet1: {
        formulas: sheetFormulas,
        values: sheetValues,
      },
    },
  });
}

function installMocks(
  getResponseBody: (requestBody: OpenRouterRequestBody) => object = getOpenRouterResponseBody
) {
  const previousFetch = globalThis.fetch;
  const previousLog = console.log;
  const previousDebug = console.debug;
  const requests: OpenRouterRequestBody[] = [];

  openrouterKeyStore.set("unit-test-key");
  globalThis.fetch = async (_input, init) => {
    let requestBody: OpenRouterRequestBody | undefined;
    if (init?.body && typeof init.body === "string") {
      requestBody = JSON.parse(init.body);
    }
    requests.push(requestBody!);
    return createOpenRouterResponse(
      getResponseBody(requestBody!),
      requestBody!.stream === true
    );
  };
  console.log = () => {};
  console.debug = () => {};

  return {
    requests,
    restore() {
      openrouterKeyStore.clear();
      globalThis.fetch = previousFetch;
      console.log = previousLog;
      console.debug = previousDebug;
    },
  };
}

function createOutputTextResponse(content: object | string) {
  return {
    output: [
      {
        content: [
          {
            type: "output_text",
            text: typeof content === "string" ? content : JSON.stringify(content),
          },
        ],
      },
    ],
  };
}

function getOpenRouterResponseBody(requestBody: OpenRouterRequestBody) {
  if (isPreprocessRequest(requestBody)) {
    return createNoEditResponse();
  }

  return createSpreadsheetEditResponse();
}

function isPreprocessRequest(requestBody: OpenRouterRequestBody) {
  const input = JSON.parse(requestBody.input.at(-1)!.content);
  return input.userRequest === "Preprocess worksheet formulas.";
}

async function waitForBackgroundWork() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function createOpenRouterResponse(body: object, isStreaming: boolean) {
  let response: Response;
  if (isStreaming) {
    const outputText = (
      body as { output: Array<{ content: Array<{ type: string; text: string }> }> }
    ).output[0].content.find((content) => content.type === "output_text")!.text;
    const streamEvent = JSON.stringify({
      type: "response.output_text.delta",
      delta: outputText,
    });
    response = new Response(`data: ${streamEvent}\n\n`, {
      headers: { "Content-Type": "text/event-stream" },
    });
  } else {
    response = {
      ok: true,
      json: async () => body,
    } as Response;
  }

  return response;
}

function createNoEditResponse() {
  return {
    output: [
      {
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              shouldInferFormulas: false,
              confidence: "high",
              summary: "No formula inference needed.",
              regions: [],
            }),
          },
        ],
      },
    ],
  };
}

function createSpreadsheetEditResponse() {
  return {
    output: [
      {
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              answer: null,
              editExplanation: "Lowercased the column headers.",
              createNewSheet: false,
              comparisonRanges: [],
              shouldEditSheet: true,
              cellEdits: [
                { address: "A1", newFormula: "product" },
                { address: "B1", newFormula: "units" },
              ],
            }),
          },
        ],
      },
    ],
  };
}
