import { SheetSnapshot } from "../../../../taskpane/pages/chat/chat-state-machine/chat-types";

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
