// P3 baseline from tools/engine/selfplay.js output (docs/boss-ai-v2.md). Fast, no engine needed.
// Run: node tools/engine/analyze.js selfplay.jsonl [more.jsonl ...]
// M1 = Rapfi's best move is inside ai.js candidates(b, p, K), for several K (positions the boss had not lost yet)
// M2 = boss moves that drop Rapfi's winrate for the boss by more than T
// Blunders are labelled by what Rapfi's move would have done: own four / own open three / stop opponent's four or three / quiet.
const fs = require('fs');
const AI = require('../../ai.js');
const N = 15, DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
const rows = process.argv.slice(2).flatMap(f => fs.readFileSync(f, 'utf8').trim().split('\n').map(l => JSON.parse(l)));
const moves = rows.filter(x => x.boss && x.wrAfter !== undefined && x.wrBefore !== undefined), games = rows.filter(x => x.result);

function board(pos) { const b = Array.from({ length: N }, () => Array(N).fill(0)); pos.forEach(([r, c], i) => b[r][c] = i % 2 ? 2 : 1); return b; }
function run(b, r, c, dr, dc, p) { let n = 1; for (const s of [1, -1]) for (let k = 1; inside(r + dr * s * k, c + dc * s * k) && b[r + dr * s * k][c + dc * s * k] === p; k++) n++; return n; }
// what a stone of p at empty (r,c) makes: fours (some empty cell then makes five) and open threes (some empty cell then makes an open four)
function shape(b, r, c, p) {
  b[r][c] = p; let f = 0, t = 0;
  for (const [dr, dc] of DIRS) {
    let four = false, three = false;
    for (let k = -4; k <= 4 && !four; k++) {
      const er = r + dr * k, ec = c + dc * k;
      if (!k || !inside(er, ec) || b[er][ec]) continue;
      b[er][ec] = p; const n = run(b, er, ec, dr, dc, p); b[er][ec] = 0;
      if (n === 5 || (n > 5 && p === 2)) four = true;
    }
    if (!four) for (let k = -4; k <= 4 && !three; k++) {
      const er = r + dr * k, ec = c + dc * k;
      if (!k || !inside(er, ec) || b[er][ec]) continue;
      b[er][ec] = p;
      // open four = two different empty cells each complete five on this line
      let wins = 0;
      for (let j = -5; j <= 5; j++) { const xr = er + dr * j, xc = ec + dc * j; if (!j || !inside(xr, xc) || b[xr][xc]) continue; b[xr][xc] = p; const n = run(b, xr, xc, dr, dc, p); b[xr][xc] = 0; if (n === 5 || (n > 5 && p === 2)) wins++; }
      b[er][ec] = 0;
      if (wins >= 2) three = true;
    }
    if (four) f++; else if (three) t++;
  }
  b[r][c] = 0; return { f, t };
}
const label = (b, [r, c], p) => {
  const me = shape(b, r, c, p), op = shape(b, r, c, 3 - p);
  if (me.f) return me.f > 1 || me.t ? 'own 4-4/4-3' : 'own four';
  if (op.f) return 'stop opp four-point';
  if (me.t >= 2) return 'own 3-3';
  if (op.t >= 2 || (op.t && op.f)) return 'stop opp fork point';
  if (me.t) return 'own open three';
  if (op.t) return 'stop opp three-point';
  return 'quiet';
};

const open = moves.filter(x => x.wrBefore >= 0.05); // not lost yet (Rapfi's winrate saturates fast, so winning positions count too)
console.log(`games ${games.length}: boss ${games.filter(g => g.result === 'win').length}W ${games.filter(g => g.result === 'loss').length}L ${games.filter(g => g.result === 'draw').length}D; boss moves ${moves.length}, not-lost positions ${open.length}`);
console.log(`same move as Rapfi: ${(100 * open.filter(x => x.boss + '' === x.best + '').length / open.length).toFixed(1)}% of not-lost positions`);

// M1
const Ks = [8, 12, 16, 20, 30, 50];
const hit = Object.fromEntries(Ks.map(k => [k, 0]));
for (const x of open) {
  const b = board(x.pos);
  AI.bestMove(Array.from({ length: N }, () => Array(N).fill(0)), x.p, 'easy'); // sets ai.js's per-call rule flag for p
  const c = AI.candidates(b, x.p, 50).map(m => m.row + ',' + m.col);
  const at = c.indexOf(x.best + '');
  for (const k of Ks) if (at >= 0 && at < k) hit[k]++;
}
console.log('M1 Rapfi best inside candidates(K): ' + Ks.map(k => `K${k} ${(100 * hit[k] / open.length).toFixed(1)}%`).join('  '));

// M2
const drop = (x) => x.wrBefore - x.wrAfter, live = moves.filter(x => x.wrBefore >= 0.05);
for (const T of [0.1, 0.2, 0.4]) console.log(`M2 drop > ${T}: ${live.filter(x => drop(x) > T).length}/${live.length} moves (${(100 * live.filter(x => drop(x) > T).length / live.length).toFixed(1)}%)`);

// blunders (drop > 0.2): what the better move was
const bl = live.filter(x => drop(x) > 0.2), kinds = {};
for (const x of bl) { const b = board(x.pos), k = label(b, x.best, x.p) + ' | boss: ' + label(b, x.boss, x.p); kinds[k] = (kinds[k] || 0) + 1; }
console.log('blunders by (Rapfi move | boss move):');
for (const [k, n] of Object.entries(kinds).sort((a, b) => b[1] - a[1])) console.log(`  ${n}  ${k}`);
const firstFatal = games.map(g => moves.filter(x => x.g === g.g && x.wrBefore >= 0.05 && drop(x) > 0.2)[0]).filter(Boolean);
console.log(`first big blunder per game: ${firstFatal.length} games, median ply ${firstFatal.map(x => x.ply).sort((a, b) => a - b)[firstFatal.length >> 1]}`);
