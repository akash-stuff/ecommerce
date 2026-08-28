/**
 * CSV built in the browser from data already on screen.
 *
 * Client-side on purpose: an export of the Overview should be exactly the
 * figures the person is looking at, for the range they picked. Recomputing it
 * server-side would introduce a second source of truth that can disagree with
 * the page — which is the bug an export is most likely to be blamed for.
 */

/**
 * One cell, quoted and defused.
 *
 * A leading `=`, `+`, `-` or `@` makes Excel and Sheets treat the cell as a
 * formula and run it on open. Store names, product names and customer emails
 * all reach these exports and are all typed in by someone else, so this is a
 * live injection path into the spreadsheet of whoever opens the file.
 *
 * Mirrors `csvCell` in the backend's newsletter service; both exist because
 * exports are produced on both sides and neither should be the unsafe one.
 */
export function csvCell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** A row of already-stringified values, joined. */
export function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(',');
}

/**
 * Hands the file to the browser.
 *
 * The BOM is what makes Excel open UTF-8 correctly; without it a rupee sign or
 * an accented store name arrives as mojibake. CRLF per RFC 4180.
 */
export function downloadCsv(filename: string, lines: string[]): void {
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** `overview-2026-08-27.csv` — sortable, and says what it is. */
export function datedFilename(prefix: string): string {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;
}
