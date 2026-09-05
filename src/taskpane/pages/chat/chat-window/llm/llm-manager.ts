/* global console */

import {
  type OpenRouterFunctionCall,
  type OpenRouterFunctionTool,
  type OpenRouterInputItem,
  type OpenRouterMessage,
  type OpenRouterRequestBody,
  type OpenRouterResponseBody,
  extractOpenRouterText,
  extractPartialMainQueryText,
  parseSpreadsheetResponse,
  OpenRouterClient,
} from "./openrouter-client";
import type { SheetSnapshot, CellEdit } from "../excel-manager";
import {
  type PreprocessPromptEvent,
  executeFormulaGenerator,
  formulaDetectionInstructions,
  formulaDetectionModelConfig,
  formulaDetectionResponseSchema,
  type FormulaGeneratorResult,
  formulaGeneratorResponseSchema,
  type FormulaInferencePlan,
  formulaInferenceInstructions,
  formulaInferenceModelConfig,
  rateLimitFormulaInferenceRequest,
} from "./preprocess-formula-inference";
import { OpenrouterKeyStore } from "../../../openrouter-auth/openrouter-api-key";
import { formatSheetAsMarkdown, formatSheetDataAsMarkdown } from "./sheet-markdown";

type LlmConversationSheetContext = Readonly<{
  range: Readonly<{
    rowIndex: number;
    columnIndex: number;
    rowCount: number;
    columnCount: number;
  }>;
  sheetMarkdown: string;
}>;

type LlmConversationMessage = Readonly<{
  role: "assistant" | "user";
  text: string;
  workflowId: number;
  sheetContext?: LlmConversationSheetContext;
}>;

type LlmConversationFunctionCall = Readonly<{
  type: "function_call";
  id: string;
  callId: string;
  name: "ask_clarifying_question";
  arguments: string;
  workflowId: number;
}>;

type LlmConversationFunctionCallOutput = Readonly<{
  type: "function_call_output";
  callId: string;
  output: string;
  workflowId: number;
}>;

export type LlmConversationHistory = readonly (
  | LlmConversationMessage
  | LlmConversationFunctionCall
  | LlmConversationFunctionCallOutput
)[];

export type ComparisonRange = {
  purpose: string;
  address: string;
};

export type ModelSpreadsheetResponse =
  | {
      shouldEditSheet: false;
      createNewSheet: false;
      answer: string;
      editExplanation: null;
      cellEdits: CellEdit[];
      comparisonRanges: ComparisonRange[];
    }
  | {
      shouldEditSheet: true;
      createNewSheet: boolean;
      answer: null;
      editExplanation: string;
      cellEdits: CellEdit[];
      comparisonRanges: ComparisonRange[];
    };

export type SpreadsheetPromptWorkflowResult = {
  message: string;
  shouldEditSheet: boolean;
  createNewSheet: boolean;
  cellEdits: CellEdit[];
  comparisonRanges: ComparisonRange[];
};

export type ScenarioComparisonPromptResult = {
  cellEdits: CellEdit[];
  analysis: string;
};

export type SpreadsheetPromptCompletionEvent =
  | {
      type: "clarification_requested";
      question: string;
      updatedLlmConversationMessages: LlmConversationHistory;
    }
  | {
      type: "complete";
      reply: SpreadsheetPromptWorkflowResult;
      updatedLlmConversationMessages: LlmConversationHistory;
    };

export type SpreadsheetPromptEvent =
  | { type: "partial_response"; text: string }
  | { type: "creating_proposed_change" }
  | { type: "creating_scenario_sheet" }
  | SpreadsheetPromptCompletionEvent;

const openRouterModelConfig = {
  model: "openai/gpt-5.6-sol:exacto",
  provider: { order: ["openai"], allow_fallbacks: false },
  reasoning: { effort: "medium" },
};

