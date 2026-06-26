import * as XLSX from 'xlsx';

/**
 * Parser for 山东省 普通类常规批 投档情况表 (.xls).
 *
 * Real sheet layout (verified against the 2025 第1次志愿 file, 21k+ rows):
 *   row 0: title
 *   row 1: headers ["专业代号及名称","院校代号及名称","投档计划数","最低位次"]
 *   row 2+: data    [专业(组)名称, "A001北京大学", 投档计划数, 最低位次]
 *
 * IMPORTANT: this table gives 最低位次 (rank), NOT score. Each row is one
 * 院校专业组. We aggregate to a university-level line = the program with the
 * LOWEST line (the largest 最低位次), i.e. the easiest way into the school —
 * the conventional "院校最低投档线". Score is derived later from the real
 * 一分一段表 (same official dataset), so no number is invented.
 */

export interface SchoolAggregate {
  /** School code, e.g. "A001". Used as the University id for 山东 real data. */
  schoolCode: string;
  schoolName: string;
  /** Largest 最低位次 across the school's programs = its lowest (easiest) line. */
  minRank: number;
  programCount: number;
}

/** Matches a leading school code like "A001" / "B012" in 院校代号及名称. */
const SCHOOL_RE = /^([A-Z]\d{3})(.+)$/;

/** Pure aggregator over array-of-arrays rows (unit-testable without a file). */
export function aggregateShandongSchools(rows: any[][]): SchoolAggregate[] {
  const byCode = new Map<string, SchoolAggregate>();
  for (const r of rows) {
    const school = r?.[1];
    const rank = r?.[3];
    if (
      typeof school !== 'string' ||
      typeof rank !== 'number' ||
      !Number.isFinite(rank) ||
      rank <= 0
    ) {
      continue; // skips title/header rows and malformed cells
    }
    const m = SCHOOL_RE.exec(school.trim());
    if (!m) continue;
    const code = m[1];
    const name = m[2].trim();
    const prev = byCode.get(code);
    if (!prev) {
      byCode.set(code, { schoolCode: code, schoolName: name, minRank: rank, programCount: 1 });
    } else {
      prev.minRank = Math.max(prev.minRank, rank); // easiest program = largest 位次
      prev.programCount++;
    }
  }
  // Best schools (smallest 位次) first.
  return [...byCode.values()].sort((a, b) => a.minRank - b.minRank);
}

/** Read the first sheet as array-of-arrays rows. */
export function readShandongAdmissionSheet(filePath: string): any[][] {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false });
}

/** Read the .xls and aggregate to university-level school lines. */
export function parseShandongAdmissionXls(filePath: string): SchoolAggregate[] {
  return aggregateShandongSchools(readShandongAdmissionSheet(filePath));
}

export interface SchoolMajor {
  schoolCode: string;
  majorName: string;
  /** Largest 最低位次 across this 专业's 专业组 rows = its easiest (lowest) line. */
  minRank: number;
}

/**
 * Extract program-level 专业 (with its own 最低位次) from the 投档表
 * (col 0 = 专业代号及名称, col 3 = 最低位次). The leading code is stripped to get
 * the name. Deduped per (schoolCode, majorName); when a 专业 appears under several
 * 专业组 we keep the LARGEST 位次 (the easiest instance to be admitted into it).
 */
export function extractShandongMajors(rows: any[][]): SchoolMajor[] {
  const byKey = new Map<string, SchoolMajor>();
  for (const r of rows) {
    const prog = r?.[0];
    const school = r?.[1];
    const rank = r?.[3];
    if (typeof prog !== 'string' || typeof school !== 'string') continue;
    if (typeof rank !== 'number' || !Number.isFinite(rank) || rank <= 0) continue;
    const sm = SCHOOL_RE.exec(school.trim());
    if (!sm) continue;
    const code = sm[1];
    const name = prog.trim().replace(/^[0-9A-Za-z]+/, '').trim();
    if (!name) continue;
    const key = `${code}|${name}`;
    const prev = byKey.get(key);
    if (!prev) byKey.set(key, { schoolCode: code, majorName: name, minRank: rank });
    else prev.minRank = Math.max(prev.minRank, rank);
  }
  return [...byKey.values()];
}

/** True when an id looks like a 山东 投档表 school code (so re-parsing is idempotent). */
export function isShandongSchoolCode(id: string): boolean {
  return /^[A-Z]\d{3}$/.test(id);
}
