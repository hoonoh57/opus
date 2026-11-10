// L01: check capture-list export files in lab-data/inbox (read only, no Kiwoom access). docs/07 section 1.
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { main, Rec, ROOT } from './common.ts';

const SYN: Record<string, string[]> = {
  date: ['일자', '날짜', '포착일', '포착일자', 'date'],
  time: ['시각', '시간', '포착시각', '포착시간', 'time'],
  code: ['종목코드', '코드', '단축코드', 'code'],
  name: ['종목명', 'name'],
  price: ['포착가', '현재가', '종가', '가격', 'price'],
};

function decode(b: Buffer): string {
  let s = new TextDecoder('utf-8').decode(b);
  if (s.includes('\uFFFD')) s = new TextDecoder('euc-kr').decode(b);
  return s.replace(/^\uFEFF/, '');
}

main('L01', async () => {
  const inbox = join(ROOT, 'lab-data', 'inbox');
  mkdirSync(inbox, { recursive: true });
  const files = readdirSync(inbox).filter((f) => /\.(csv|tsv|txt)$/i.test(f));
  if (!files.length) throw new Error('no csv/tsv/txt file in measure/lab-data/inbox');
  const rec = new Rec('L01', 'local');
  try {
    let rows = 0;
    const dates = new Set<string>();
    const miss = new Set<string>();
    for (const f of files) {
      const lines = decode(readFileSync(join(inbox, f))).split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) { miss.add(f + ':empty'); continue; }
      const sep = lines[0].includes('\t') ? '\t' : ',';
      const head = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, ''));
      const col: Record<string, number> = {};
      for (const [k, names] of Object.entries(SYN)) {
        const i = head.findIndex((h) => names.some((n) => h.toLowerCase() === n.toLowerCase()));
        if (i >= 0) col[k] = i;
      }
      rec.w('file', { file: f, sep: sep === '\t' ? 'tab' : 'comma', head, mapped: col, sample: lines.slice(1, 4) });
      for (const k of ['date', 'time', 'code']) if (col[k] === undefined) miss.add(k);
      rows += lines.length - 1;
      if (col.date !== undefined) {
        for (const l of lines.slice(1)) {
          const d = (l.split(sep)[col.date] || '').replace(/[^0-9]/g, '');
          if (d.length === 8) dates.add(d);
        }
      }
    }
    if (miss.size) throw new Error('columns not recognized: ' + [...miss].join(',') + ' (header and 3 rows saved in ledger details)');
    const ds = [...dates].sort();
    return 'L01 OK files=' + files.length + ' rows=' + rows + ' dates=' + ds.length + ' first=' + (ds[0] || '-') + ' last=' + (ds[ds.length - 1] || '-');
  } finally {
    rec.close();
  }
});
