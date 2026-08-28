/* global console, Excel */

import { CellEdit, ExcelApi, SheetSnapshot } from "./chat-types";

export function normalizeSheetData(
  data: unknown[][],
  rowCount: number,
  columnCount: number
): unknown[][] {
  const result: unknown[][] = [];

  for (let row = 0; row < rowCount; row++) {
    result.push([]);
    for (let column = 0; column < columnCount; column++) {
      result[row].push(data[row]?.[column] ?? null);
    }
  }

  return result;
}

export function applyCellEdits(sheet: SheetSnapshot, cellEdits: CellEdit[]): SheetSnapshot {
  const updatedFormulas = sheet.formulas.map((row) => [...row]);

  cellEdits.forEach((edit) => {
    const cell = getSheetRelativeCell(sheet, edit.address);
    while (updatedFormulas.length <= cell.row) {
      updatedFormulas.push([]);
    }
    while (updatedFormulas[cell.row].length <= cell.column) {
      updatedFormulas[cell.row].push(null);
    }
    updatedFormulas[cell.row][cell.column] = edit.newFormula;
  });

  const rowCount = Math.max(sheet.rowCount, updatedFormulas.length);
  const columnCount = Math.max(sheet.columnCount, getColumnCount(updatedFormulas));

  return {
    ...sheet,
    formulas: normalizeSheetData(updatedFormulas, rowCount, columnCount),
    values: normalizeSheetData(sheet.values, rowCount, columnCount),
    rowCount,
    columnCount,
  };
}

export function retargetFormulaSheetReferences(
  sheet: SheetSnapshot,
  targetSheetName: string
): SheetSnapshot {
  const sourceReference = `'${sheet.name.replace(/'/g, "''")}'!`;
  const targetReference = `'${targetSheetName.replace(/'/g, "''")}'!`;
  return {
    ...sheet,
    name: targetSheetName,
    formulas: sheet.formulas.map((row) =>
      row.map((formula) => {
        if (typeof formula === "string" && formula.startsWith("=")) {
          return formula.split(sourceReference).join(targetReference);
        } else {
          return formula;
        }
      })
    ),
  };
}

export function formatSheetDataAsMarkdown(sheet: SheetSnapshot, data: unknown[][]): string {
  const colLabels: string[] = [];
  for (let i = 0; i < sheet.columnCount; i++) {
    colLabels.push(getColumnLabel(sheet.columnIndex + i));
  }

  const rows = [
    `| | ${colLabels.join(" | ")} |`,
    `| --- | ${colLabels.map(() => "---").join(" | ")} |`,
  ];
  for (let r = 0; r < sheet.rowCount; r++) {
    const rowLabel = `**${sheet.rowIndex + r + 1}**`;
    const rowCells = data[r].map((cell) => formatCellForMarkdown(cell));
    rows.push(`| ${rowLabel} | ${rowCells.join(" | ")} |`);
  }

  return rows.join("\n");
}

export function formatSheetAsMarkdown(sheet: SheetSnapshot): string {
  return formatSheetDataAsMarkdown(
    sheet,
    sheet.formulas.map((row, rowIndex) =>
      row.map((formula, columnIndex) => {
        if (typeof formula === "string" && formula.startsWith("=")) {
          return `${formula} [value: ${sheet.values[rowIndex][columnIndex] ?? ""}]`;
        } else {
          return sheet.values[rowIndex][columnIndex];
        }
      })
    )
  );
}

export async function readActiveSheet(excelApi: ExcelApi | undefined): Promise<SheetSnapshot> {
  return (excelApi || Excel).run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    return readSheetSnapshot(context, sheet);
  });
}

export async function readSheet(
  excelApi: ExcelApi | undefined,
  sheetName: string
): Promise<SheetSnapshot> {
  return (excelApi || Excel).run(async (context) => {
    const sheet = context.workbook.worksheets.getItem(sheetName);
    return readSheetSnapshot(context, sheet);
  });
}

async function readSheetSnapshot(
  context: Excel.RequestContext,
  sheet: Excel.Worksheet
): Promise<SheetSnapshot> {
  const usedRange = sheet.getUsedRange();
  sheet.load("name");
  usedRange.load(["values", "formulas", "rowIndex", "columnIndex", "rowCount", "columnCount"]);
  await context.sync();

  return {
    name: sheet.name,
    values: usedRange.values,
    formulas: usedRange.formulas,
    rowIndex: usedRange.rowIndex,
    columnIndex: usedRange.columnIndex,
    rowCount: usedRange.rowCount,
    columnCount: usedRange.columnCount,
  };
}

export async function writeSheetFormulas(
  excelApi: ExcelApi | undefined,
  sheetSnapshot: SheetSnapshot
): Promise<void> {
  await (excelApi || Excel).run(async (context) => {
    const sheet = context.workbook.worksheets.getItem(sheetSnapshot.name);
    const currentUsedRange = sheet.getUsedRange();
    currentUsedRange.clear("Contents" as Excel.ClearApplyTo);
    const targetRange = sheet
      .getCell(sheetSnapshot.rowIndex, sheetSnapshot.columnIndex)
      .getResizedRange(sheetSnapshot.rowCount - 1, sheetSnapshot.columnCount - 1);
    targetRange.formulas = sheetSnapshot.formulas;
    sheet.activate();
    await context.sync();
  });
}

