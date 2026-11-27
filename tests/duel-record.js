// Boss vs hard with full game records (manual, slow: ~1 min/game). node tests/duel-record.js [pairs=20] [seed=1] [out=games.json]
// Same openings as tests/duel.js. Feed the output to tests/analyze-losses.js.
const AI = require('../ai.js');
try { require('../ai-open.js'); AI.setOpening(globalThis.AI_OPEN); } catch (e) { /* no book */ }
const fs = require('fs');
const N = 15, empty = () => Array.from({ length: N }, () => Array(N).fill(0));
const A = { ...AI.LEVELS.boss }, B = { ...AI.LEVELS.hard }, PAIRS = +process.argv[2] || 20;
let seed = +process.argv[3] || 1; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
function five(b, r, c) { const p = b[r][c]; return [[0,1],[1,0],[1,1],[1,-1]].some(([dr,dc]) => { let n = 1; for (const s of [1,-1]) for (let k = 1; b[r+dr*s*k] && b[r+dr*s*k][c+dc*s*k] === p; k++) n++; return n >= 5; }); }
function opening() { const b = empty(), mv = []; let p = 1; while (mv.length < 4) { const r = 5 + Math.floor(rnd() * 5), c = 5 + Math.floor(rnd() * 5); if (b[r][c]) continue; b[r][c] = p; mv.push([r, c, p]); p = 3 - p; } return mv; }
function game(open, bossBlack) {
  const b = empty(); for (const [r, c, p] of open) b[r][c] = p;
  const moves = []; let turn = 1;
  for (let t = 0; t < N * N - open.length; t++) {
    const boss = (turn === 1) === bossBlack;
    AI.LEVELS.__d = { ms: 1e9, ...(boss ? A : B) };
    const t0 = Date.now(), m = AI.bestMove(b, turn, '__d');
    moves.push({ p: turn, who: boss ? 'boss' : 'hard', row: m.row, col: m.col, doomed: !!m.doomed, ms: Date.now() - t0 });
    b[m.row][m.col] = turn;
    if (five(b, m.row, m.col)) return { winner: turn, moves };
    turn = 3 - turn;
  }
  return { winner: 0, moves };
}
const out = []; let a = 0, bw = 0, d = 0;
for (let i = 0; i < PAIRS; i++) {
  const o = opening();
  for (const bossBlack of [true, false]) {
    const g = game(o, bossBlack), bossWon = g.winner && (g.winner === 1) === bossBlack;
    if (!g.winner) d++; else if (bossWon) a++; else bw++;
    out.push({ pair: i, bossBlack, open: o, ...g, result: !g.winner ? 'draw' : bossWon ? 'win' : 'loss' });
    fs.writeFileSync((process.argv[4] || 'games.json'), JSON.stringify(out));
    console.log(`game ${out.length}: boss ${bossBlack ? 'black' : 'white'} ${out[out.length - 1].result} (${g.moves.length} plies) | ${a}-${bw}-${d}`);
  }
}
console.log(`FINAL boss ${a} - hard ${bw} (draw ${d}) of ${a + bw + d}; boss score ${(100 * (a + d / 2) / (a + bw + d)).toFixed(0)}%`);