const mainQueryInstructions = `You are an Excel spreadsheet assistant. The initial spreadsheet user request is JSON containing userRequest and sheetContext. Use sheetContext.sheetMarkdown for reading the spreadsheet. Formula cells contain the Excel formula followed by the calculated value in [value: ...]. If missing information prevents a reliable response, call ask_clarifying_question with one concise question instead of guessing. Treat the spreadsheet as the primary output.

Choose exactly one response mode.

ANSWER MODE
- Use this mode only when the user is asking solely to summarize, explain, or retrieve information already present in the sheet.
- Set shouldEditSheet to false and createNewSheet to false.
- Put the direct answer in answer.
- Set editExplanation to null.
- Return an empty cellEdits array.

EDIT MODE
- Use this mode for every request that should be reflected in the spreadsheet by updating relevant existing cells or adding appropriate new cells and formulas.
- A request that introduces a scenario, assumption, calculation, projection, correction, or other result not already represented in the sheet requires this mode, even when phrased as a question or when the user does not explicitly ask to edit the sheet.
- Set shouldEditSheet to true and answer to null.
- Put a concise explanation of what will change and why in editExplanation.
- Return the required edits in cellEdits.

Choose createNewSheet based on the requested edit destination, not merely because the request contains an assumption or hypothetical input. Apply these rules in order:
1. Set createNewSheet to true when the user explicitly asks for a new scenario, separate copy, alternative case, side-by-side comparison, or preservation of the current workbook model.
2. Set createNewSheet to false when the user asks to update, change, revise, adjust, or apply an assumption to the model or worksheet. Treat this as an in-place update unless the user explicitly requests a separate scenario.
3. For an exploratory what-if question that does not specify where to apply the changes, set createNewSheet to true.

The words "assume", "if", and "hypothetical" do not by themselves require a new scenario sheet.

editExplanation must be concise GitHub-flavored Markdown that identifies the assumptions, formulas, cells, or model areas being changed and explains why those changes address the request. Use a short heading, bold important terms, and bullets when useful. Do not wrap the explanation in a code fence. Use proposed or future language. Do not analyze results, compare baseline and changed values, quantify expected impact, or draw conclusions. A later prompt will analyze the recalculated results.

When createNewSheet is true, cellEdits describe changes to apply to a copy of the current worksheet. In that case, cellEdits must only modify cells in the existing worksheet model to reflect the requested scenario. Do not include comparison tables, comparison labels, or other additive analysis cells; those will be created separately. Never set createNewSheet to true when shouldEditSheet is false.

cellEdits must include only cells that should change. Each cell edit address must be an A1 address. newFormula is assigned through Office.js Range.formulas, so it must be exactly the literal cell value or exactly one valid Excel formula. Never put explanations, corrections, alternatives, or prose inside newFormula.

When createNewSheet is true, comparisonRanges must contain the smallest practical rectangular A1 ranges needed by a later model call to compare the recalculated scenario with the baseline and answer the user's request. Include relevant period labels, changed assumptions or drivers, and requested output metrics. Use addresses without sheet names, keep every range inside sheetContext.range, do not overlap ranges, and include a concise purpose for each range. When createNewSheet is false, return an empty comparisonRanges array.`;

const clarificationTool: OpenRouterFunctionTool = {
  type: "function",
  name: "ask_clarifying_question",
  description:
    "Ask the spreadsheet user one concise question when missing information prevents a reliable answer or edit.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "The single concise clarification question to show the spreadsheet user.",
      },
    },
    required: ["question"],
    additionalProperties: false,
  },
};

// const openRouterModelConfig = {
//   model: "anthropic/claude-opus-4.8:nitro",
//   reasoning: { effort: "medium" },
// };
// const openRouterModelConfig = {
//   model: "openai/gpt-5.4-mini:exacto",
//   provider: { order: ["openai"], allow_fallbacks: false },
//   reasoning: { effort: "medium" },
// };
// const openRouterModelConfig = {
//   model: "google/gemini-3.5-flash:exacto",
//   provider: { order: ["google-ai-studio"], allow_fallbacks: false },
//   reasoning: { effort: "medium" },
// };

const mainQueryResponseSchema = {
  format: {
    type: "json_schema",
    name: "spreadsheet_response",
    strict: true,
    schema: {
      type: "object",
      properties: {
        shouldEditSheet: {
          type: "boolean",
          description: "Whether the harness should edit cells in the active sheet.",
        },
        createNewSheet: {
          type: "boolean",
          description:
            "Whether these edits should be applied to a new copy of the active sheet rather than the active sheet.",
        },
        answer: {
          type: ["string", "null"],
          description:
            "The direct answer to the user when shouldEditSheet is false. Otherwise null.",
        },
        editExplanation: {
          type: ["string", "null"],
          description:
            "Concise user-facing Markdown explaining what will be changed and why when shouldEditSheet is true. Otherwise null. Do not analyze the impact of the changes.",
        },
        cellEdits: {
          type: "array",
          description: "The single-cell edits to apply. Empty when shouldEditSheet is false.",
          items: {
            type: "object",
            properties: {
              address: {
                type: "string",
                description: "The A1 address of the cell to edit.",
              },
              newFormula: {
                type: ["string", "number", "boolean", "null"],
                description:
                  "The exact formula or literal value to assign through Range.formulas. Formula strings must be valid Excel formulas. Do not include explanatory prose.",
              },
            },
            required: ["address", "newFormula"],
            additionalProperties: false,
          },
        },
        comparisonRanges: {
          type: "array",
          description:
            "The smallest practical worksheet ranges needed to compare a recalculated scenario with the baseline. Empty when createNewSheet is false.",
          items: {
            type: "object",
            properties: {
              purpose: {
                type: "string",
                description: "Why this range is needed for the comparison.",
              },
              address: {
                type: "string",
                description: "A rectangular A1 range without a sheet name, such as B3:AL5.",
              },
            },
            required: ["purpose", "address"],
            additionalProperties: false,
          },
        },
      },
      required: [
        "shouldEditSheet",
        "createNewSheet",
        "answer",
        "editExplanation",
        "cellEdits",
        "comparisonRanges",
      ],
      additionalProperties: false,
    },
  },
};

