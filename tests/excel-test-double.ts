import type { ExcelApi } from "../src/taskpane-fsm/pages/chat/chat-window/excel-manager";

export type ExcelTestWorkbookInput = {
  activeSheetName: string;
  sheets: Record<string, ExcelTestSheetInput>;
};

export type ExcelTestSheetInput = {
  formulas: unknown[][];
  values?: unknown[][];
  rowIndex?: number;
  columnIndex?: number;
};

export type ExcelTestSheetState = {
  name: string;
  formulas: unknown[][];
  values: unknown[][];
  rowIndex: number;
  columnIndex: number;
  formats: Record<string, ExcelTestCellFormat>;
};

export type ExcelTestWorkbookState = {
  activeSheetName: string;
  sheets: ExcelTestSheetState[];
};

export type ExcelTestCellFormat = {
  fillColor?: string;
};

type SheetState = ExcelTestSheetState;

export function createExcelTestWorkbook(input: ExcelTestWorkbookInput) {
  return new ExcelTestWorkbook(input);
}

class ExcelTestWorkbook {
  readonly worksheets: ExcelTestWorksheetCollection;

  readonly excelApi: ExcelApi = {
    run: async (callback) =>
      callback({
        workbook: this,
        sync: async () => {},
      } as unknown as Excel.RequestContext),
  };

  constructor(input: ExcelTestWorkbookInput) {
    this.worksheets = new ExcelTestWorksheetCollection(input);
  }

  getActiveSheetName() {
    return this.worksheets.getActiveSheetName();
  }

  getSheet(name: string): ExcelTestSheetState {
    return copySheetState(this.worksheets.getSheetState(name));
  }

  getWorkbookState(): ExcelTestWorkbookState {
    return {
      activeSheetName: this.worksheets.getActiveSheetName(),
      sheets: this.worksheets.getSheetStates(),
    };
  }

  hasSheet(name: string) {
    return this.worksheets.hasSheet(name);
  }

  getCellFormat(sheetName: string, address: string): ExcelTestCellFormat {
    return { ...this.worksheets.getSheetState(sheetName).formats[address] };
  }
}

class ExcelTestWorksheetCollection {
  private activeSheetName: string;
  private sheets: Record<string, SheetState>;
  private nextCopiedSheetNumber = 1;

  constructor(input: ExcelTestWorkbookInput) {
    this.activeSheetName = input.activeSheetName;
    this.sheets = {};

    Object.entries(input.sheets).forEach(([name, sheet]) => {
      this.sheets[name] = {
        name,
        formulas: cloneSheet(sheet.formulas),
        values: cloneSheet(sheet.values || sheet.formulas),
        rowIndex: sheet.rowIndex || 0,
        columnIndex: sheet.columnIndex || 0,
        formats: {},
      };
    });
  }

  getActiveWorksheet() {
    return new ExcelTestWorksheet(this, this.getSheetState(this.activeSheetName));
  }

  getItem(name: string) {
    return new ExcelTestWorksheet(this, this.getSheetState(name));
  }

  add(name: string) {
    this.sheets[name] = {
      name,
      formulas: [],
      values: [],
      rowIndex: 0,
      columnIndex: 0,
      formats: {},
    };
    return new ExcelTestWorksheet(this, this.sheets[name]);
  }

  copySheet(sourceSheet: SheetState) {
    const sheet: SheetState = {
      name: `Copied Sheet ${this.nextCopiedSheetNumber}`,
      formulas: cloneSheet(sourceSheet.formulas),
      values: cloneSheet(sourceSheet.values),
      rowIndex: sourceSheet.rowIndex,
      columnIndex: sourceSheet.columnIndex,
      formats: { ...sourceSheet.formats },
    };
    this.nextCopiedSheetNumber++;
    this.sheets[sheet.name] = sheet;
    return new ExcelTestWorksheet(this, sheet);
  }

  renameSheet(sheet: SheetState, name: string) {
    delete this.sheets[sheet.name];
    sheet.name = name;
    this.sheets[name] = sheet;
  }

  getActiveSheetName() {
    return this.activeSheetName;
  }

  hasSheet(name: string) {
    return this.sheets[name] !== undefined;
  }

  activateSheet(name: string) {
    this.activeSheetName = name;
  }

  deleteSheet(name: string) {
    delete this.sheets[name];
  }

  getSheetState(name: string) {
    return this.sheets[name];
  }

  getSheetStates() {
    return Object.values(this.sheets).map(copySheetState);
  }
}

class ExcelTestWorksheet {
  constructor(
    private worksheets: ExcelTestWorksheetCollection,
    private sheet: SheetState
  ) {}

  get name() {
    return this.sheet.name;
  }

  set name(name: string) {
    this.worksheets.renameSheet(this.sheet, name);
  }

  load() {}

  getUsedRange() {
    return new ExcelTestRange(
      this.sheet,
      this.sheet.rowIndex,
      this.sheet.columnIndex,
      this.sheet.formulas.length,
      getColumnCount(this.sheet.formulas)
    );
  }

  getCell(row: number, column: number) {
    return new ExcelTestRange(this.sheet, row, column, 1, 1);
  }

