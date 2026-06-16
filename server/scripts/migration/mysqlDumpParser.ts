import { readFileSync } from 'node:fs';

/**
 * Minimal, tolerant parser for the legacy phpMyAdmin MySQL dump.
 *
 * The dump uses backslash escaping inside single-quoted string literals
 * (\' \" \\ \n \r \t) and stores some columns as embedded JSON blobs. We only
 * need a handful of tables, so rather than spinning up a MySQL server we scan
 * the INSERT statements directly and return rows as plain string maps.
 */

export type LegacyRow = Record<string, string | null>;

let cachedSql: string | null = null;

function loadSql(dumpPath: string): string {
  if (!cachedSql) {
    cachedSql = readFileSync(dumpPath, 'utf8');
  }
  return cachedSql;
}

function unescapeString(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === '\\' && i + 1 < raw.length) {
      const next = raw[i + 1];
      i += 1;
      switch (next) {
        case 'n':
          out += '\n';
          break;
        case 'r':
          out += '\r';
          break;
        case 't':
          out += '\t';
          break;
        case '0':
          out += '\0';
          break;
        case 'b':
          out += '\b';
          break;
        case 'Z':
          out += '\x1a';
          break;
        default:
          // \' \" \\ and anything else: keep the literal character.
          out += next;
      }
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Parse one VALUES tuple region starting at `start` (the index of the first
 * "(" of the first tuple). Returns the parsed tuples and the index just past
 * the terminating ";".
 */
function parseTuples(sql: string, start: number): { tuples: (string | null)[][]; end: number } {
  const tuples: (string | null)[][] = [];
  let i = start;
  const len = sql.length;

  while (i < len) {
    // Skip whitespace and commas between tuples.
    while (i < len && /[\s,]/.test(sql[i])) i += 1;
    if (i >= len) break;
    if (sql[i] === ';') {
      i += 1;
      break;
    }
    if (sql[i] !== '(') {
      // Unexpected token; stop to avoid runaway parsing.
      break;
    }
    i += 1; // consume "("

    const values: (string | null)[] = [];
    let current = '';
    let inString = false;
    let isNullToken = false;
    let started = false;

    while (i < len) {
      const ch = sql[i];

      if (inString) {
        if (ch === '\\') {
          current += ch + (sql[i + 1] ?? '');
          i += 2;
          continue;
        }
        if (ch === "'") {
          inString = false;
          i += 1;
          continue;
        }
        current += ch;
        i += 1;
        continue;
      }

      if (ch === "'") {
        inString = true;
        started = true;
        i += 1;
        continue;
      }
      if (ch === ',') {
        values.push(isNullToken ? null : unescapeString(current));
        current = '';
        isNullToken = false;
        started = false;
        i += 1;
        continue;
      }
      if (ch === ')') {
        values.push(isNullToken ? null : unescapeString(current));
        i += 1;
        break;
      }
      // Unquoted token (number / NULL).
      if (/\s/.test(ch) && !started) {
        i += 1;
        continue;
      }
      const token = ch + current;
      void token;
      // Accumulate raw unquoted token chars.
      if (!started) {
        // Peek the unquoted run.
        let j = i;
        let raw = '';
        while (j < len && sql[j] !== ',' && sql[j] !== ')') {
          raw += sql[j];
          j += 1;
        }
        const trimmed = raw.trim();
        if (trimmed.toUpperCase() === 'NULL') {
          isNullToken = true;
          current = '';
        } else {
          current = trimmed;
        }
        started = true;
        i = j;
        continue;
      }
      i += 1;
    }

    tuples.push(values);
  }

  return { tuples, end: i };
}

function extractColumns(headerSegment: string): string[] {
  const match = headerSegment.match(/\(([^)]*)\)\s*VALUES/i);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((c) => c.trim().replace(/^`|`$/g, ''));
}

/**
 * Parse all rows for a given table out of the dump.
 */
export function parseTable(dumpPath: string, table: string): LegacyRow[] {
  const sql = loadSql(dumpPath);
  const rows: LegacyRow[] = [];
  const insertMarker = new RegExp(`INSERT INTO \`${table}\`\\s*\\(`, 'g');

  let match: RegExpExecArray | null;
  while ((match = insertMarker.exec(sql)) !== null) {
    const headerStart = match.index;
    const valuesIdx = sql.indexOf('VALUES', headerStart);
    if (valuesIdx === -1) continue;
    const header = sql.slice(headerStart, valuesIdx + 'VALUES'.length);
    const columns = extractColumns(header);
    if (columns.length === 0) continue;

    const tupleStart = sql.indexOf('(', valuesIdx);
    if (tupleStart === -1) continue;

    const { tuples, end } = parseTuples(sql, tupleStart);
    for (const tuple of tuples) {
      if (tuple.length === 0) continue;
      const row: LegacyRow = {};
      columns.forEach((col, idx) => {
        row[col] = idx < tuple.length ? tuple[idx] : null;
      });
      rows.push(row);
    }
    insertMarker.lastIndex = end;
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

/** Parse a MySQL timestamp ("YYYY-MM-DD HH:MM:SS"); returns null for the zero date. */
export function parseTimestamp(value: string | null): Date | null {
  if (!value) return null;
  if (value.startsWith('0000-00-00')) return null;
  const iso = value.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parse a legacy date string. Handles "MM/DD/YYYY" and ISO-ish fallbacks. */
export function parseLegacyDate(value: string | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('0000-00-00')) return null;

  const mdy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    let [, mm, dd, yyyy] = mdy;
    let year = Number(yyyy);
    if (year < 100) year += 2000;
    const month = Number(mm);
    const day = Number(dd);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return new Date(Date.UTC(year, month - 1, day));
  }

  const ts = parseTimestamp(trimmed);
  if (ts) return new Date(Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate()));
  return null;
}

/** Parse a numeric string; returns null for empty/invalid/non-positive-required values. */
export function num(value: string | null): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Like num() but treats 0 as "no data" (legacy uses 0 for unmeasured fields). */
export function numPositive(value: string | null): number | null {
  const n = num(value);
  if (n === null || n <= 0) return null;
  return n;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string | null): boolean {
  if (!value) return false;
  return EMAIL_RE.test(value.trim());
}

export function splitName(name: string | null): { firstName: string; lastName: string } {
  const cleaned = (name ?? '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return { firstName: 'Member', lastName: 'Unknown' };
  const parts = cleaned.split(' ');
  const firstName = parts.shift() as string;
  const lastName = parts.join(' ') || 'Unknown';
  return { firstName, lastName };
}