const scenarioComparisonResponseSchema = {
  format: {
    type: "json_schema",
    name: "scenario_comparison_response",
    strict: true,
    schema: {
      type: "object",
      properties: {
        cellEdits: {
          type: "array",
          description: "The additive comparison cells to apply to the scenario worksheet.",
          items: {
            type: "object",
            properties: {
              address: {
                type: "string",
                description: "The A1 address of the new comparison cell.",
              },
              newFormula: {
                type: ["string", "number", "boolean", "null"],
                description:
                  "The exact formula or literal value to assign through Range.formulas. Formula strings must be valid Excel formulas. Do not include explanatory prose.",
              },
            },
            required: ["address", "newFormula"],
            additionalProperties: false,
          },
        },
        analysis: {
          type: "string",
          description:
            "User-facing Markdown analysis of the recalculated differences, guided by the original request.",
        },
      },
      required: ["cellEdits", "analysis"],
      additionalProperties: false,
    },
  },
};

export class LLMManager {
  private readonly openRouterClient: OpenRouterClient;

  constructor(keyStore: OpenrouterKeyStore) {
    this.openRouterClient = new OpenRouterClient(keyStore);
  }

  async *runPreprocessPrompt(sheet: SheetSnapshot): AsyncGenerator<PreprocessPromptEvent> {
    const preprocessStartTime = Date.now();
    console.dir("Initiating sheet preprocessing");
    const sheetContext = buildSheetContext(sheet);
    const detectionSheetContext = buildCompactSheetContext(sheet);
    const detectionResponse = await this.openRouterClient.request({
      ...formulaDetectionModelConfig,
      instructions: formulaDetectionInstructions,
      input: [
        {
          role: "user",
          content: JSON.stringify({
            userRequest: "Preprocess worksheet formulas.",
            sheetContext: detectionSheetContext,
          }),
        },
      ],
      text: formulaDetectionResponseSchema,
      max_output_tokens: 4000,
    });
    const formulaInferencePlan = JSON.parse(
      extractOpenRouterText(detectionResponse)
    ) as FormulaInferencePlan;
    if (formulaInferencePlan.shouldInferFormulas) {
      yield { type: "detection_complete", plan: formulaInferencePlan };
    }

    let cellEdits: CellEdit[];
    if (!formulaInferencePlan.shouldInferFormulas) {
      cellEdits = [];
    } else {
      const completedRegionResults: FormulaInferenceRegionResult[] = [];
      let resolveNextRegionResult: (() => void) | undefined;
      const regionResultsPromise = inferFormulaRegions(
        this.openRouterClient,
        formulaInferencePlan,
        sheetContext,
        (regionResult) => {
          completedRegionResults.push(regionResult);
          resolveNextRegionResult?.();
        }
      );
      for (let index = 0; index < formulaInferencePlan.regions.length; index++) {
        if (completedRegionResults.length === 0) {
          await Promise.race([
            new Promise<void>((resolve) => {
              resolveNextRegionResult = resolve;
            }),
            regionResultsPromise.then(() => undefined),
          ]);
          resolveNextRegionResult = undefined;
        }
        const regionResult = completedRegionResults.shift()!;
        yield {
          type: "region_complete",
          region: regionResult.region,
          cellEditCount: regionResult.cellEdits.length,
        };
      }
      const regionResults = await regionResultsPromise;
      cellEdits = validatePreprocessEdits(
        sheet,
        regionResults.flatMap((regionResult) => regionResult.cellEdits)
      );
    }

    console.dir({
      preprocessTotalDurationSeconds: (Date.now() - preprocessStartTime) / 1000,
    });
    yield {
      type: "complete",
      cellEdits,
    };
  }

