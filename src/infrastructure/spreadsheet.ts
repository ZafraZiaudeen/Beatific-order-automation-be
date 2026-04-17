import XLSX from "xlsx";
import ValidationError from "../domain/errors/validation-error";

export type SpreadsheetRow = Record<string, string>;

export const parseSpreadsheetBuffer = (buffer: Buffer, filename: string) => {
  if (!buffer?.length) {
    throw new ValidationError("Uploaded file is empty");
  }

  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    raw: false,
  });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new ValidationError(`No worksheets found in ${filename}`);
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  if (!rawRows.length) {
    throw new ValidationError(`No rows found in ${filename}`);
  }

  return rawRows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key.trim(), String(value ?? "").trim()])
    )
  );
};

export const normalizeHeader = (header: string) =>
  header.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
