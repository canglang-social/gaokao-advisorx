import { promises as fs } from 'node:fs';
import { PDFParse } from 'pdf-parse';
import type { Track } from '../../domain/types';

/**
 * Parser for 山东省 夏季高考各类别分数线 (PDF). The 普通类 control lines appear
 * first in the document (before 艺术类 综合分), so a first-match grab per label
 * yields the 普通类 values:
 *   特殊类型招生控制线 521 · 一段线 441 · 二段线 150  (verified, 2025).
 */

export interface ProvincialCsvRow {
  province: string;
  year: number;
  track: Track;
  batch: string;
  minScore: number;
  source: string;
}

/** Pure extractor over the PDF's text (unit-testable without a file). */
export function extractShandongProvincialLines(
  text: string,
  year: number,
  source = 'real:sdzk/分数线',
): ProvincialCsvRow[] {
  const out: ProvincialCsvRow[] = [];
  const grab = (label: string, batch: string) => {
    const m = text.match(new RegExp(label + '\\s*([0-9]{2,3})'));
    if (m) {
      out.push({ province: '山东', year, track: '综合', batch, minScore: Number(m[1]), source });
    }
  };
  grab('特殊类型招生控制线', '特殊类型招生控制线');
  grab('一段线', '一段线');
  grab('二段线', '二段线');
  return out;
}

export async function parseShandongProvincialPdf(
  filePath: string,
  year: number,
): Promise<ProvincialCsvRow[]> {
  const buf = await fs.readFile(filePath);
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  const res = await parser.getText();
  return extractShandongProvincialLines(res.text, year);
}