  async *runMainQueryPrompt(
    prompt: string,
    workflowId: number,
    originalSheet: SheetSnapshot,
    llmConversationMessages: LlmConversationHistory
  ): AsyncGenerator<SpreadsheetPromptEvent> {
    const sheetContext = buildCompactSheetContext(originalSheet);
    const currentUserContent = JSON.stringify({
      userRequest: prompt,
      sheetContext,
    });
    const requestBody = buildMainQueryRequestBody(currentUserContent, llmConversationMessages);
    const compactedLlmConversationMessages = compactLlmConversationHistory(llmConversationMessages);
    const currentUserMessage: LlmConversationMessage = {
      role: "user",
      text: prompt,
      workflowId,
      sheetContext,
    };
    let result: OpenRouterResponseBody | undefined;
    let hasStartedCreatingProposedChange = false;
    for await (const event of this.openRouterClient.requestStreamEvents(requestBody)) {
      if (event.type === "output_text") {
        const partialText = extractPartialMainQueryText(event.outputText);
        const createNewSheetMatch = /"createNewSheet"\s*:\s*(true|false)/.exec(event.outputText);
        if (partialText) {
          yield { type: "partial_response", text: partialText };
        }
        if (
          !hasStartedCreatingProposedChange &&
          /"shouldEditSheet"\s*:\s*true/.test(event.outputText) &&
          createNewSheetMatch
        ) {
          if (createNewSheetMatch[1] === "true") {
            yield { type: "creating_scenario_sheet" };
          } else {
            yield { type: "creating_proposed_change" };
          }
          hasStartedCreatingProposedChange = true;
        }
      }

      if (event.type === "complete") {
        result = event.response;
      }
    }
    const clarificationRequest = extractClarificationRequest(result!);
    if (clarificationRequest) {
      yield {
        type: "clarification_requested",
        question: clarificationRequest.question,
        updatedLlmConversationMessages: [
          ...compactedLlmConversationMessages,
          currentUserMessage,
          toLlmConversationFunctionCall(clarificationRequest.toolCall, workflowId),
        ],
      };
    } else {
      const parsedResponse = parseSpreadsheetResponse(result!);
      const response = parsedResponse.response;
      const responseText = getMainQueryResponseText(response);

      yield {
        type: "complete",
        reply: {
          message: responseText,
          shouldEditSheet: response.shouldEditSheet,
          createNewSheet: response.createNewSheet,
          cellEdits: response.cellEdits,
          comparisonRanges: response.comparisonRanges,
        },
        updatedLlmConversationMessages: [
          ...compactedLlmConversationMessages,
          currentUserMessage,
          { role: "assistant", text: responseText, workflowId },
        ],
      };
    }
  }

  async *runClarificationResponsePrompt(
    answer: string,
    workflowId: number,
    llmConversationMessages: LlmConversationHistory
  ): AsyncGenerator<SpreadsheetPromptEvent> {
    const pendingToolCall = this.getPendingClarificationToolCall(llmConversationMessages);
    const functionCallOutput: LlmConversationFunctionCallOutput = {
      type: "function_call_output",
      callId: pendingToolCall.callId,
      output: answer,
      workflowId,
    };
    const updatedLlmConversationMessages = [...llmConversationMessages, functionCallOutput];
    const requestBody = buildClarificationResponseRequestBody(updatedLlmConversationMessages);
    let result: OpenRouterResponseBody | undefined;
    let hasStartedCreatingProposedChange = false;
    for await (const event of this.openRouterClient.requestStreamEvents(requestBody)) {
      if (event.type === "output_text") {
        const partialText = extractPartialMainQueryText(event.outputText);
        const createNewSheetMatch = /"createNewSheet"\s*:\s*(true|false)/.exec(event.outputText);
        if (partialText) {
          yield { type: "partial_response", text: partialText };
        }
        if (
          !hasStartedCreatingProposedChange &&
          /"shouldEditSheet"\s*:\s*true/.test(event.outputText) &&
          createNewSheetMatch
        ) {
          if (createNewSheetMatch[1] === "true") {
            yield { type: "creating_scenario_sheet" };
          } else {
            yield { type: "creating_proposed_change" };
          }
          hasStartedCreatingProposedChange = true;
        }
      }

      if (event.type === "complete") {
        result = event.response;
      }
    }
    const clarificationRequest = extractClarificationRequest(result!);
    if (clarificationRequest) {
      yield {
        type: "clarification_requested",
        question: clarificationRequest.question,
        updatedLlmConversationMessages: [
          ...updatedLlmConversationMessages,
          toLlmConversationFunctionCall(clarificationRequest.toolCall, workflowId),
        ],
      };
    } else {
      const parsedResponse = parseSpreadsheetResponse(result!);
      const response = parsedResponse.response;
      const responseText = getMainQueryResponseText(response);
      yield {
        type: "complete",
        reply: {
          message: responseText,
          shouldEditSheet: response.shouldEditSheet,
          createNewSheet: response.createNewSheet,
          cellEdits: response.cellEdits,
          comparisonRanges: response.comparisonRanges,
        },
        updatedLlmConversationMessages: [
          ...updatedLlmConversationMessages,
          { role: "assistant", text: responseText, workflowId },
        ],
      };
    }
  }

