import assert from "node:assert/strict";
import test from "node:test";

import { ChatStateMachine } from "../src/taskpane/pages/chat/chat-state-machine/chat-state-machine";
import {
  ChatTranscriptEntry,
  OpenRouterRequestBody,
  SpreadsheetPromptResult,
} from "../src/taskpane/pages/chat/chat-state-machine/chat-types";
import { configureOpenRouterClient } from "../src/taskpane/pages/chat/chat-state-machine/openrouter-client";
import { OpenrouterKeyStore } from "../src/taskpane/pages/openrouter-auth/openrouter-api-key";
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

function installMocks() {
  const previousFetch = globalThis.fetch;
  const previousLog = console.log;
  const previousDebug = console.debug;

  openrouterKeyStore.set("unit-test-key");
  globalThis.fetch = async (_input, init) => {
    let requestBody: OpenRouterRequestBody | undefined;
    if (init?.body && typeof init.body === "string") {
      requestBody = JSON.parse(init.body);
    }
    return createOpenRouterResponse(
      getOpenRouterResponseBody(requestBody!),
      requestBody!.stream === true
    );
  };
  console.log = () => {};
  console.debug = () => {};

  return {
    restore() {
      openrouterKeyStore.clear();
      globalThis.fetch = previousFetch;
      console.log = previousLog;
      console.debug = previousDebug;
    },
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
