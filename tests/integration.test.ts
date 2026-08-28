import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import test, { after, before, TestContext } from "node:test";

import { ChatStateMachine } from "../src/taskpane/pages/chat/chat-state-machine/chat-state-machine";
import { ChatTranscriptEntry, SpreadsheetPromptResult } from "../src/taskpane/pages/chat/chat-state-machine/chat-types";
import { configureOpenRouterClient } from "../src/taskpane/pages/chat/chat-state-machine/openrouter-client";
import { OpenrouterKeyStore } from "../src/taskpane/pages/openrouter-auth/openrouter-api-key";
import { createExcelTestWorkbook } from "./excel-test-double";

const apiKey = process.env.OPEN_ROUTER_TOKEN || "";
const openrouterKeyStore = new OpenrouterKeyStore();
configureOpenRouterClient(openrouterKeyStore);

const alreadyPreprocessedSheetFormulas = [
  ["PRODUCT", "UNITS", "PRICE", "GROWTH", "REVENUE"],
  ["Aldoxin", 1200000, 420, 0.08, "=B2*C2/1000000"],
  ["Beronex", 800000, 315, 0.12, "=B3*C3/1000000"],
];

const alreadyPreprocessedSheetValues = [
  ["PRODUCT", "UNITS", "PRICE", "GROWTH", "REVENUE"],
  ["Aldoxin", 1200000, 420, 0.08, 504],
  ["Beronex", 800000, 315, 0.12, 252],
];

const nonPreprocessedSheetFormulas = [
  ["PRODUCT", "UNITS", "PRICE", "REVENUE"],
  ["Aldoxin", 1200000, 420, 504],
  ["Beronex", 800000, 315, 252],
  ["Cyprox", 500000, 200, 100],
];

const nonPreprocessedSheetValues = [
  ["PRODUCT", "UNITS", "PRICE", "REVENUE"],
  ["Aldoxin", 1200000, 420, 504],
  ["Beronex", 800000, 315, 252],
  ["Cyprox", 500000, 200, 100],
];

type OpenRouterRequest = { input: Array<{ role: string; content: string }> };
type ExcelTestWorkbook = ReturnType<typeof createExcelTestWorkbook>;
type TestHarness = {
  stateMachine: ChatStateMachine;
  workbook: ExcelTestWorkbook;
  openRouterRequests: OpenRouterRequest[];
  logLines: string[];
};
type LiveTestCase = { name: string; fn: (context: TestContext) => Promise<void> };

const testHarnessStorage = new AsyncLocalStorage<TestHarness>();
const liveTestCases: LiveTestCase[] = [];
let realFetch: typeof globalThis.fetch;
let realConsoleLog: typeof console.log;
let realConsoleDebug: typeof console.debug;

before(() => {
  installOpenRouterApiKey();
  installFetchRecorder();
  installConsoleRecorder();
});

after(() => {
  restoreConsoleRecorder();
  restoreFetchRecorder();
  restoreOpenRouterApiKey();
});

liveTest("Analysis Request Does Not Edit The Sheet", createTestHarness, async (harness) => {
  const result = await submitChatMessageForTest(
    harness.stateMachine,
    "Summarize what this spreadsheet contains."
  );

  assert.ok(result.message.length > 0);
  assert.deepEqual(harness.workbook.getSheet("Sheet1").formulas, alreadyPreprocessedSheetFormulas);
});

liveTest(
  "Accepted Sheet Edit Request Updates The Intended Cells",
  createTestHarness,
  async (harness) => {
    const result = await submitChatMessageForTest(
      harness.stateMachine,
      "Make all column headers lower case."
    );

    const expectedSheetFormulas = cloneSheet(alreadyPreprocessedSheetFormulas);
    expectedSheetFormulas[0] = ["product", "units", "price", "growth", "revenue"];

    assert.ok(result.message.length > 0);
    assert.deepEqual(
      harness.workbook.getSheet("Sheet1").formulas,
      alreadyPreprocessedSheetFormulas
    );
    await harness.stateMachine.updateState({ type: "accept_pending_diff" });
    assert.deepEqual(harness.workbook.getSheet("Sheet1").formulas, expectedSheetFormulas);
  }
);

liveTest(
  "Rejected Sheet Edit Request Does Not Edit The Sheet",
  createTestHarness,
  async (harness) => {
    const result = await submitChatMessageForTest(
      harness.stateMachine,
      "Make all column headers lower case."
    );

    assert.ok(result.message.length > 0);
    assert.equal(result.didCreateDiff, true);
    assert.deepEqual(
      harness.workbook.getSheet("Sheet1").formulas,
      alreadyPreprocessedSheetFormulas
    );

    await harness.stateMachine.updateState({ type: "reject_pending_diff" });

    assert.deepEqual(
      harness.workbook.getSheet("Sheet1").formulas,
      alreadyPreprocessedSheetFormulas
    );
    assert.notEqual(harness.stateMachine.getCurrentTurnState(), "pending_edit");
    assert.equal(
      harness.stateMachine.buildChatTranscript().some((entry) => entry.kind === "restore"),
      false
    );
  }
);