  async runScenarioComparisonPrompt(
    userRequest: string,
    originalSheet: SheetSnapshot,
    scenarioSheet: SheetSnapshot,
    comparisonRanges: ComparisonRange[],
    llmConversationMessages: LlmConversationHistory
  ): Promise<ScenarioComparisonPromptResult> {
    if (comparisonRanges.length === 0) {
      throw new Error("A scenario comparison requires at least one comparison range.");
    }
    const selectedCells = new Set<string>();
    const ranges = comparisonRanges.map((range) => {
      const parsedRange = parseComparisonRange(range.address);
      for (
        let row = parsedRange.rowIndex;
        row < parsedRange.rowIndex + parsedRange.rowCount;
        row++
      ) {
        for (
          let column = parsedRange.columnIndex;
          column < parsedRange.columnIndex + parsedRange.columnCount;
          column++
        ) {
          const cell = `${row}:${column}`;
          if (selectedCells.has(cell)) {
            throw new Error(`Comparison ranges overlap at ${range.address}.`);
          }
          selectedCells.add(cell);
        }
      }
      const originalContext = buildCompactSheetRangeContext(originalSheet, parsedRange);
      const scenarioContext = buildCompactSheetRangeContext(scenarioSheet, parsedRange);
      return {
        purpose: range.purpose,
        address: range.address,
        originalSheetMarkdown: originalContext.sheetMarkdown,
        scenarioSheetMarkdown: scenarioContext.sheetMarkdown,
      };
    });
    const requestBody: OpenRouterRequestBody = {
      ...openRouterModelConfig,
      instructions: `You add a comparison section to an Excel scenario worksheet and provide a user-facing analysis. The current user message content is JSON containing the original user request, exact worksheet names, the first available comparison cell, and selected recalculated ranges from the original and scenario worksheets.

Return cellEdits containing only new comparison cells at or below comparisonStartCell on the scenario worksheet. Do not modify the existing scenario model. Add clear labels and compare the relevant original values, scenario values, and differences. Baseline-value formulas must explicitly reference the original worksheet, scenario-value formulas must explicitly reference the scenario worksheet, and difference formulas must explicitly reference both. Use the exact worksheet names supplied in the request and quote worksheet names correctly in Excel formulas. Do not reconstruct original values from the scenario worksheet. Each cell edit address must be an A1 address on the scenario worksheet. newFormula is assigned through Office.js Range.formulas, so it must be exactly the literal cell value or exactly one valid Excel formula.

Each originalSheetMarkdown and scenarioSheetMarkdown table contains literal cells directly and formula cells as the Excel formula followed by the calculated value in [value: ...].

Return analysis as concise GitHub-flavored Markdown that directly answers the user's original request using the baseline and scenario values. Use a short heading, bold important metrics, bullets for key findings, and a Markdown table for baseline, scenario, and difference values when useful. Do not wrap the analysis in a code fence. Identify the most relevant differences, quantify material changes where possible, mention relevant metrics and periods, distinguish baseline, scenario, and difference values clearly, and focus on business implications. Do not explain how the worksheet or comparison table was constructed, and do not make unsupported claims.`,
      input: buildOpenRouterMessages(
        llmConversationMessages,
        JSON.stringify({
          userRequest,
          originalSheetName: originalSheet.name,
          scenarioSheetName: scenarioSheet.name,
          comparisonStartCell: `A${scenarioSheet.rowIndex + scenarioSheet.rowCount + 2}`,
          ranges,
        })
      ),
      text: scenarioComparisonResponseSchema,
      max_output_tokens: 32000,
    };
    console.info("Scenario comparison range selection:", {
      ranges: comparisonRanges,
      selectedCellCount: selectedCells.size,
      requestCharacters: JSON.stringify(requestBody).length,
    });
    const comparisonStartTime = Date.now();
    const responseBody = await this.openRouterClient.request(requestBody);
    console.log("Scenario comparison duration (s):", (Date.now() - comparisonStartTime) / 1000);
    const response = JSON.parse(
      extractOpenRouterText(responseBody)
    ) as ScenarioComparisonPromptResult;
    return {
      cellEdits: response.cellEdits,
      analysis: response.analysis,
    };
  }

