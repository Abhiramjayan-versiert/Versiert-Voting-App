import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseSpreadsheet, validateRows, guessMapping, detectKind, ImportError } from "@/lib/imports";
import { safeCell, toCsv, buildWorkbook } from "@/lib/exports";

const csv = (s: string) => new TextEncoder().encode(s);

describe("spreadsheet import", () => {
  it("guesses column mapping", () => {
    expect(guessMapping(["Roll No", "Student Name", "E-mail", "Department"])).toEqual({ email: 2, name: 1, studentId: 0, group: 3 });
  });
  it("validates rows: missing, invalid, duplicate, domain", () => {
    const sheet = parseSpreadsheet(csv("Name,Email,Roll\nA,a@college.edu,r 01\nB,,R02\nC,not-an-email,R03\nD,A@College.edu,R04\nE,e@gmail.com,R05\nF,f@college.edu,R06\nG,g@college.edu,\nH,h@college.edu,r01\nI,i@college.edu,X1"), "list.csv", 100);
    const v = validateRows(sheet, { email: 1, name: 0, studentId: 2 });
    expect(v.total).toBe(9);
    // Any email provider is fine (gmail included): eligibility = being on the uploaded list.
    expect(v.accepted.map((a) => [a.email, a.studentId])).toEqual([["a@college.edu", "R01"], ["e@gmail.com", "R05"], ["f@college.edu", "R06"]]);
    expect(v.duplicates).toBe(2);
    expect(v.rejected.map((r) => [r.row, r.reason.split(" ")[0]])).toEqual([[3, "Missing"], [4, "Invalid"], [5, "Duplicate"], [8, "Missing"], [9, "Student"], [10, "Student"]]);
  });
  it("reads xlsx and does not evaluate formulas", async () => {
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Voters");
    ws.addRow(["Email", "Name"]); ws.addRow(["x@college.edu", { formula: "1+1", result: 2 }]); ws.addRow(["=HYPERLINK(\"http://evil\")", "Y"]);
    const buf = new Uint8Array(await wb.xlsx.writeBuffer());
    const s = parseSpreadsheet(buf, "v.xlsx", 100);
    expect(s.headers).toEqual(["Email", "Name"]);
    expect(s.rows[0][0]).toBe("x@college.edu");
    expect(() => validateRows(s, { email: 0 })).toThrow(/student IDs/);
  });
  it("rejects disguised and binary files", () => {
    expect(() => detectKind(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "list.csv")).toThrow(ImportError);
    expect(() => detectKind(csv("MZ\u0000\u0001binary"), "list.csv")).toThrow(ImportError);
    expect(() => detectKind(csv("a,b"), "list.exe")).toThrow(ImportError);
    expect(() => detectKind(csv("not a zip"), "list.xlsx")).toThrow(ImportError);
  });
  it("caps rows", () => {
    const body = "Email\n" + Array.from({ length: 50 }, (_, i) => `s${i}@c.edu`).join("\n");
    const s = parseSpreadsheet(csv(body), "big.csv", 10);
    expect(s.rows).toHaveLength(10);
    expect(s.truncated).toBe(true);
  });
});

describe("export safety", () => {
  it("neutralises formula injection", () => {
    for (const bad of ["=1+1", "+cmd", "-2+3", "@SUM(A1)", "\t=x", "\r=x"]) expect(String(safeCell(bad)).startsWith("'")).toBe(true);
    expect(safeCell("Normal name")).toBe("Normal name");
    expect(safeCell(42)).toBe(42);
  });
  it("produces RFC-4180 CSV with BOM", () => {
    const out = toCsv(["a", "b"], [["x,y", '"q"'], ["=evil", 3]]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toContain('"x,y","""q"""');
    expect(out).toContain("'=evil,3");
  });
  it("builds a workbook with frozen, filtered headers", async () => {
    const buf = await buildWorkbook([{ name: "Results/Test?", columns: [{ header: "Name" }, { header: "Votes" }], rows: [["=bad", 5]] }], { title: "t" });
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as never);
    const ws = wb.worksheets[0];
    expect(ws.name).toBe("Results Test ");
    expect(ws.getCell("A2").value).toBe("'=bad");
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(ws.autoFilter).toBeTruthy();
  });
});
