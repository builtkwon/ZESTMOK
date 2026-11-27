// Boss search speed (negamax nodes per second) on graded positions, new ai.js vs another copy (e.g. the old boss). PC only.
// Run: node tools/engine/speed.js /path/old-ai.js [positions=40] [ms=1000] selfplay.jsonl [...]
// Both run the boss config with only the main search (no book, VCF/VCT, defense) for `ms` per position.
const fs = require('fs');
const N = 15, [OLD, CNT, MS, ...files] = process.argv.slice(2);
const rows = files.flatMap(f => fs.readFileSync(f, 'utf8').trim().split('\n').map(l => JSON.parse(l))).filter(x => x.boss && x.wrBefore >= 0.05);
const pick = rows.filter((_, i) => i % Math.max(1, Math.floor(rows.length / (+CNT || 40))) === 0).slice(0, +CNT || 40);
const board = (pos) => { const b = Array.from({ length: N }, () => Array(N).fill(0)); pos.forEach(([r, c], i) => b[r][c] = i % 2 ? 2 : 1); return b; };
for (const [name, file] of [['new', '../../ai.js'], ['old', OLD]]) {
  const AI = require(file);
  AI.LEVELS.__s = { ...AI.LEVELS.boss, ms: +MS || 1000, vcf: 0, vctD: 0, def: false, book: false };
  let nodes = 0, t = 0;
  for (const x of pick) {
    AI.setMemory(null);
    const n0 = AI.nodes(), t0 = Date.now();
    AI.bestMove(board(x.pos), x.p, '__s');
    nodes += AI.nodes() - n0; t += Date.now() - t0;
  }
  console.log(`${name}: ${pick.length} positions, ${nodes} nodes in ${t} ms = ${Math.round(nodes / t * 1000)} nodes/s`);
}