  getPendingClarificationToolCall(
    llmConversationMessages: LlmConversationHistory
  ): LlmConversationFunctionCall {
    const answeredCallIds = new Set<string>();
    for (const message of llmConversationMessages) {
      if ("type" in message && message.type === "function_call_output") {
        answeredCallIds.add(message.callId);
      }
    }

    let pendingToolCall: LlmConversationFunctionCall | undefined;
    for (const message of llmConversationMessages) {
      if (
        "type" in message &&
        message.type === "function_call" &&
        !answeredCallIds.has(message.callId)
      ) {
        pendingToolCall = message;
        break;
      }
    }

    return pendingToolCall!;
  }

  async runUpdateAnalysisPrompt(
    userRequest: string,
    originalSheet: SheetSnapshot,
    updatedSheet: SheetSnapshot,
    llmConversationMessages: LlmConversationHistory
  ): Promise<string> {
    const result = await this.openRouterClient.request(
      buildUpdateAnalysisRequestBody(
        userRequest,
        originalSheet,
        updatedSheet,
        llmConversationMessages
      )
    );
    return extractOpenRouterText(result);
  }
}

type FormulaInferenceRegionResult = {
  region: FormulaInferencePlan["regions"][number];
  cellEdits: CellEdit[];
};

async function inferFormulaRegions(
  openRouterClient: OpenRouterClient,
  formulaInferencePlan: FormulaInferencePlan,
  sheetContext: ReturnType<typeof buildSheetContext>,
  onRegionComplete: (regionResult: FormulaInferenceRegionResult) => void
) {
  return Promise.all(
    formulaInferencePlan.regions.map(async (region, index) => {
      await rateLimitFormulaInferenceRequest(index);
      const regionResult = await inferFormulaRegionWithRetry(
        openRouterClient,
        region,
        sheetContext
      );
      onRegionComplete(regionResult);
      return regionResult;
    })
  );
}

async function inferFormulaRegionWithRetry(
  openRouterClient: OpenRouterClient,
  region: FormulaInferencePlan["regions"][number],
  sheetContext: ReturnType<typeof buildSheetContext>
): Promise<FormulaInferenceRegionResult> {
  let regionResult: FormulaInferenceRegionResult;
  try {
    regionResult = await inferFormulaRegion(openRouterClient, region, sheetContext, 1);
  } catch (firstError) {
    console.warn("Formula inference failed. Retrying region.", {
      targetRange: region.targetRange,
      attemptNumber: 1,
      error: firstError,
    });
    try {
      regionResult = await inferFormulaRegion(openRouterClient, region, sheetContext, 2);
    } catch (secondError) {
      console.error("Formula inference failed after retry.", {
        targetRange: region.targetRange,
        attemptNumber: 2,
        error: secondError,
      });
      throw secondError;
    }
  }
  return regionResult;
}

async function inferFormulaRegion(
  openRouterClient: OpenRouterClient,
  region: FormulaInferencePlan["regions"][number],
  sheetContext: ReturnType<typeof buildSheetContext>,
  attemptNumber: number
): Promise<FormulaInferenceRegionResult> {
  const response = await openRouterClient.request({
    ...formulaInferenceModelConfig,
    instructions: formulaInferenceInstructions,
    input: [
      {
        role: "user",
        content: JSON.stringify({
          userRequest:
            "Generate the formulas for every reliably inferred hardcoded calculation in this region.",
          formulaInferenceRegion: region,
          sheetContext,
        }),
      },
    ],
    text: formulaGeneratorResponseSchema,
    max_output_tokens: 8000,
  });
  const responseText = extractOpenRouterText(response);
  console.dir({
    formulaInferenceParseInput: {
      targetRange: region.targetRange,
      attemptNumber,
      characterCount: responseText.length,
      text: responseText,
      rawOutput: response.output,
    },
  });
  const result = JSON.parse(responseText) as FormulaGeneratorResult;
  return {
    region,
    cellEdits: await executeFormulaGenerator(result.functionSource, region.targetRange),
  };
}

