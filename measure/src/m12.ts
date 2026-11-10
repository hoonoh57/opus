// M12: local journal fsync latency (06 9, 05 Tf/Hcrit)
import { openSync, writeSync, fsyncSync, closeSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { main, ROOT, pct } from './common.ts';

main('M12', async () => {
  const dir = join(ROOT, 'lab-data');
  mkdirSync(dir, { recursive: true });
  const p = join(dir, 'm12-fsync.tmp');
  const fd = openSync(p, 'w');
  const line = JSON.stringify({ seq: 0, kind: 'probe', pad: 'x'.repeat(160) }) + '\n';
  const lat: number[] = [];
  try {
    for (let i = 0; i < 1000; i++) {
      writeSync(fd, line);
      const t = performance.now();
      fsyncSync(fd);
      lat.push(performance.now() - t);
    }
  } finally {
    closeSync(fd);
    try { unlinkSync(p); } catch { /* ignore */ }
  }
  const f = (x: number) => x.toFixed(2);
  return 'M12 OK fsync_n=1000 p50_ms=' + f(pct(lat, 0.5)) + ' p99_ms=' + f(pct(lat, 0.99)) + ' max_ms=' + f(pct(lat, 1));
});
