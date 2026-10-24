import * as XLSX from "@e965/xlsx";
import { normalizeEmail, normalizeStudentId } from "./email-normalize";

export type Mapping = { email: number; name?: number | null; studentId?: number | null; group?: number | null };
export type ParsedSheet = { headers: string[]; rows: string[][]; sheetName: string; truncated: boolean };
export type ImportRowError = { row: number; reason: string; raw: Record<string, string> };
export type ValidatedImport = {
  total: number;
  accepted: { email: string; name: string | null; studentId: string | null; group: string | null; row: number }[];
  rejected: ImportRowError[];
  duplicates: number;
};

export class ImportError extends Error {}

export function detectKind(buf: Uint8Array, filename: string): "xlsx" | "xls" | "csv" {
  const ext = filename.toLowerCase().split(".").pop();
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  const isOle = buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
  if (ext === "xlsx" && isZip) return "xlsx";
  if (ext === "xls" && isOle) return "xls";
  if (ext === "csv" && !isZip && !isOle) {
    // Reject binary content masquerading as CSV.
    const head = buf.subarray(0, 4096);
    if (head.some((b) => b === 0 || (b < 9))) throw new ImportError("The CSV file contains binary data.");
    return "csv";
  }
  throw new ImportError("Unsupported file. Upload a .xlsx, .xls or .csv file (the extension must match the content).");
}

const clean = (v: unknown) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, 300);

export function parseSpreadsheet(buf: Uint8Array, filename: string, maxRows: number): ParsedSheet {
  const kind = detectKind(buf, filename);
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength), {
      type: "buffer", cellFormula: false, cellHTML: false, cellStyles: false, bookVBA: false,
      sheetRows: maxRows + 2, raw: kind === "csv", codepage: 65001, WTF: false,
    });
  } catch {
    throw new ImportError("The file could not be read. Make sure it is a valid, unprotected spreadsheet.");
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new ImportError("The workbook has no sheets.");
  const data = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: false, defval: "", blankrows: false });
  if (data.length === 0) throw new ImportError("The sheet is empty.");
  const width = Math.min(50, Math.max(...data.slice(0, 50).map((r) => r.length)));
  const headers = Array.from({ length: width }, (_, i) => clean(data[0][i]) || `Column ${i + 1}`);
  const body = data.slice(1).map((r) => Array.from({ length: width }, (_, i) => clean(r[i])));
  return { headers, rows: body.slice(0, maxRows), sheetName, truncated: body.length > maxRows };
}

export function guessMapping(headers: string[]): Partial<Mapping> {
  const find = (re: RegExp) => { const i = headers.findIndex((h) => re.test(h.toLowerCase())); return i >= 0 ? i : null; };
  return {
    email: find(/e-?mail/) ?? undefined,
    name: find(/^(full\s*)?name|student\s*name/),
    studentId: find(/(student|roll|reg|admission|enrol).*(id|no|num)|^id$|roll/),
    group: find(/(group|dept|department|branch|class|batch|year|stream)/),
  };
}

export function validateRows(sheet: ParsedSheet, m: Mapping): ValidatedImport {
  if (m.email == null || m.email < 0 || m.email >= sheet.headers.length) throw new ImportError("Choose which column contains email addresses.");
  if (m.studentId == null || m.studentId < 0 || m.studentId >= sheet.headers.length) throw new ImportError("Choose which column contains student IDs — students verify with their email and student ID.");
  const seen = new Set<string>();
  const seenIds = new Set<string>();
  const out: ValidatedImport = { total: sheet.rows.length, accepted: [], rejected: [], duplicates: 0 };
  sheet.rows.forEach((r, i) => {
    const row = i + 2; // header is row 1
    const raw = Object.fromEntries(sheet.headers.map((h, j) => [h, r[j] ?? ""]));
    const rawEmail = r[m.email];
    if (!rawEmail) { out.rejected.push({ row, reason: "Missing email address", raw }); return; }
    const email = normalizeEmail(rawEmail);
    if (!email) { out.rejected.push({ row, reason: "Invalid email format", raw }); return; }
    if (seen.has(email)) { out.duplicates++; out.rejected.push({ row, reason: "Duplicate of an earlier row", raw }); return; }
    const sid = normalizeStudentId(r[m.studentId!]);
    if (!sid) { out.rejected.push({ row, reason: "Missing student ID", raw }); return; }
    if (sid.length < 3) { out.rejected.push({ row, reason: "Student ID is too short (minimum 3 characters)", raw }); return; }
    if (seenIds.has(sid)) { out.duplicates++; out.rejected.push({ row, reason: "Student ID already used by an earlier row", raw }); return; }
    seen.add(email); seenIds.add(sid);
    const pick = (k?: number | null) => (k == null || k < 0 ? null : r[k] || null);
    out.accepted.push({ email, name: pick(m.name), studentId: sid, group: pick(m.group), row });
  });
  return out;
}
