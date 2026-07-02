// RFC 4180 CSV serialization: quote any field containing a comma, quote, or
// newline, doubling embedded quotes. Rows are LF-joined.
//
// String cells are also guarded against spreadsheet formula injection: a value
// whose first char is = + - @ (or a tab/CR) is evaluated as a formula by
// Excel/Sheets, so we neutralize it with a leading apostrophe. Numbers are
// emitted verbatim (a numeric -5 must stay numeric, not become "'-5").
function cell(v: string | number): string {
  if (typeof v === "number") return String(v);
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}