function validatePreprocessEdits(sheet: SheetSnapshot, cellEdits: CellEdit[]) {
  const merged = new Map<string, { edit: CellEdit; row: number; column: number }>();
  for (const edit of cellEdits) {
    const match = /^([A-Z]+)([1-9][0-9]*)$/i.exec(edit.address);
    if (!match) {
      throw new Error(`Malformed cell address: ${edit.address}`);
    }

    const row = Number(match[2]) - 1;
    let column = 0;
    for (const character of match[1].toUpperCase()) {
      column = column * 26 + character.charCodeAt(0) - 64;
    }
    column--;

    const address = `${match[1].toUpperCase()}${row + 1}`;
    if (
      !Number.isSafeInteger(row) ||
      !Number.isSafeInteger(column) ||
      row < sheet.rowIndex ||
      row >= sheet.rowIndex + sheet.rowCount ||
      column < sheet.columnIndex ||
      column >= sheet.columnIndex + sheet.columnCount
    ) {
      throw new Error(`Cell address is outside the worksheet: ${address}`);
    }

    const existing = merged.get(address);
    if (existing && !Object.is(existing.edit.newFormula, edit.newFormula)) {
      throw new Error(`Conflicting formulas proposed for ${address}.`);
    } else if (!existing) {
      merged.set(address, { edit: { ...edit, address }, row, column });
    }
  }

  return [...merged.values()]
    .sort((left, right) => left.row - right.row || left.column - right.column)
    .map((parsed) => parsed.edit);
}

function getMainQueryResponseText(response: ModelSpreadsheetResponse): string {
  if (response.shouldEditSheet) {
    return response.editExplanation;
  } else {
    return response.answer;
  }
}

function buildMainQueryRequestBody(
  currentUserContent: string,
  llmConversationMessages: LlmConversationHistory
): OpenRouterRequestBody {
  return {
    ...openRouterModelConfig,
    instructions: mainQueryInstructions,
    input: buildOpenRouterMessages(llmConversationMessages, currentUserContent),
    text: mainQueryResponseSchema,
    tools: [clarificationTool],
    tool_choice: "auto",
    parallel_tool_calls: false,
    max_output_tokens: 32000,
  };
}

function buildClarificationResponseRequestBody(
  llmConversationMessages: LlmConversationHistory
): OpenRouterRequestBody {
  return {
    ...openRouterModelConfig,
    instructions: mainQueryInstructions,
    input: buildOpenRouterInputItems(llmConversationMessages),
    text: mainQueryResponseSchema,
    tools: [clarificationTool],
    tool_choice: "auto",
    parallel_tool_calls: false,
    max_output_tokens: 32000,
  };
}

function buildUpdateAnalysisRequestBody(
  userRequest: string,
  originalSheet: SheetSnapshot,
  updatedSheet: SheetSnapshot,
  llmConversationMessages: LlmConversationHistory
): OpenRouterRequestBody {
  const input = buildOpenRouterMessages(
    llmConversationMessages,
    JSON.stringify({
      userRequest,
      originalSheet: {
        name: originalSheet.name,
        ...buildSheetContext(originalSheet),
      },
      updatedSheet: {
        name: updatedSheet.name,
        ...buildSheetContext(updatedSheet),
      },
    })
  );

  return {
    ...openRouterModelConfig,
    instructions:
      "You analyze an accepted Excel worksheet update after its formulas have recalculated. The current user message content is JSON containing the user's original request and the original and updated worksheet contexts. Directly answer the original request by comparing the original and updated values. Identify the most relevant differences, quantify material changes where possible, mention relevant metrics and periods, and focus on business implications. The update has already been applied, so do not use proposed or conditional language. Do not explain how the edits were constructed. Be concise.",
    input,
    text: {
      format: {
        type: "text",
      },
    },
    max_output_tokens: 4000,
  };
}

function buildOpenRouterMessages(
  history: LlmConversationHistory,
  currentUserContent: string
): OpenRouterInputItem[] {
  const input = buildOpenRouterInputItems(compactLlmConversationHistory(history));
  input.push({
    role: "user",
    content: currentUserContent,
  });

  return input;
}