liveTest("Follow-Up Requests Use Conversation Context", createTestHarness, async (harness) => {
  const firstPrompt = "Remember this label: alpha-test-forecast.";
  const secondPrompt = "What label did I ask you to remember?";

  const firstResult = await submitChatMessageForTest(harness.stateMachine, firstPrompt);
  const secondResult = await submitChatMessageForTest(harness.stateMachine, secondPrompt);
  const secondRequest = harness.openRouterRequests[harness.openRouterRequests.length - 1];
  const expectedHistory = [
    { role: "user", content: firstPrompt },
    { role: "assistant", content: firstResult.message },
  ];
  const priorConversationMessages = secondRequest.input.slice(0, 2);

  assert.ok(secondResult.message.toLowerCase().includes("alpha-test-forecast"));
  assert.deepEqual(priorConversationMessages, expectedHistory);
});

liveTest(
  "Restore Reverts An Accepted Sheet Edit And Later Chat Context",
  createTestHarness,
  async (harness) => {
    const label = "restore-context-check";
    const editResult = await submitChatMessageForTest(
      harness.stateMachine,
      "Make all column headers lower case."
    );
    await harness.stateMachine.updateState({ type: "accept_pending_diff" });
    const restoreEntry = findRestoreEntry(harness.stateMachine);

    assert.equal(editResult.didCreateDiff, true);
    assert.ok(restoreEntry);

    await submitChatMessageForTest(harness.stateMachine, `Remember this label: ${label}.`);
    await harness.stateMachine.updateState({
      type: "restore_to_point",
      restorePointId: restoreEntry.restorePointId,
    });

    assert.deepEqual(
      harness.workbook.getSheet("Sheet1").formulas,
      alreadyPreprocessedSheetFormulas
    );
    assert.equal(
      getMessageEntries(harness.stateMachine).some((entry) => entry.text.includes(label)),
      false
    );

    const result = await submitChatMessageForTest(
      harness.stateMachine,
      "What label did I ask you to remember? Answer only with the label if you know it, otherwise answer UNKNOWN."
    );
    assert.ok(!result.message.toLowerCase().includes(label));
  }
);

liveTest(
  "Analysis Request Can Trigger Accepted Preprocessing Edit",
  createNonPreprocessedTestHarness,
  async (harness) => {
    const result = await submitChatMessageForTest(
      harness.stateMachine,
      "Summarize what this spreadsheet contains."
    );

    assert.equal(result.didCreateDiff, true);
    assert.equal(harness.stateMachine.getCurrentTurnState(), "pending_edit_preprocessed");
    assert.deepEqual(harness.workbook.getSheet("Sheet1").formulas, nonPreprocessedSheetFormulas);

    await harness.stateMachine.updateState({ type: "accept_pending_diff" });

    assert.equal(isFormula(harness.workbook.getSheet("Sheet1").formulas[1][3]), true);
    assert.equal(harness.stateMachine.getCurrentTurnState(), "answered");
    // The live response text can vary, so only verify that the original query produced a final answer.
    assert.ok(getLatestMessageEntry(harness.stateMachine).text.length > 0);
  }
);

liveTest(
  "Restore Reverts An Accepted Preprocessing Edit",
  createNonPreprocessedTestHarness,
  async (harness) => {
    const result = await submitChatMessageForTest(
      harness.stateMachine,
      "Summarize what this spreadsheet contains."
    );
    await harness.stateMachine.updateState({ type: "accept_pending_diff" });
    const restoreEntry = findRestoreEntry(harness.stateMachine);

    assert.equal(result.didCreateDiff, true);
    assert.ok(restoreEntry);
    assert.equal(isFormula(harness.workbook.getSheet("Sheet1").formulas[1][3]), true);

    await harness.stateMachine.updateState({
      type: "restore_to_point",
      restorePointId: restoreEntry.restorePointId,
    });

    assert.deepEqual(harness.workbook.getSheet("Sheet1").formulas, nonPreprocessedSheetFormulas);
    assert.equal(harness.stateMachine.buildChatTranscript().length, 0);
  }
);

liveTest(
  "Accepted Preprocessing Does Not Repeat For The Same Sheet",
  createNonPreprocessedTestHarness,
  async (harness) => {
    await submitChatMessageForTest(
      harness.stateMachine,
      "Summarize what this spreadsheet contains."
    );
    assert.equal(harness.stateMachine.getCurrentTurnState(), "pending_edit_preprocessed");

    await harness.stateMachine.updateState({ type: "accept_pending_diff" });
    await submitChatMessageForTest(harness.stateMachine, "Summarize this spreadsheet again.");

    assert.equal(harness.stateMachine.getCurrentTurnState(), "answered");
    assert.equal(countPreprocessRequests(harness), 1);
  }
);

