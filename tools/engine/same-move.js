// Fast check after a change (docs/boss-ai-v2.md P4): rerun the boss on graded positions (selfplay.js output, not lost yet)
// and count how often it plays Rapfi's best move; also per-move time. No engine needed. Run alone (time-limited search).
// Run: [BOSS_AI=/path/ai.js] [MS=3500] [CFG={"K":16}] [EVERY=1] node tools/engine/same-move.js selfplay.jsonl [more.jsonl ...]
const fs = require('fs');
const AI = require(process.env.BOSS_AI || '../../ai.js');
try { require('../../ai-open.js'); if (AI.setOpening) AI.setOpening(globalThis.AI_OPEN); } catch (e) { /* no book */ }
const N = 15, EVERY = +process.env.EVERY || 1;
const rows = process.argv.slice(2).flatMap(f => fs.readFileSync(f, 'utf8').trim().split('\n').map(l => JSON.parse(l)))
  .filter(x => x.boss && x.wrBefore >= 0.05 && x.wrAfter !== undefined).filter((_, i) => i % EVERY === 0);
const board = (pos) => { const b = Array.from({ length: N }, () => Array(N).fill(0)); pos.forEach(([r, c], i) => b[r][c] = i % 2 ? 2 : 1); return b; };
AI.LEVELS.__m = { ...AI.LEVELS.boss, ...(process.env.MS ? { ms: +process.env.MS } : {}), ...JSON.parse(process.env.CFG || '{}') }; // CFG: JSON of LEVELS fields to try
let same = 0; const ms = [];
for (const x of rows) {
  AI.setMemory(null);
  const t0 = Date.now(), m = AI.bestMove(board(x.pos), x.p, '__m');
  ms.push(Date.now() - t0);
  if (m.row === x.best[0] && m.col === x.best[1]) same++;
}
ms.sort((a, b) => a - b);
console.log(`${rows.length} positions: same move as Rapfi ${(100 * same / rows.length).toFixed(1)}%; boss ms/move median ${ms[ms.length >> 1]} max ${ms[ms.length - 1]}`);
