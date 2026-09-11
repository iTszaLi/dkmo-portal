// Shared file-parsing helpers for the data import wizards (TXT / CSV / XLSX).

export function detectDelimiter(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const counts: Array<[string, number]> = [
    ["\t", (line.match(/\t/g) ?? []).length],
    [",", (line.match(/,/g) ?? []).length],
    [";", (line.match(/;/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![1] > 0 ? counts[0]![0] : "\t";
}

export function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let cell = "", row: string[] = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

function decodeText(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf);
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(buf);
  let nuls = 0;
  const sample = Math.min(bytes.length, 2000);
  for (let i = 0; i < sample; i++) if (bytes[i] === 0) nuls++;
  if (nuls > sample / 10) return new TextDecoder("utf-16le").decode(buf);
  return new TextDecoder("utf-8").decode(buf);
}

export async function parseImportFile(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const buf = await file.arrayBuffer();
    const head = new Uint8Array(buf.slice(0, 4));
    if (head[0] === 0xd0 && head[1] === 0xcf) {
      throw new Error("Legacy .xls files are not supported. Save the workbook as .xlsx and try again.");
    }
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const rows: string[][] = [];
    ws.eachRow((r) => {
      const vals: string[] = [];
      r.eachCell({ includeEmpty: true }, (cell) => {
        const v = cell.value;
        if (v == null) vals.push("");
        else if (v instanceof Date) vals.push(v.toISOString().slice(0, 10));
        else if (typeof v === "object" && "text" in v) vals.push(String((v as { text: unknown }).text));
        else if (typeof v === "object" && "result" in v) vals.push(String((v as { result: unknown }).result ?? ""));
        else vals.push(String(v));
      });
      if (vals.some((x) => x.trim())) rows.push(vals);
    });
    return rows;
  }
  const text = decodeText(await file.arrayBuffer());
  return parseDelimited(text, detectDelimiter(text));
}