liveTest(
  "Rejected Preprocessing Does Not Repeat For The Same Sheet",
  createNonPreprocessedTestHarness,
  async (harness) => {
    await submitChatMessageForTest(
      harness.stateMachine,
      "Summarize what this spreadsheet contains."
    );
    assert.equal(harness.stateMachine.getCurrentTurnState(), "pending_edit_preprocessed");

    await harness.stateMachine.updateState({ type: "reject_pending_diff" });
    await submitChatMessageForTest(harness.stateMachine, "Summarize this spreadsheet again.");

    assert.equal(harness.stateMachine.getCurrentTurnState(), "answered");
    assert.equal(countPreprocessRequests(harness), 1);
  }
);

test("Integration Product Behaviors", { concurrency: 100 }, async (context) => {
  await Promise.all(
    liveTestCases.map((testCase) => context.test(testCase.name, { concurrency: true }, testCase.fn))
  );
});

function liveTest(
  name: string,
  createHarness: () => TestHarness,
  fn: (harness: TestHarness) => Promise<void>
) {
  liveTestCases.push({
    name,
    fn: async (context) => {
      const harness = createHarness();
      try {
        await testHarnessStorage.run(harness, () => fn(harness));
      } catch (err) {
        writeBufferedLogs(context, harness.logLines);
        throw err;
      }
    },
  });
}

function createTestHarness(): TestHarness {
  const workbook = createExcelTestWorkbook({
    activeSheetName: "Sheet1",
    sheets: {
      Sheet1: {
        formulas: alreadyPreprocessedSheetFormulas,
        values: alreadyPreprocessedSheetValues,
      },
    },
  });

  return {
    stateMachine: createStateMachine(workbook),
    workbook,
    openRouterRequests: [],
    logLines: [],
  };
}

function createNonPreprocessedTestHarness(): TestHarness {
  const workbook = createExcelTestWorkbook({
    activeSheetName: "Sheet1",
    sheets: {
      Sheet1: {
        formulas: nonPreprocessedSheetFormulas,
        values: nonPreprocessedSheetValues,
      },
    },
  });

  return {
    stateMachine: createStateMachine(workbook),
    workbook,
    openRouterRequests: [],
    logLines: [],
  };
}

function createStateMachine(workbook: ExcelTestWorkbook) {
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
    didCreateDiff:
      stateMachine.getCurrentTurnState() === "pending_edit" ||
      stateMachine.getCurrentTurnState() === "pending_edit_preprocessed",
  };
}

function findRestoreEntry(stateMachine: ChatStateMachine) {
  return stateMachine
    .buildChatTranscript()
    .find(
      (entry): entry is Extract<ChatTranscriptEntry, { kind: "restore" }> =>
        entry.kind === "restore"
    );
}

function getLatestMessageEntry(stateMachine: ChatStateMachine) {
  return getMessageEntries(stateMachine).at(-1)!;
}

function getMessageEntries(stateMachine: ChatStateMachine) {
  return stateMachine
    .buildChatTranscript()
    .filter(
      (entry): entry is Extract<ChatTranscriptEntry, { kind: "message" }> =>
        entry.kind === "message"
    );
}

function countPreprocessRequests(harness: TestHarness) {
  return harness.openRouterRequests.filter(isPreprocessRequest).length;
}

function isPreprocessRequest(request: OpenRouterRequest) {
  const input = JSON.parse(request.input.at(-1)!.content);
  return input.userRequest === "Preprocess worksheet formulas.";
}

function isFormula(value: unknown) {
  return typeof value === "string" && value.startsWith("=");
}

function writeBufferedLogs(context: TestContext, logLines: string[]) {
  logLines.forEach((line) => context.diagnostic(line));
}

function formatConsoleArgs(args: unknown[]) {
  return args
    .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg, null, 2)))
    .join(" ");
}

function installOpenRouterApiKey() {
  openrouterKeyStore.set(apiKey);
}

function restoreOpenRouterApiKey() {
  openrouterKeyStore.clear();
}

function installFetchRecorder() {
  realFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const harness = testHarnessStorage.getStore();

    if (init?.body && typeof init.body === "string") {
      harness?.openRouterRequests.push(JSON.parse(init.body));
    }

    return realFetch(input, init);
  };
}

function restoreFetchRecorder() {
  globalThis.fetch = realFetch;
}

function installConsoleRecorder() {
  realConsoleLog = console.log;
  realConsoleDebug = console.debug;
  console.log = (...args: unknown[]) => writeConsoleLog(args, realConsoleLog);
  console.debug = (...args: unknown[]) => writeConsoleLog(args, realConsoleDebug);
}

function restoreConsoleRecorder() {
  console.log = realConsoleLog;
  console.debug = realConsoleDebug;
}

function writeConsoleLog(args: unknown[], writeToConsole: (...args: unknown[]) => void) {
  const harness = testHarnessStorage.getStore();
  if (harness) {
    harness.logLines.push(formatConsoleArgs(args));
  } else {
    writeToConsole(...args);
  }
}

function cloneSheet(sheet: unknown[][]): unknown[][] {
  return sheet.map((row) => [...row]);
}
