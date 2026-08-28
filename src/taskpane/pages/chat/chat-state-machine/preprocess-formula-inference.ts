/* global setTimeout */

import { getQuickJS, shouldInterruptAfterDeadline } from "quickjs-emscripten";

import type { CellEdit } from "./chat-types";

export type FormulaInferenceRegion = {
  targetRange: string;
  structure: string;
  sourceRanges: string[];
  relationship: string;
  evidenceCells: string[];
};

export type FormulaInferencePlan = {
  shouldInferFormulas: boolean;
  confidence: "low" | "medium" | "high";
  summary: string;
  regions: FormulaInferenceRegion[];
};

export type FormulaGeneratorResult = {
  functionSource: string;
};

export const formulaDetectionModelConfig = {
  model: "openai/gpt-5.6-sol:exacto",
  provider: { order: ["openai"], allow_fallbacks: false },
  reasoning: { effort: "medium" },
};

export const formulaInferenceModelConfig = {
  model: "openai/gpt-5.6-terra:exacto",
  provider: { order: ["openai"], allow_fallbacks: false },
  reasoning: { effort: "medium" },
};

const formulaInferenceRequestIntervalMs = 5;

export const formulaDetectionInstructions =
  "You decide whether an Excel worksheet contains hardcoded calculated cells that should be replaced with formulas, and map the related formula regions. The current user message content is JSON containing the complete worksheet context. Use sheetContext.sheetMarkdown for reading the worksheet. Formula cells contain the Excel formula followed by the calculated value in [value: ...]. Do not propose cell edits. Distinguish input assumptions, labels, and manually entered actuals from calculated outputs. Do not select cells that represent dates or calendar headers, including date-like numbers such as Excel date serials, even when they form a repeated or calculable sequence. Hardcoded calculated regions may contain no surviving formulas, so treat repeated numerical relationships across rows or columns as evidence. Return shouldInferFormulas false only when you are confident there are no reliable formula candidates; when uncertain, return true. For every candidate region, identify its target range, structure, source ranges, relationship, and representative evidence cells using A1 addresses without sheet names or $ signs.";

export const formulaInferenceInstructions =
  "You infer formulas for one identified region of an Excel worksheet. The current user message content is JSON containing the complete worksheet context and one formula inference region from a previous model pass. Independently verify and correct the proposed relationship. Do not infer formulas outside the supplied targetRange. Hardcoded calculated regions may contain no surviving formulas. Derive the formula pattern and verify it against at least four nonadjacent values spanning multiple rows and columns, accounting for displayed-value rounding. Preserve existing blank cells and use relative, absolute, and mixed references correctly. Return the source of exactly one standalone JavaScript function named generateFormulaEdits with this signature: function generateFormulaEdits() { ... }. Its return type must be Array<{ address: string; newFormula: string }>. The function must algorithmically generate the complete formula edits for the region using loops rather than embedding one array entry per cell. Put all repetition and address-selection logic in the JavaScript function, not in the generated Excel formulas. Generate a different formula string when its concrete references differ. Every generated formula must use only numeric literals, direct A1 cell or range references, arithmetic operators, parentheses, percentages, and SUM. Prefer formulas that look like filling a simple seed formula across the region with appropriate relative, absolute, and mixed references. The function must have no imports, arguments, external dependencies, I/O, network access, or dynamic code execution. Every returned edit must have an address and newFormula string, and every newFormula must be a valid Excel formula beginning with =. Omit cells that should remain blank. If the relationship is unreliable, return a function whose result is an empty array. Use A1 addresses without sheet names or $ signs for edit addresses. Do not change input assumptions, labels, manually entered actuals, or uncertain cells.";