function buildOpenRouterInputItems(history: LlmConversationHistory): OpenRouterInputItem[] {
  const input: OpenRouterInputItem[] = [];
  for (const message of history) {
    if ("role" in message) {
      const openRouterMessage: OpenRouterMessage = {
        role: message.role,
        content:
          message.role === "user" && message.sheetContext
            ? JSON.stringify({ userRequest: message.text, sheetContext: message.sheetContext })
            : message.text,
      };
      input.push(openRouterMessage);
    }

    if ("type" in message && message.type === "function_call") {
      input.push({
        type: "function_call",
        id: message.id,
        call_id: message.callId,
        name: message.name,
        arguments: message.arguments,
      });
    }

    if ("type" in message && message.type === "function_call_output") {
      input.push({
        type: "function_call_output",
        call_id: message.callId,
        output: message.output,
      });
    }
  }

  return input;
}

function compactLlmConversationHistory(
  llmConversationMessages: LlmConversationHistory
): LlmConversationHistory {
  return llmConversationMessages.map((message): LlmConversationHistory[number] => {
    if ("role" in message && message.role === "user" && message.sheetContext) {
      return {
        role: message.role,
        text: message.text,
        workflowId: message.workflowId,
      };
    } else {
      return message;
    }
  });
}

function extractClarificationRequest(
  response: OpenRouterResponseBody
): { question: string; toolCall: OpenRouterFunctionCall } | undefined {
  const toolCall = response.output?.find(
    (item) => item.type === "function_call" && "name" in item
  ) as OpenRouterFunctionCall | undefined;
  if (!toolCall) {
    return undefined;
  }

  return {
    question: (JSON.parse(toolCall.arguments) as { question: string }).question,
    toolCall,
  };
}

function toLlmConversationFunctionCall(
  toolCall: OpenRouterFunctionCall,
  workflowId: number
): LlmConversationFunctionCall {
  return {
    type: "function_call",
    id: toolCall.id,
    callId: toolCall.call_id,
    name: toolCall.name,
    arguments: toolCall.arguments,
    workflowId,
  };
}

function buildSheetContext(originalSheet: SheetSnapshot) {
  return {
    range: {
      rowIndex: originalSheet.rowIndex,
      columnIndex: originalSheet.columnIndex,
      rowCount: originalSheet.rowCount,
      columnCount: originalSheet.columnCount,
    },
    formulasMarkdown: formatSheetDataAsMarkdown(originalSheet, originalSheet.formulas),
    valuesMarkdown: formatSheetDataAsMarkdown(originalSheet, originalSheet.values),
  };
}

function buildCompactSheetContext(sheet: SheetSnapshot) {
  return {
    range: {
      rowIndex: sheet.rowIndex,
      columnIndex: sheet.columnIndex,
      rowCount: sheet.rowCount,
      columnCount: sheet.columnCount,
    },
    sheetMarkdown: formatSheetAsMarkdown(sheet),
  };
}

function buildCompactSheetRangeContext(
  sheet: SheetSnapshot,
  range: {
    rowIndex: number;
    columnIndex: number;
    rowCount: number;
    columnCount: number;
  }
) {
  const rowOffset = range.rowIndex - sheet.rowIndex;
  const columnOffset = range.columnIndex - sheet.columnIndex;
  if (
    rowOffset < 0 ||
    columnOffset < 0 ||
    rowOffset + range.rowCount > sheet.rowCount ||
    columnOffset + range.columnCount > sheet.columnCount
  ) {
    throw new Error("Comparison range is outside the occupied worksheet.");
  }
  const rangeSheet: SheetSnapshot = {
    ...sheet,
    formulas: sheet.formulas
      .slice(rowOffset, rowOffset + range.rowCount)
      .map((row) => row.slice(columnOffset, columnOffset + range.columnCount)),
    values: sheet.values
      .slice(rowOffset, rowOffset + range.rowCount)
      .map((row) => row.slice(columnOffset, columnOffset + range.columnCount)),
    ...range,
  };
  return buildCompactSheetContext(rangeSheet);
}

function parseComparisonRange(address: string) {
  const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i.exec(address);
  if (!match) {
    throw new Error(`Invalid comparison range: ${address}`);
  }
  const startColumn = getColumnIndex(match[1]);
  const startRow = Number(match[2]) - 1;
  const endColumn = getColumnIndex(match[3]);
  const endRow = Number(match[4]) - 1;
  if (endRow < startRow || endColumn < startColumn) {
    throw new Error(`Invalid comparison range: ${address}`);
  }
  return {
    rowIndex: startRow,
    columnIndex: startColumn,
    rowCount: endRow - startRow + 1,
    columnCount: endColumn - startColumn + 1,
  };
}

function getColumnIndex(label: string): number {
  let index = 0;
  for (const character of label.toUpperCase()) {
    index = index * 26 + character.charCodeAt(0) - 64;
  }
  return index - 1;
}
