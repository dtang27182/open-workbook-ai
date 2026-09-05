/* global console, Excel */

export type ExcelApi = {
  run<T>(callback: (context: Excel.RequestContext) => Promise<T>): Promise<T>;
};

export type SheetSnapshot = {
  name: string;
  values: unknown[][];
  formulas: unknown[][];
  rowIndex: number;
  columnIndex: number;
  rowCount: number;
  columnCount: number;
};

export type CellEdit = {
  address: string;
  newFormula: string | number | boolean | null;
};

export class ExcelManager {
  private nextDiffSheetNumber = 1;
  private nextScenarioSheetNumber = 1;

  constructor(private readonly excelApi?: ExcelApi) {}

  resetSheetNumbers(): void {
    this.nextDiffSheetNumber = 1;
    this.nextScenarioSheetNumber = 1;
  }

  async readActiveSheet(): Promise<SheetSnapshot> {
    return (this.excelApi || Excel).run(async (context) => {
      const sheet = context.workbook.worksheets.getActiveWorksheet();
      return this.readSheetSnapshot(context, sheet);
    });
  }

  async readSheet(sheetName: string): Promise<SheetSnapshot> {
    return (this.excelApi || Excel).run(async (context) => {
      const sheet = context.workbook.worksheets.getItem(sheetName);
      return this.readSheetSnapshot(context, sheet);
    });
  }

  async writeSheetFormulas(sheetSnapshot: SheetSnapshot): Promise<void> {
    await (this.excelApi || Excel).run(async (context) => {
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

  async createNextDiffSheet(
    originalSheet: SheetSnapshot,
    cellEdits: CellEdit[]
  ): Promise<{ sheetName: string; updatedSheet: SheetSnapshot }> {
    const diff = await this.createDiffSheet(this.nextDiffSheetNumber, originalSheet, cellEdits);
    this.nextDiffSheetNumber++;
    return diff;
  }

  async createNextScenarioSheet(
    originalSheet: SheetSnapshot,
    cellEdits: CellEdit[]
  ): Promise<string> {
    const sheetName = await this.createScenarioSheet(
      this.nextScenarioSheetNumber,
      originalSheet,
      cellEdits
    );
    this.nextScenarioSheetNumber++;
    return sheetName;
  }

  async applyCellEditsToSheet(sheet: SheetSnapshot, cellEdits: CellEdit[]): Promise<void> {
    await (this.excelApi || Excel).run(async (context) => {
      const targetSheet = context.workbook.worksheets.getItem(sheet.name);
      const firstCell = this.getSheetRelativeCell(sheet, cellEdits[0].address);
      let topRow = firstCell.row;
      let bottomRow = firstCell.row;
      let leftColumn = firstCell.column;
      let rightColumn = firstCell.column;
      cellEdits.forEach((edit) => {
        const cell = this.getSheetRelativeCell(sheet, edit.address);
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

  async deleteDiffSheet(originalSheetName: string, diffSheetName: string): Promise<void> {
    await (this.excelApi || Excel).run(async (context) => {
      const sheet = context.workbook.worksheets.getItem(originalSheetName);
      const diffSheet = context.workbook.worksheets.getItem(diffSheetName);
      sheet.activate();
      diffSheet.delete();
      await context.sync();
    });
  }

  retargetFormulaSheetReferences(sheet: SheetSnapshot, targetSheetName: string): SheetSnapshot {
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

  private async readSheetSnapshot(
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

  private async createDiffSheet(
    sheetNumber: number,
    originalSheet: SheetSnapshot,
    cellEdits: CellEdit[]
  ): Promise<{ sheetName: string; updatedSheet: SheetSnapshot }> {
    const diffSheetStartTime = Date.now();
    const sheetName = `Diff ${sheetNumber}`;
    const updatedSheet = this.applyCellEdits(originalSheet, cellEdits);
    await (this.excelApi || Excel).run(async (context) => {
      const sourceSheet = context.workbook.worksheets.getItem(originalSheet.name);
      const diffSheet = sourceSheet.copy("After", sourceSheet);
      diffSheet.name = sheetName;
      cellEdits.forEach((edit) => {
        const cell = this.getSheetRelativeCell(originalSheet, edit.address);
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

  private async createScenarioSheet(
    sheetNumber: number,
    originalSheet: SheetSnapshot,
    cellEdits: CellEdit[]
  ): Promise<string> {
    const sheetName = `Scenario ${sheetNumber}`;
    await (this.excelApi || Excel).run(async (context) => {
      const sourceSheet = context.workbook.worksheets.getItem(originalSheet.name);
      const scenarioSheet = sourceSheet.copy("After", sourceSheet);
      scenarioSheet.name = sheetName;
      cellEdits.forEach((edit) => {
        const cell = this.getSheetRelativeCell(originalSheet, edit.address);
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

  private applyCellEdits(sheet: SheetSnapshot, cellEdits: CellEdit[]): SheetSnapshot {
    const updatedFormulas = sheet.formulas.map((row) => [...row]);

    cellEdits.forEach((edit) => {
      const cell = this.getSheetRelativeCell(sheet, edit.address);
      while (updatedFormulas.length <= cell.row) {
        updatedFormulas.push([]);
      }
      while (updatedFormulas[cell.row].length <= cell.column) {
        updatedFormulas[cell.row].push(null);
      }
      updatedFormulas[cell.row][cell.column] = edit.newFormula;
    });

    const rowCount = Math.max(sheet.rowCount, updatedFormulas.length);
    const columnCount = Math.max(sheet.columnCount, this.getColumnCount(updatedFormulas));

    return {
      ...sheet,
      formulas: this.normalizeSheetData(updatedFormulas, rowCount, columnCount),
      values: this.normalizeSheetData(sheet.values, rowCount, columnCount),
      rowCount,
      columnCount,
    };
  }

  private normalizeSheetData(
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

  private getColumnCount(data: unknown[][]): number {
    return data.reduce((columnCount, row) => Math.max(columnCount, row.length), 0);
  }

  private getSheetRelativeCell(sheet: SheetSnapshot, address: string) {
    const match = /^([A-Z]+)(\d+)$/i.exec(address)!;
    return {
      row: Number(match[2]) - 1 - sheet.rowIndex,
      column: this.getColumnIndex(match[1]) - sheet.columnIndex,
    };
  }

  private getColumnIndex(label: string) {
    let index = 0;
    const upperLabel = label.toUpperCase();
    for (let i = 0; i < upperLabel.length; i++) {
      index = index * 26 + upperLabel.charCodeAt(i) - 64;
    }
    return index - 1;
  }
}