  getRangeByIndexes(row: number, column: number, rowCount: number, columnCount: number) {
    return new ExcelTestRange(this.sheet, row, column, rowCount, columnCount);
  }

  copy() {
    return this.worksheets.copySheet(this.sheet);
  }

  activate() {
    this.worksheets.activateSheet(this.sheet.name);
  }

  delete() {
    this.worksheets.deleteSheet(this.sheet.name);
  }
}

class ExcelTestRange {
  readonly format: {
    fill: { color: string };
    autofitColumns(): void;
  };

  constructor(
    private sheet: SheetState,
    readonly rowIndex: number,
    readonly columnIndex: number,
    readonly rowCount: number,
    readonly columnCount: number
  ) {
    this.format = {
      fill: {
        set color(color: string) {
          const address = getCellAddress(rowIndex, columnIndex);
          sheet.formats[address] = {
            ...sheet.formats[address],
            fillColor: color,
          };
        },
      },
      autofitColumns() {},
    };
  }

  load() {}

  clear() {
    writeRange(
      this.sheet.formulas,
      this.rowIndex - this.sheet.rowIndex,
      this.columnIndex - this.sheet.columnIndex,
      createEmptySheet(this.rowCount, this.columnCount)
    );
    writeRange(
      this.sheet.values,
      this.rowIndex - this.sheet.rowIndex,
      this.columnIndex - this.sheet.columnIndex,
      createEmptySheet(this.rowCount, this.columnCount)
    );
  }

  get values() {
    return readRange(
      this.sheet.values,
      this.rowIndex - this.sheet.rowIndex,
      this.columnIndex - this.sheet.columnIndex,
      this.rowCount,
      this.columnCount
    );
  }

  set values(value: unknown[][]) {
    writeRange(
      this.sheet.values,
      this.rowIndex - this.sheet.rowIndex,
      this.columnIndex - this.sheet.columnIndex,
      value
    );
  }

  get formulas() {
    return readRange(
      this.sheet.formulas,
      this.rowIndex - this.sheet.rowIndex,
      this.columnIndex - this.sheet.columnIndex,
      this.rowCount,
      this.columnCount
    );
  }

  set formulas(value: unknown[][]) {
    const rowIndex = this.rowIndex - this.sheet.rowIndex;
    const columnIndex = this.columnIndex - this.sheet.columnIndex;
    writeRange(this.sheet.formulas, rowIndex, columnIndex, value);
    value.forEach((row, rowOffset) => {
      row.forEach((cell, columnOffset) => {
        if (typeof cell !== "string" || !cell.startsWith("=")) {
          writeRange(this.sheet.values, rowIndex + rowOffset, columnIndex + columnOffset, [[cell]]);
        }
      });
    });
  }

  getCell(row: number, column: number) {
    return new ExcelTestRange(this.sheet, this.rowIndex + row, this.columnIndex + column, 1, 1);
  }

  getResizedRange(deltaRows: number, deltaColumns: number) {
    return new ExcelTestRange(
      this.sheet,
      this.rowIndex,
      this.columnIndex,
      deltaRows + 1,
      deltaColumns + 1
    );
  }

  select() {}
}

function readRange(
  data: unknown[][],
  row: number,
  column: number,
  rowCount: number,
  columnCount: number
) {
  const result: unknown[][] = [];

  for (let r = 0; r < rowCount; r++) {
    result.push([]);
    for (let c = 0; c < columnCount; c++) {
      result[r].push(data[row + r]?.[column + c] ?? null);
    }
  }

  return result;
}

function writeRange(data: unknown[][], row: number, column: number, value: unknown[][]) {
  for (let r = 0; r < value.length; r++) {
    while (data.length <= row + r) {
      data.push([]);
    }
    for (let c = 0; c < value[r].length; c++) {
      while (data[row + r].length <= column + c) {
        data[row + r].push(null);
      }
      data[row + r][column + c] = value[r][c];
    }
  }
}

function createEmptySheet(rowCount: number, columnCount: number) {
  const sheet: null[][] = [];

  for (let row = 0; row < rowCount; row++) {
    sheet.push([]);
    for (let column = 0; column < columnCount; column++) {
      sheet[row].push(null);
    }
  }

  return sheet;
}

function cloneSheet(sheet: unknown[][]): unknown[][] {
  return sheet.map((row) => [...row]);
}

function copySheetState(sheet: SheetState): ExcelTestSheetState {
  return {
    name: sheet.name,
    formulas: cloneSheet(sheet.formulas),
    values: cloneSheet(sheet.values),
    rowIndex: sheet.rowIndex,
    columnIndex: sheet.columnIndex,
    formats: Object.fromEntries(
      Object.entries(sheet.formats).map(([address, format]) => [address, { ...format }])
    ),
  };
}

function getColumnCount(data: unknown[][]): number {
  return data.reduce((columnCount, row) => Math.max(columnCount, row.length), 0);
}

function getCellAddress(row: number, column: number) {
  return `${getColumnLabel(column)}${row + 1}`;
}

function getColumnLabel(index: number) {
  let label = "";
  let temp = index;
  while (temp >= 0) {
    label = String.fromCharCode((temp % 26) + 65) + label;
    temp = Math.floor(temp / 26) - 1;
  }
  return label;
}
