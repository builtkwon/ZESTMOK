// Fits the boss's pattern tables (ai.js TAB) to Rapfi labels (docs/boss-ai-v2.md P4). No engine needed, ~1 min.
// Run: node tools/engine/fit-eval.js [--write] labels.jsonl [more.jsonl ...]     (labels from tools/engine/label.js)
// Model (per side to move, see ai.js patEval / patCands): every empty cell has a combo (its 4 line classes) for each player.
//  - eval: logit(Rapfi winrate of the side to move) = sum of own-table[own combo] + opp-table[opp combo] over cells + indicators.
//    Logistic regression (Texel), L2.
//  - candidates: cell score = own-table[own combo] + opp-table[opp combo]; softmax over the cells near stones,
//    maximising the probability of Rapfi's best move.
// Every 10th position is held out. --write puts the tables into ai.js (the `const TAB =` line).
const fs = require('fs');
const path = require('path');
const AI = require('../../ai.js'), P = AI.pat, N = 15, NCB = P.NCB, NI = P.NI;
const args = process.argv.slice(2), write = args[0] === '--write';
if (write) args.shift();
const rows = args.flatMap(f => fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)));
const board = (pos) => { const b = Array.from({ length: N }, () => Array(N).fill(0)); pos.forEach(([r, c], i) => b[r][c] = i % 2 ? 2 : 1); return b; };
const sig = (z) => 1 / (1 + Math.exp(-z));
const sparse = (m) => ({ i: Int32Array.from(m.keys()), v: Float64Array.from(m.values()) });

// eval samples {own, opp: sparse combo counts, ind, y}; candidate samples {a, c: combo per cell (own, opp), at}
const E = { 1: [], 2: [] }, C = { 1: [], 2: [] };
rows.forEach((x, n) => {
  const b = board(x.pos), p = x.pos.length % 2 ? 2 : 1, q = 3 - p, hold = n % 10 === 9;
  P.init(b);
  const cnt = P.cnt(), ci = P.ci(), bd = P.bd();
  if (!cnt[p][0] && cnt[q][0] < 2) { // eval is not used when a five is on (ai.js patEval)
    const own = new Map(), opp = new Map();
    for (let c = 0; c < N * N; c++) if (!bd[c]) { own.set(ci[p][c], (own.get(ci[p][c]) || 0) + 1); opp.set(ci[q][c], (opp.get(ci[q][c]) || 0) + 1); }
    E[p].push({ own: sparse(own), opp: sparse(opp), ind: Float64Array.from(P.indFeat(p)), y: x.wr, hold });
  }
  const cs = P.cands(b, p, 999);
  if (cs.length < 2 || cs[0].block) return; // forced
  const at = cs.findIndex(m => m.row === x.best[0] && m.col === x.best[1]);
  if (at < 0) return;
  C[p].push({ a: Int32Array.from(cs, m => ci[p][m.row * N + m.col]), c: Int32Array.from(cs, m => ci[q][m.row * N + m.col]), at, hold });
});