export const formulaDetectionResponseSchema = {
  format: {
    type: "json_schema",
    name: "formula_inference_plan",
    strict: true,
    schema: {
      type: "object",
      properties: {
        shouldInferFormulas: {
          type: "boolean",
          description:
            "Whether the worksheet has at least one reliably identifiable hardcoded calculated region.",
        },
        confidence: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Confidence in the overall detection decision.",
        },
        summary: {
          type: "string",
          description: "A concise description of the worksheet structure and decision.",
        },
        regions: {
          type: "array",
          description:
            "Related regions where formulas should be inferred. Empty when shouldInferFormulas is false.",
          items: {
            type: "object",
            properties: {
              targetRange: {
                type: "string",
                description: "The A1 range containing hardcoded calculated values.",
              },
              structure: {
                type: "string",
                description: "The repeated structural pattern of the target region.",
              },
              sourceRanges: {
                type: "array",
                items: { type: "string" },
                description: "A1 ranges containing inputs used by the inferred formula family.",
              },
              relationship: {
                type: "string",
                description:
                  "The semantic or mathematical relationship connecting sources to targets.",
              },
              evidenceCells: {
                type: "array",
                items: { type: "string" },
                description:
                  "Representative target cells whose values support the inferred relationship.",
              },
            },
            required: ["targetRange", "structure", "sourceRanges", "relationship", "evidenceCells"],
            additionalProperties: false,
          },
        },
      },
      required: ["shouldInferFormulas", "confidence", "summary", "regions"],
      additionalProperties: false,
    },
  },
};

export const formulaGeneratorResponseSchema = {
  format: {
    type: "json_schema",
    name: "region_formula_generator_response",
    strict: true,
    schema: {
      type: "object",
      properties: {
        functionSource: {
          type: "string",
          description:
            "Complete source for exactly one standalone JavaScript function named generateFormulaEdits. Do not wrap the source in Markdown fences.",
        },
      },
      required: ["functionSource"],
      additionalProperties: false,
    },
  },
};

export async function rateLimitFormulaInferenceRequest(index: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, index * formulaInferenceRequestIntervalMs));
}

export async function executeFormulaGenerator(
  functionSource: string,
  targetRange: string
): Promise<CellEdit[]> {
  const QuickJS = await getQuickJS();
  const result = QuickJS.evalCode(
    `"use strict";\n${functionSource}\nJSON.stringify(generateFormulaEdits());`,
    {
      shouldInterrupt: shouldInterruptAfterDeadline(Date.now() + 1000),
      memoryLimitBytes: 16 * 1024 * 1024,
      maxStackSizeBytes: 512 * 1024,
    }
  );
  if (typeof result !== "string") {
    throw new Error("Formula generator must return a JSON-serializable array.");
  }

  const generatedValue = JSON.parse(result) as unknown;
  if (!Array.isArray(generatedValue)) {
    throw new Error("Formula generator must return an array.");
  }
  const parsedTargetRange = parseRange(targetRange);
  generatedValue.forEach((edit) => {
    if (
      typeof edit !== "object" ||
      edit === null ||
      !("address" in edit) ||
      typeof edit.address !== "string" ||
      !/^[A-Z]+[1-9][0-9]*$/i.test(edit.address) ||
      !("newFormula" in edit) ||
      typeof edit.newFormula !== "string" ||
      !edit.newFormula.startsWith("=")
    ) {
      throw new Error(
        "Formula generator edits must contain an A1 address and an Excel formula string."
      );
    }
    const parsedAddress = parseAddress(edit.address);
    if (
      parsedAddress.row < parsedTargetRange.start.row ||
      parsedAddress.row > parsedTargetRange.end.row ||
      parsedAddress.column < parsedTargetRange.start.column ||
      parsedAddress.column > parsedTargetRange.end.column
    ) {
      throw new Error(`Formula generator edit is outside ${targetRange}: ${edit.address}`);
    }
  });
  return generatedValue as CellEdit[];
}

function parseRange(range: string) {
  const addresses = range.split(":");
  if (addresses.length > 2 || !addresses[0]) {
    throw new Error(`Malformed formula inference range: ${range}`);
  }
  const start = parseAddress(addresses[0]);
  const end = addresses[1] ? parseAddress(addresses[1]) : start;
  if (start.row > end.row || start.column > end.column) {
    throw new Error(`Malformed formula inference range: ${range}`);
  }
  return { start, end };
}

function parseAddress(address: string) {
  const match = /^([A-Z]+)([1-9][0-9]*)$/i.exec(address);
  if (!match) {
    throw new Error(`Malformed cell address: ${address}`);
  }
  let column = 0;
  for (const character of match[1].toUpperCase()) {
    column = column * 26 + character.charCodeAt(0) - 64;
  }
  return { row: Number(match[2]), column };
}
