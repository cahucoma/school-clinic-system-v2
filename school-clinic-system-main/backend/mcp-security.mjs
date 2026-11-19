const PRIVATE_COLUMNS = /\b(password_hash|email|profile_picture_url|student_number|dob|contact_number|diagnosis|prescription|notes|message|reason)\b/i;
const UNSAFE_SQL = /\b(insert|update|delete|drop|alter|create|replace|truncate|grant|revoke|call|into|outfile|dumpfile|sleep|benchmark|load_file|get_lock|release_lock)\b|\bfor\s+update\b|\block\b/i;

export function validateReadOnlyQuery(sql) {
  if (typeof sql !== "string") {
    throw new Error("Provide one read-only SELECT query.");
  }

  const cleaned = sql.trim();
  if (!/^select\b/i.test(cleaned)
      || /[;#]|--|\/\*/.test(cleaned)
      || UNSAFE_SQL.test(cleaned)
      || PRIVATE_COLUMNS.test(cleaned)) {
    throw new Error("Only a single read-only SELECT without private fields is allowed.");
  }

  const limitMatch = cleaned.match(/\blimit\s+(\d+)(?:\s*,\s*(\d+))?\s*$/i);
  if (/\blimit\b/i.test(cleaned) && !limitMatch) {
    throw new Error("Use a final LIMIT clause with a literal row count.");
  }
  if (limitMatch) {
    const rowCount = Number(limitMatch[2] || limitMatch[1]);
    if (rowCount > 100 || Number(limitMatch[2] ? limitMatch[1] : 0) > 10000) {
      throw new Error("Queries are limited to 100 rows.");
    }
    return cleaned;
  }

  return `${cleaned} LIMIT 100`;
}

export function redactPrivateColumns(rows) {
  return rows.map((row) => Object.fromEntries(
    Object.entries(row).map(([column, value]) => [
      column,
      PRIVATE_COLUMNS.test(column) ? "[REDACTED]" : value,
    ]),
  ));
}
