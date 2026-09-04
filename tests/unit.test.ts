import assert from "node:assert/strict";
import test from "node:test";

import { ChatStateMachine } from "../src/taskpane/pages/chat/chat-state-machine/chat-state-machine";
import {
  ChatTranscriptEntry,
  LlmConversationHistory,
  OpenRouterRequestBody,
  SheetSnapshot,
  SpreadsheetPromptResult,
} from "../src/taskpane/pages/chat/chat-state-machine/chat-types";
import {
  formatSheetAsMarkdown as formatLegacySheetAsMarkdown,
  formatSheetDataAsMarkdown as formatLegacySheetDataAsMarkdown,
} from "../src/taskpane/pages/chat/chat-state-machine/excel-sheet-utils";
import { configureOpenRouterClient } from "../src/taskpane/pages/chat/chat-state-machine/openrouter-client";
import { OpenrouterKeyStore } from "../src/taskpane/pages/openrouter-auth/openrouter-api-key";
import { ExcelManager } from "../src/taskpane-fsm/pages/chat/chat-window/excel-manager";
import { LLMManager } from "../src/taskpane-fsm/pages/chat/chat-window/llm-manager";
import { RestoreManager } from "../src/taskpane-fsm/pages/chat/chat-window/restore-manager";
import {
  formatSheetAsMarkdown,
  formatSheetDataAsMarkdown,
} from "../src/taskpane-fsm/pages/chat/chat-window/sheet-markdown";
import type { ChatState } from "../src/taskpane-fsm/pages/chat/chat-window/chat-window-types";
import { createExcelTestWorkbook } from "./excel-test-double";

const openrouterKeyStore = new OpenrouterKeyStore();
configureOpenRouterClient(openrouterKeyStore);

const sheetFormulas = [
  ["PRODUCT", "UNITS"],
  ["Aldoxin", 1200],
];

const sheetValues = [
  ["PRODUCT", "UNITS"],
  ["Aldoxin", 1200],
];

test("Model Proposed Updates Are Reflected In The Generated Diff Sheet", async () => {
  const workbook = createWorkbook();
  const stateMachine = createStateMachine(workbook);
  const mocks = installMocks();

  try {
    const result = await submitChatMessageForTest(
      stateMachine,
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

test("Taskpane FSM Sheet Markdown Matches The Existing Formatting", () => {
  const sheet: SheetSnapshot = {
    name: "Sheet1",
    formulas: [["Label|Name", "=A2*2"], ["Line\nBreak", 2]],
    values: [["Label|Name", 4], ["{Value}", 2]],
    rowIndex: 2,
    columnIndex: 1,
    rowCount: 2,
    columnCount: 2,
  };

  assert.equal(formatSheetDataAsMarkdown(sheet, sheet.values), formatLegacySheetDataAsMarkdown(sheet, sheet.values));
  assert.equal(formatSheetAsMarkdown(sheet), formatLegacySheetAsMarkdown(sheet));
});

test("LLM Manager Preserves Main Query Streaming And Replacement History", async () => {
  const manager = new LLMManager();
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
  const manager = new LLMManager();
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
  const manager = new LLMManager();
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

function createStateMachine(workbook: ReturnType<typeof createWorkbook>) {
  return new ChatStateMachine(workbook.excelApi, {
    renderTranscript() {},
    configChatControls() {},
    disableChatInputControls() {},
  });
}

async function submitChatMessageForTest(
  stateMachine: ChatStateMachine,
  message: string
): Promise<SpreadsheetPromptResult> {
  await stateMachine.updateState({ type: "submit_message", message });
  const responseEntry = getLatestMessageEntry(stateMachine);
  return {
    message: responseEntry.text,
    didCreateDiff: stateMachine.getCurrentTurnState() === "pending_edit",
  };
}

function getLatestMessageEntry(stateMachine: ChatStateMachine) {
  return stateMachine
    .buildChatTranscript()
    .filter(
      (entry): entry is Extract<ChatTranscriptEntry, { kind: "message" }> =>
        entry.kind === "message"
    )
    .at(-1)!;
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
              message: "Lowercased the column headers.",
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
