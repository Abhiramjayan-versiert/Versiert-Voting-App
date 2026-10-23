import ExcelJS from "exceljs";

/** Neutralises spreadsheet formula injection (=, +, -, @, tab, CR) in any text cell. */
export function safeCell(v: unknown): string | number | Date | null {
  if (v == null) return null;
  if (typeof v === "number" || v instanceof Date) return v;
  const s = String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export function toCsv(headers: string[], rows: unknown[][]) {
  const esc = (v: unknown) => {
    const s = v instanceof Date ? v.toISOString() : String(safeCell(v) ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

export type SheetSpec = { name: string; columns: { header: string; width?: number; numFmt?: string }[]; rows: unknown[][] };

export async function buildWorkbook(sheets: SheetSpec[], meta: { title: string }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "V.app"; wb.created = new Date(); wb.title = meta.title;
  for (const s of sheets) {
    const name = s.name.replace(/[\\/*?:[\]]/g, " ").slice(0, 31);
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = s.columns.map((c) => ({ header: c.header, width: c.width ?? Math.max(12, c.header.length + 4), style: c.numFmt ? { numFmt: c.numFmt } : {} }));
    for (const r of s.rows) ws.addRow(r.map(safeCell));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: "FF080808" } };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6F36B" } };
    head.alignment = { vertical: "middle" };
    if (s.rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.columns.length } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