function adam(dim, grad, iters, lr, l2) {
  const w = new Float64Array(dim), m = new Float64Array(dim), v = new Float64Array(dim);
  for (let t = 1; t <= iters; t++) {
    const g = grad(w);
    for (let i = 0; i < dim; i++) {
      g[i] += l2 * w[i];
      m[i] = 0.9 * m[i] + 0.1 * g[i]; v[i] = 0.999 * v[i] + 0.001 * g[i] * g[i];
      w[i] -= lr * (m[i] / (1 - 0.9 ** t)) / (Math.sqrt(v[i] / (1 - 0.999 ** t)) + 1e-8);
    }
  }
  return w;
}
const L2E = +process.env.L2E || 1e-3, L2C = +process.env.L2C || 1e-3;
const tabs = {}, iw = [];
for (const p of [1, 2]) {
  const name = p === 1 ? 'black' : 'white', q = 3 - p;
  // eval: w = [own NCB | opp NCB | NI]
  const tr = E[p].filter(s => !s.hold), te = E[p].filter(s => s.hold), DE = 2 * NCB + NI;
  const z = (w, s) => { let a = 0; for (let k = 0; k < s.own.i.length; k++) a += w[s.own.i[k]] * s.own.v[k]; for (let k = 0; k < s.opp.i.length; k++) a += w[NCB + s.opp.i[k]] * s.opp.v[k]; for (let k = 0; k < NI; k++) a += w[2 * NCB + k] * s.ind[k]; return a; };
  const we = adam(DE, (w) => {
    const g = new Float64Array(DE);
    for (const s of tr) {
      const e = (sig(z(w, s)) - s.y) / tr.length;
      for (let k = 0; k < s.own.i.length; k++) g[s.own.i[k]] += e * s.own.v[k];
      for (let k = 0; k < s.opp.i.length; k++) g[NCB + s.opp.i[k]] += e * s.opp.v[k];
      for (let k = 0; k < NI; k++) g[2 * NCB + k] += e * s.ind[k];
    }
    return g;
  }, 1500, 0.02, L2E);
  const loss = (S) => S.reduce((a, s) => { const v = Math.min(Math.max(sig(z(we, s)), 1e-6), 1 - 1e-6); return a - (s.y * Math.log(v) + (1 - s.y) * Math.log(1 - v)); }, 0) / S.length;
  const base = (S) => S.reduce((a, s) => { const v = Math.min(Math.max(s.y, 1e-6), 1 - 1e-6); return a - (s.y * Math.log(v) + (1 - s.y) * Math.log(1 - v)); }, 0) / S.length;
  const mse = (S) => S.reduce((a, s) => a + (sig(z(we, s)) - s.y) ** 2, 0) / S.length;
  console.log(`eval ${name} to move: ${tr.length} train / ${te.length} held out; held-out logloss ${loss(te).toFixed(4)} (floor ${base(te).toFixed(4)}) mse ${mse(te).toFixed(4)}; train logloss ${loss(tr).toFixed(4)}`);
  tabs['e' + p + '0'] = we.slice(0, NCB); tabs['e' + q + '1'] = we.slice(NCB, 2 * NCB); iw[p - 1] = Array.from(we.slice(2 * NCB), v => +v.toFixed(3));
  // candidates: w = [own NCB | opp NCB]
  const ctr = C[p].filter(s => !s.hold), cte = C[p].filter(s => s.hold);
  const wc = adam(2 * NCB, (w) => {
    const g = new Float64Array(2 * NCB);
    for (const s of ctr) {
      const n = s.a.length, v = new Float64Array(n);
      let mx = -Infinity; for (let j = 0; j < n; j++) { v[j] = w[s.a[j]] + w[NCB + s.c[j]]; if (v[j] > mx) mx = v[j]; }
      let Z = 0; for (let j = 0; j < n; j++) { v[j] = Math.exp(v[j] - mx); Z += v[j]; }
      for (let j = 0; j < n; j++) { const e = (v[j] / Z - (j === s.at ? 1 : 0)) / ctr.length; g[s.a[j]] += e; g[NCB + s.c[j]] += e; }
    }
    return g;
  }, 800, 0.05, L2C);
  const rank = (s) => { const t = wc[s.a[s.at]] + wc[NCB + s.c[s.at]]; let k = 0; for (let j = 0; j < s.a.length; j++) if (wc[s.a[j]] + wc[NCB + s.c[j]] > t) k++; return k; };
  const topk = (S, k) => (100 * S.filter(s => rank(s) < k).length / S.length).toFixed(1);
  console.log(`cands ${name}: ${ctr.length} train / ${cte.length} held out; held-out top8 ${topk(cte, 8)}% top12 ${topk(cte, 12)}% top16 ${topk(cte, 16)}% top20 ${topk(cte, 20)}% (train top12 ${topk(ctr, 12)}%)`);
  tabs['c' + p + '0'] = wc.slice(0, NCB); tabs['c' + p + '1'] = wc.slice(NCB);
}
// 2 chars per value: 12-bit signed, unit 1/128 (clamped to +-16)
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const enc = (a) => Array.from(a, x => { const v = Math.max(-2048, Math.min(2047, Math.round(x * 128))) & 4095; return B64[v >> 6] + B64[v & 63]; }).join('');
const line = `  const TAB = { ${['e10', 'e11', 'e20', 'e21', 'c10', 'c11', 'c20', 'c21'].map(k => `${k}: '${enc(tabs[k])}'`).join(', ')}, iw: ${JSON.stringify(iw)} }; // fitted: tools/engine/fit-eval.js`;
if (write) {
  const f = path.join(__dirname, '..', '..', 'ai.js'), s = fs.readFileSync(f, 'utf8'), re = /^ {2}const TAB = .*$/m;
  if (!re.test(s)) throw new Error('no TAB line in ai.js');
  fs.writeFileSync(f, s.replace(re, () => line));
  console.log(`wrote TAB into ai.js (${line.length} chars)`);
} else console.log(`TAB line: ${line.length} chars (use --write)`);
