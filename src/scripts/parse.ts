/**
 * Parse downloaded raw official files into the CSV schemas that RealFetcher reads.
 *
 * v0 handles 山东:
 *   - 一分一段表 (.xls)        → rank-tables.csv      (real 位次)
 *   - 投档情况表 (.xls)        → admission-lines.csv  (real 院校投档线)
 *                              + universities.csv     (generated school entries)
 *
 * Score is derived from the real 一分一段 (rank→score), so no number is invented.
 * Idempotent: each step replaces only the rows it owns and keeps the rest.
 *
 * Usage: pnpm parse   (run `pnpm download` first to fetch the raw files)
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseCsv } from '../lib/data/fetchers/realSource';
import { parseShandongRankXls, type RankCsvRow } from '../lib/data/parsers/shandongRankXls';
import {
  aggregateShandongSchools,
  extractShandongMajors,
  readShandongAdmissionSheet,
  isShandongSchoolCode,
} from '../lib/data/parsers/shandongAdmissionXls';
import { parseShandongProvincialPdf } from '../lib/data/parsers/shandongProvincialPdf';
import { metaForSchool } from '../lib/data/reference/universityMeta';
import { rankToScore } from '../lib/domain/rankConversion';
import type { RankTable } from '../lib/domain/types';

const CWD = process.cwd();
const DIR = path.join(CWD, 'data/sources');
const RANK_CSV = path.join(DIR, 'rank-tables.csv');
const ADM_CSV = path.join(DIR, 'admission-lines.csv');
const UNI_CSV = path.join(DIR, 'universities.csv');
const MAJORS_CSV = path.join(DIR, 'majors.csv');
const MANIFEST = path.join(DIR, 'raw/manifest.json');

const UNI_HEADER =
  'id,name,city,province,cityTier,region,tags,facultySummary,keyDisciplines,facultyRating,envCampus,envTeaching,envDormitory,transferDifficulty,transferPolicy';

async function findRaw(province: string, type: string, ext: RegExp): Promise<string | null> {
  try {
    const m = JSON.parse(await fs.readFile(MANIFEST, 'utf8'));
    const hit = (m.files as any[]).find(
      (f) => f.province === province && f.type === type && ext.test(f.savedAs),
    );
    return hit?.savedAs ?? null;
  } catch {
    return null;
  }
}

async function readCsv(p: string): Promise<Record<string, string>[]> {
  try {
    return parseCsv(await fs.readFile(p, 'utf8'));
  } catch {
    return [];
  }
}

/** CSV-escape a cell (quote if it contains a comma/quote/newline). */
function cell(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function writeCsv(p: string, header: string, rows: string[][]): Promise<void> {
  const body = rows.map((r) => r.map(cell).join(','));
  await fs.writeFile(p, [header, ...body].join('\n') + '\n');
}

async function parseRankTable(): Promise<RankCsvRow[] | null> {
  const rel = await findRaw('shandong', 'rank-table', /\.xlsx?$/i);
  if (!rel) {
    console.warn('[parse] no 山东 rank-table .xls in manifest — skipping rank step.');
    return null;
  }
  const parsed = parseShandongRankXls(path.join(CWD, rel), 2025);
  console.log(`[parse] 山东 一分一段: ${parsed.length} 段 (score ${parsed[0]?.score}..${parsed[parsed.length - 1]?.score})`);

  const existing = (await readCsv(RANK_CSV)).map((r) => [
    r.province,
    r.year,
    r.track,
    r.score,
    r.cumulativeRank,
    r.source,
  ]);
  const kept = existing.filter(
    (r) => !(r[0] === '山东' && Number(r[1]) === 2025 && r[2] === '综合'),
  );
  const fresh = parsed.map((p) => [p.province, p.year, p.track, p.score, p.cumulativeRank, p.source]);
  await writeCsv(RANK_CSV, 'province,year,track,score,cumulativeRank,source', [...kept, ...fresh] as any);
  console.log(`[parse] → rank-tables.csv (kept ${kept.length}, +${fresh.length} 山东)`);
  return parsed;
}

async function parseAdmission(rankRows: RankCsvRow[] | null): Promise<void> {
  const rel = await findRaw('shandong', 'admission-lines', /\.xlsx?$/i);
  if (!rel) {
    console.warn('[parse] no 山东 投档 .xls in manifest — skipping admission step.');
    return;
  }
  if (!rankRows || rankRows.length === 0) {
    console.warn('[parse] need the 山东 一分一段 (for rank→score) — run with the rank-table present.');
    return;
  }

  // Read the sheet once → aggregate school lines AND extract program-level majors.
  const sheetRows = readShandongAdmissionSheet(path.join(CWD, rel));
  const schools = aggregateShandongSchools(sheetRows);
  const majors = extractShandongMajors(sheetRows);
  console.log(
    `[parse] 山东 投档: ${schools.length} 所院校, ${majors.length} 个专业 (from 院校专业组).`,
  );

  // Build a RankTable from the parsed 一分一段 for accurate rank→score conversion.
  const rankTable: RankTable = {
    id: '山东:2025:综合',
    province: '山东',
    year: 2025,
    track: '综合',
    buckets: rankRows.map((r) => ({ score: r.score, cumulativeRank: r.cumulativeRank })),
    source: 'real',
    lastUpdatedAt: new Date().toISOString(),
  };

  const admRows = schools.map((s) => {
    const minScore = rankToScore(s.minRank, rankTable) ?? 0;
    return [s.schoolCode, '山东', 2025, '综合', minScore, s.minRank, 'real:sdzk/投档线'];
  });

  // Merge admission-lines.csv: drop existing 山东/2025/综合, keep others.
  const existingAdm = (await readCsv(ADM_CSV)).map((r) => [
    r.universityId,
    r.province,
    r.year,
    r.track,
    r.minScore,
    r.minRank,
    r.source,
  ]);
  const keptAdm = existingAdm.filter(
    (r) => !(r[1] === '山东' && Number(r[2]) === 2025 && r[3] === '综合'),
  );
  await writeCsv(
    ADM_CSV,
    'universityId,province,year,track,minScore,minRank,source',
    [...keptAdm, ...admRows] as any,
  );
  console.log(`[parse] → admission-lines.csv (kept ${keptAdm.length}, +${admRows.length} 山东)`);

  // Merge universities.csv: drop previously-generated school-code rows, keep curated ones.
  const existingUni = await readCsv(UNI_CSV);
  const keptUni = existingUni
    .filter((r) => !isShandongSchoolCode(r.id))
    .map((r) => [
      r.id, r.name, r.city, r.province, r.cityTier, r.region, r.tags,
      r.facultySummary, r.keyDisciplines, r.facultyRating,
      r.envCampus, r.envTeaching, r.envDormitory, r.transferDifficulty, r.transferPolicy,
    ]);
  const genUni = schools.map((s) => {
    const meta = metaForSchool(s.schoolName);
    // columns: id,name,city,province,cityTier,region,tags,facultySummary,keyDisciplines,
    //          facultyRating,envCampus,envTeaching,envDormitory,transferDifficulty,transferPolicy
    return [
      s.schoolCode, s.schoolName, meta.city, meta.province, String(meta.cityTier), meta.region,
      meta.tags, '', '', '', '', '', '', 'moderate', '',
    ];
  });
  const tagged = genUni.filter((r) => r[6] !== '').length;
  const located = genUni.filter((r) => r[2] !== '').length;
  await writeCsv(UNI_CSV, UNI_HEADER, [...keptUni, ...genUni] as any);
  console.log(
    `[parse] → universities.csv (kept ${keptUni.length} curated, +${genUni.length} 山东; ${tagged} 标记 985/211, ${located} 含城市)`,
  );

  // Merge majors.csv: keep curated (slug-id) rows, replace 山东 (school-code) rows.
  // 山东 majors now carry their OWN program-level 投档线 (位次→分数 via 一分一段),
  // so 意向专业 can be tiered by the major's real line, not the school's easiest program.
  const MAJORS_HEADER =
    'universityId,name,category,facultyStrength,employmentOutlook,requiredSubjects,minScore,minRank';
  const existingMajors = await readCsv(MAJORS_CSV);
  const keptMajors = existingMajors
    .filter((r) => !isShandongSchoolCode(r.universityId))
    .map((r) => [
      r.universityId, r.name, r.category, r.facultyStrength, r.employmentOutlook,
      r.requiredSubjects, r.minScore ?? '', r.minRank ?? '',
    ]);
  const genMajors = majors.map((m) => {
    const minScore = rankToScore(m.minRank, rankTable) ?? '';
    return [m.schoolCode, m.majorName, '', '', '', '', minScore, m.minRank];
  });
  await writeCsv(MAJORS_CSV, MAJORS_HEADER, [...keptMajors, ...genMajors] as any);
  console.log(`[parse] → majors.csv (kept ${keptMajors.length} curated, +${genMajors.length} 山东，含专业线)`);
}

async function parseProvincial(): Promise<void> {
  const rel = await findRaw('shandong', 'provincial-lines', /\.pdf$/i);
  if (!rel) {
    console.warn('[parse] no 山东 分数线 .pdf in manifest — skipping provincial step.');
    return;
  }
  const PROV_CSV = path.join(DIR, 'provincial-lines.csv');
  const rows = await parseShandongProvincialPdf(path.join(CWD, rel), 2025);
  console.log(`[parse] 山东 分数线: ${rows.map((r) => `${r.batch}=${r.minScore}`).join('  ')}`);
  if (rows.length === 0) return;

  const existing = (await readCsv(PROV_CSV)).map((r) => [
    r.province, r.year, r.track, r.batch, r.minScore, r.source,
  ]);
  const kept = existing.filter((r) => !(r[0] === '山东' && Number(r[1]) === 2025 && r[2] === '综合'));
  const fresh = rows.map((r) => [r.province, r.year, r.track, r.batch, r.minScore, r.source]);
  await writeCsv(PROV_CSV, 'province,year,track,batch,minScore,source', [...kept, ...fresh] as any);
  console.log(`[parse] → provincial-lines.csv (kept ${kept.length}, +${fresh.length} 山东)`);
}

async function main() {
  const rankRows = await parseRankTable();
  await parseAdmission(rankRows);
  await parseProvincial();
  console.log('[parse] done. `DATA_SOURCE=real pnpm refresh` to load real 山东 data.');
}

main().catch((err) => {
  console.error('[parse] crashed:', err);
  process.exit(1);
});
