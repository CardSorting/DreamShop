export function serializeRowsToCsv(rows, columns) {
  const lines = [];
  
  // Add Header
  lines.push(columns.map(escapeCsvCell).join(",") + "\r\n");
  
  // Add Body Rows
  for (const row of rows) {
    const line = columns.map((column) => escapeCsvCell(row[column] ?? "")).join(",");
    lines.push(line + "\r\n");
  }

  return lines;
}

export function escapeCsvCell(value) {
  const text = String(value ?? "");
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}

export function createTimestampedCsvFilename(prefix = "dreamshop-products", now = new Date()) {
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${timestamp}.csv`;
}