export async function createDiffSheet(
  excelApi: ExcelApi | undefined,
  sheetNumber: number,
  originalSheet: SheetSnapshot,
  cellEdits: CellEdit[]
): Promise<{ sheetName: string; updatedSheet: SheetSnapshot }> {
  const diffSheetStartTime = Date.now();
  const sheetName = `Diff ${sheetNumber}`;
  const updatedSheet = applyCellEdits(originalSheet, cellEdits);
  await (excelApi || Excel).run(async (context) => {
    const sourceSheet = context.workbook.worksheets.getItem(originalSheet.name);
    const diffSheet = sourceSheet.copy("After", sourceSheet);
    diffSheet.name = sheetName;
    cellEdits.forEach((edit) => {
      const cell = getSheetRelativeCell(originalSheet, edit.address);
      const diffCell = diffSheet.getCell(
        originalSheet.rowIndex + cell.row,
        originalSheet.columnIndex + cell.column
      );
      diffCell.formulas = [[edit.newFormula]];
      diffCell.format.fill.color = "#00B050";
    });
    diffSheet.activate();
    await context.sync();
  });
  console.log("Diff sheet creation duration (s):", (Date.now() - diffSheetStartTime) / 1000);
  return { sheetName, updatedSheet };
}

export async function createScenarioSheet(
  excelApi: ExcelApi | undefined,
  sheetNumber: number,
  originalSheet: SheetSnapshot,
  cellEdits: CellEdit[]
): Promise<string> {
  const sheetName = `Scenario ${sheetNumber}`;
  await (excelApi || Excel).run(async (context) => {
    const sourceSheet = context.workbook.worksheets.getItem(originalSheet.name);
    const scenarioSheet = sourceSheet.copy("After", sourceSheet);
    scenarioSheet.name = sheetName;
    cellEdits.forEach((edit) => {
      const cell = getSheetRelativeCell(originalSheet, edit.address);
      const scenarioCell = scenarioSheet.getCell(
        originalSheet.rowIndex + cell.row,
        originalSheet.columnIndex + cell.column
      );
      scenarioCell.formulas = [[edit.newFormula]];
      scenarioCell.format.fill.color = "#00B050";
    });
    scenarioSheet.activate();
    await context.sync();
  });
  return sheetName;
}

export async function applyCellEditsToSheet(
  excelApi: ExcelApi | undefined,
  sheet: SheetSnapshot,
  cellEdits: CellEdit[]
): Promise<void> {
  await (excelApi || Excel).run(async (context) => {
    const targetSheet = context.workbook.worksheets.getItem(sheet.name);
    const firstCell = getSheetRelativeCell(sheet, cellEdits[0].address);
    let topRow = firstCell.row;
    let bottomRow = firstCell.row;
    let leftColumn = firstCell.column;
    let rightColumn = firstCell.column;
    cellEdits.forEach((edit) => {
      const cell = getSheetRelativeCell(sheet, edit.address);
      topRow = Math.min(topRow, cell.row);
      bottomRow = Math.max(bottomRow, cell.row);
      leftColumn = Math.min(leftColumn, cell.column);
      rightColumn = Math.max(rightColumn, cell.column);
      const targetCell = targetSheet.getCell(
        sheet.rowIndex + cell.row,
        sheet.columnIndex + cell.column
      );
      targetCell.formulas = [[edit.newFormula]];
      targetCell.format.fill.color = "#00B050";
    });
    targetSheet.activate();
    targetSheet
      .getRangeByIndexes(
        sheet.rowIndex + topRow,
        sheet.columnIndex + leftColumn,
        bottomRow - topRow + 1,
        rightColumn - leftColumn + 1
      )
      .select();
    await context.sync();
  });
}

export async function deleteDiffSheet(
  excelApi: ExcelApi | undefined,
  originalSheetName: string,
  diffSheetName: string
): Promise<void> {
  await (excelApi || Excel).run(async (context) => {
    const sheet = context.workbook.worksheets.getItem(originalSheetName);
    const diffSheet = context.workbook.worksheets.getItem(diffSheetName);
    sheet.activate();
    diffSheet.delete();
    await context.sync();
  });
}

function getColumnCount(data: unknown[][]): number {
  return data.reduce((columnCount, row) => Math.max(columnCount, row.length), 0);
}

function getSheetRelativeCell(sheet: SheetSnapshot, address: string) {
  const match = /^([A-Z]+)(\d+)$/i.exec(address)!;
  return {
    row: Number(match[2]) - 1 - sheet.rowIndex,
    column: getColumnIndex(match[1]) - sheet.columnIndex,
  };
}

function getColumnIndex(label: string) {
  let index = 0;
  const upperLabel = label.toUpperCase();
  for (let i = 0; i < upperLabel.length; i++) {
    index = index * 26 + upperLabel.charCodeAt(i) - 64;
  }
  return index - 1;
}

function formatCellForMarkdown(cell: unknown): string {
  return String(cell ?? "")
    .replace(/\{/g, "\\u007B")
    .replace(/\}/g, "\\u007D")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "\\n");
}

function getColumnLabel(index: number): string {
  let label = "";
  let temp = index;
  while (temp >= 0) {
    label = String.fromCharCode((temp % 26) + 65) + label;
    temp = Math.floor(temp / 26) - 1;
  }
  return label;
}
