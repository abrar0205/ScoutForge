/** Small RFC 4180 CSV reader/writer (quoted fields, embedded commas and newlines). */
export function parseCsv(text) {
  const s = String(text ?? '').replace(/^﻿/, '');
  const delim = sniffDelimiter(s);
  const rows = [];
  let row = [], field = '', i = 0, q = false;
  while (i < s.length) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { q = true; i++; continue; }
    if (c === delim) { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((x) => x.trim() !== ''));
  if (!nonEmpty.length) return { headers: [], records: [] };
  const headers = nonEmpty[0].map((h) => h.trim());
  const records = nonEmpty.slice(1).map((r) => Object.fromEntries(headers.map((h, j) => [h, (r[j] ?? '').trim()])));
  return { headers, records, delimiter: delim };
}
function sniffDelimiter(s) {
  const first = s.split(/\r?\n/, 1)[0] || '';
  const counts = [',', ';', '\t'].map((d) => [d, first.split(d).length]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 1 ? counts[0][0] : ',';
}
/** Writes CSV; cells starting with = + - @ are prefixed with ' to prevent spreadsheet formula injection. */
export function toCsv(headers, records) {
  const esc = (v) => {
    let t = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return /[",\n\r;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [headers.map(esc).join(','), ...records.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\r\n') + '\r\n';
}
