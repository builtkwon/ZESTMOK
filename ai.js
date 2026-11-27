// Gomoku AI. board[r][c]: 0 empty, 1 black, 2 white. Win = 5+ in a row.
// Korean common rules for the AI's own play: when the AI is black it never plays a 3-3 (쌍삼) or a 6+ (장목);
// white is unrestricted. 4-4 is allowed. ponytail: a "three" whose completing point is itself forbidden still counts as a three.
// GomokuAI.bestMove(board, player, level) -> {row, col}; level: 'easy' | 'normal' | 'hard' | 'boss'.
(function (root) {
  const N = 15;
  const FIVE = 1e7;
  const V = [0, 2, 12, 120, 1500, FIVE]; // score of a 5-cell window by own stone count (no enemy stones in it)
  const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
  const LEVELS = {
    // easy: 1-ply, misses blocks. normal: shallow search. hard: deep search + forced-win (four-chain) search for both sides.
    easy:   { depth: 1, K: 5,  ms: 0,    vcf: 0 },
    normal: { depth: 3, K: 8,  ms: 600,  vcf: 0 },
    hard:   { depth: 4, K: 12, ms: 800,  vcf: 4 },   // measured (tests/duel.js, 80 games): beats normal 64%; boss beats this 77% (31-9 of 40)
    boss:   { depth: 10, K: 12, ms: 3500, vcf: 16, vctD: 6, def: true }, // 원준: deepest search + VCF/VCT + explicit defense (self-play: beats the old hard 6-2 / 7-1)
  };

  const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;

  // static eval for player p: sum of p's windows minus the opponent's
  function evaluate(b, p) {
    let s = 0;
    for (const [dr, dc] of DIRS) {
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (!inside(r + dr * 4, c + dc * 4)) continue;
        let own = 0, opp = 0;
        for (let i = 0; i < 5; i++) {
          const v = b[r + dr * i][c + dc * i];
          if (v === p) own++; else if (v) opp++;
        }
        if (!opp) s += V[own]; else if (!own) s -= V[opp];
      }
    }
    return s;
  }

  // how much placing p at (r,c) improves p's windows
  function gain(b, r, c, p) {
    let g = 0;
    for (const [dr, dc] of DIRS) for (let k = 0; k < 5; k++) {
      const sr = r - dr * k, sc = c - dc * k;
      if (!inside(sr, sc) || !inside(sr + dr * 4, sc + dc * 4)) continue;
      let own = 0, opp = 0;
      for (let i = 0; i < 5; i++) {
        const v = b[sr + dr * i][sc + dc * i];
        if (v === p) own++; else if (v) opp++;
      }
      if (!opp) g += V[own + 1] - V[own];
    }
    return g;
  }

  // contiguous run of `p` through (r,c) along (dr,dc): {n, lo, hi} offsets from (r,c)
  function run(b, r, c, dr, dc, p) {
    let lo = 0, hi = 0;
    while (inside(r + dr * (lo - 1), c + dc * (lo - 1)) && b[r + dr * (lo - 1)][c + dc * (lo - 1)] === p) lo--;
    while (inside(r + dr * (hi + 1), c + dc * (hi + 1)) && b[r + dr * (hi + 1)][c + dc * (hi + 1)] === p) hi++;
    return { n: hi - lo + 1, lo, hi };
  }
  // an end of a four that really wins: empty, and for black it must make exactly five (an overline end does not count)
  function openEnd(b, r, c, dr, dc, p) {
    if (!inside(r, c) || b[r][c]) return false;
    if (p !== 1) return true;
    b[r][c] = p;
    const n = run(b, r, c, dr, dc, p).n;
    b[r][c] = 0;
    return n === 5;
  }
  // after placing at (r,c): is there a way to make an open four (exactly 4, both ends empty) using this stone?
  function openThree(b, r, c, dr, dc, p) {
    for (let k = -4; k <= 4; k++) {
      const er = r + dr * k, ec = c + dc * k;
      if (!k || !inside(er, ec) || b[er][ec]) continue;
      b[er][ec] = p;
      const x = run(b, er, ec, dr, dc, p);
      const lr = er + dr * (x.lo - 1), lc = ec + dc * (x.lo - 1), hr = er + dr * (x.hi + 1), hc = ec + dc * (x.hi + 1);
      const open = x.n === 4 && -k >= x.lo && -k <= x.hi && openEnd(b, lr, lc, dr, dc, p) && openEnd(b, hr, hc, dr, dc, p);
      b[er][ec] = 0;
      if (open) return true;
    }
    return false;
  }
  // black already at (r,c): this line is a four (one more black stone makes exactly five), so it is not a three
  function fourLine(b, r, c, dr, dc) {
    for (let k = -4; k <= 4; k++) {
      const er = r + dr * k, ec = c + dc * k;
      if (!k || !inside(er, ec) || b[er][ec]) continue;
      b[er][ec] = 1;
      const n = run(b, er, ec, dr, dc, 1).n;
      b[er][ec] = 0;
      if (n === 5) return true;
    }
    return false;
  }
  // black at empty (r,c): exactly five wins (never forbidden); otherwise 6+ or 3-3 is forbidden
  function forbidden(b, r, c) {
    b[r][c] = 1;
    let five = false, over = false, threes = 0;
    for (const [dr, dc] of DIRS) { const n = run(b, r, c, dr, dc, 1).n; if (n === 5) five = true; else if (n > 5) over = true; }
    if (!five && !over) for (const [dr, dc] of DIRS) if (!fourLine(b, r, c, dr, dc) && openThree(b, r, c, dr, dc, 1)) threes++;
    b[r][c] = 0;
    return !five && (over || threes >= 2);
  }
  function exactFive(b, r, c, p) {
    b[r][c] = p;
    const ok = DIRS.some(([dr, dc]) => run(b, r, c, dr, dc, p).n === 5);
    b[r][c] = 0;
    return ok;
  }
  const made5 = (b, r, c, p, rule) => DIRS.some(([dr, dc]) => { const n = run(b, r, c, dr, dc, p).n; return n === 5 || (n > 5 && !rule); });
  // empty cells that would complete a five for p, through (r,c) (p already placed there)
  function fiveCells(b, r, c, p, rule) {
    const out = [];
    for (const [dr, dc] of DIRS) for (let k = 0; k < 5; k++) {
      const sr = r - dr * k, sc = c - dc * k;
      if (!inside(sr, sc) || !inside(sr + dr * 4, sc + dc * 4)) continue;
      let own = 0, er = -1, ec = -1;
      for (let i = 0; i < 5; i++) { const v = b[sr + dr * i][sc + dc * i]; if (v === p) own++; else if (!v) { er = sr + dr * i; ec = sc + dc * i; } }
      if (own === 4 && er >= 0 && !out.some(x => x[0] === er && x[1] === ec) && !(rule && !exactFive(b, er, ec, p))) out.push([er, ec]);
    }
    return out;
  }
  function anyFive(b, p, rule) { // some empty cell where p makes five right now
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (b[r][c] !== p) continue;
      const f = fiveCells(b, r, c, p, rule);
      if (f.length) return f[0];
    }
    return null;
  }
  // cells that would give p a four (windows with 3 own + 2 empty, no enemy)
  function fourCells(b, p) {
    const seen = new Set(), out = [];
    for (const [dr, dc] of DIRS) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (!inside(r + dr * 4, c + dc * 4)) continue;
      let own = 0, opp = 0;
      for (let i = 0; i < 5; i++) { const v = b[r + dr * i][c + dc * i]; if (v === p) own++; else if (v) opp++; }
      if (own !== 3 || opp) continue;
      for (let i = 0; i < 5; i++) { const x = r + dr * i, y = c + dc * i; if (!b[x][y] && !seen.has(x * N + y)) { seen.add(x * N + y); out.push([x, y]); } }
    }
    return out;
  }
  // Can p force a win with consecutive fours (VCF)? Returns the first move or null. Defender's only replies are the five-blocking cell.
  function vcf(b, p, d, dl) {
    if (d <= 0 || Date.now() > dl.t) return null;
    const q = 3 - p, rule = koreanBlack && p === 1, qrule = koreanBlack && q === 1;
    const now = anyFive(b, p, rule);
    if (now) return { row: now[0], col: now[1] };
    if (anyFive(b, q, qrule)) return null; // must defend first; not a pure four-chain
    for (const [r, c] of fourCells(b, p)) {
      if (rule && forbidden(b, r, c)) continue;
      b[r][c] = p;
      const f = fiveCells(b, r, c, p, rule);
      let win = f.length >= 2;
      if (!win && f.length === 1) {
        const [fr, fc] = f[0];
        b[fr][fc] = q;
        win = !made5(b, fr, fc, q, qrule) && !!vcf(b, p, d - 1, dl);
        b[fr][fc] = 0;
      }
      b[r][c] = 0;
      if (win) return { row: r, col: c };
    }
    return null;
  }
  // ── VCT: threat-space search (fours + open threes) ────────────────────────
  // open-four cells for p on the 4 lines through (r,c) (empty cells where p would make an open four)
  function openFourNear(b, p, r, c) {
    const out = [];
    for (const [dr, dc] of DIRS) for (let k = -4; k <= 4; k++) {
      const x = r + dr * k, y = c + dc * k;
      if (!inside(x, y) || b[x][y]) continue;
      b[x][y] = p;
      const u = run(b, x, y, dr, dc, p);
      const lr = x + dr * (u.lo - 1), lc = y + dc * (u.lo - 1), hr = x + dr * (u.hi + 1), hc = y + dc * (u.hi + 1);
      const open = u.n === 4 && inside(lr, lc) && !b[lr][lc] && inside(hr, hc) && !b[hr][hc];
      b[x][y] = 0;
      if (open && !(p === 1 && koreanBlack && forbidden(b, x, y))) out.push([x, y]);
    }
    return out;
  }
  function nearCells(b) {
    const seen = new Uint8Array(N * N), out = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (b[r][c])
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
        const x = r + i, y = c + j;
        if (inside(x, y) && !b[x][y] && !seen[x * N + y]) { seen[x * N + y] = 1; out.push([x, y]); }
      }
    return out;
  }
  // can p force a win with fours and open threes? Defender replies to a three = cells on its lines that leave no open four.
  // defender counter-fours are checked too (each forces a block, then p must still win).
  function vct(b, p, d, dl) {
    if (d <= 0 || Date.now() > dl.t) return null;
    const q = 3 - p, rule = koreanBlack && p === 1, qrule = koreanBlack && q === 1;
    const now = anyFive(b, p, rule);
    if (now) return { row: now[0], col: now[1] };
    if (anyFive(b, q, qrule)) return null;
    for (const [r, c] of fourCells(b, p)) {
      if (rule && forbidden(b, r, c)) continue;
      b[r][c] = p;
      const f = fiveCells(b, r, c, p, rule);
      let win = f.length >= 2;
      if (!win && f.length === 1) {
        const [fr, fc] = f[0];
        b[fr][fc] = q;
        win = !made5(b, fr, fc, q, qrule) && !!vct(b, p, d - 1, dl);
        b[fr][fc] = 0;
      }
      b[r][c] = 0;
      if (win) return { row: r, col: c };
    }
    for (const [r, c] of nearCells(b)) {
      if (Date.now() > dl.t) return null;
      if (rule && forbidden(b, r, c)) continue;
      b[r][c] = p;
      let win = false;
      if (openFourNear(b, p, r, c).length) { // it is an open three: every defense must still lose
        win = true;
        for (const [dr, dc] of DIRS) for (let k = -4; k <= 4 && win; k++) {
          const x = r + dr * k, y = c + dc * k;
          if (!inside(x, y) || b[x][y] || (qrule && forbidden(b, x, y))) continue;
          b[x][y] = q;
          if (!openFourNear(b, p, r, c).length && !vct(b, p, d - 1, dl)) win = false; // a reply that stops the open four and survives
          b[x][y] = 0;
        }
        // defender counter-fours: each forces p to block, then p must still win
        if (win) for (const [x, y] of fourCells(b, q)) {
          if (qrule && forbidden(b, x, y)) continue;
          b[x][y] = q;
          const f = fiveCells(b, x, y, q, qrule);
          let holds = false;
          if (f.length >= 2) holds = true; // defender wins outright
          else if (f.length === 1) {
            const [fr, fc] = f[0];
            if (!(rule && forbidden(b, fr, fc))) { b[fr][fc] = p; holds = !made5(b, fr, fc, p, rule) && !vct(b, p, d - 1, dl); b[fr][fc] = 0; }
          }
          b[x][y] = 0;
          if (holds) { win = false; break; }
        }
      }
      b[r][c] = 0;
      if (win) return { row: r, col: c };
    }
    return null;
  }

  // ── defense ───────────────────────────────────────────────────────────────
  // a 5-window through (r,c) with 4 of p's stones and no enemy (a four, open or closed) in direction (dr,dc)
  function hasFour(b, r, c, dr, dc, p) {
    for (let k = 0; k < 5; k++) {
      const sr = r - dr * k, sc = c - dc * k;
      if (!inside(sr, sc) || !inside(sr + dr * 4, sc + dc * 4)) continue;
      let own = 0, opp = 0;
      for (let i = 0; i < 5; i++) { const v = b[sr + dr * i][sc + dc * i]; if (v === p) own++; else if (v) opp++; }
      if (own === 4 && !opp) return true;
    }
    return false;
  }
  // empty cells where q would make 3-3 (kind 0), 4-4 (1), 6+ (2) or 4-3 (3: a four plus an open three on another line).
  // Black may not play 3-3 / 6+, so for black only 4-4 and (non-forbidden) 4-3 count.
  function forkCells(b, q, kind) {
    const out = [];
    if (q === 1 && (kind === 0 || kind === 2)) return out;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (b[r][c]) continue;
      b[r][c] = q;
      let n = 0, f = 0, t = 0;
      for (const [dr, dc] of DIRS) {
        if (kind === 3) { if (hasFour(b, r, c, dr, dc, q)) f++; else if (openThree(b, r, c, dr, dc, q)) t++; }
        else if (kind === 0 ? openThree(b, r, c, dr, dc, q) : kind === 1 ? hasFour(b, r, c, dr, dc, q) : run(b, r, c, dr, dc, q).n > 5) n++;
      }
      b[r][c] = 0;
      if (kind === 3 ? f && t && !(q === 1 && forbidden(b, r, c)) : kind === 2 ? n >= 1 : n >= 2) out.push([r, c]);
    }
    return out;
  }
  // empty cells where p would make an open four (p already has an open three) - wins unless the other side has fours
  function openFourCells(b, p) {
    const out = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (b[r][c]) continue;
      b[r][c] = p;
      const ok = DIRS.some(([dr, dc]) => {
        const x = run(b, r, c, dr, dc, p);
        if (x.n !== 4) return false;
        const lr = r + dr * (x.lo - 1), lc = c + dc * (x.lo - 1), hr = r + dr * (x.hi + 1), hc = c + dc * (x.hi + 1);
        return inside(lr, lc) && !b[lr][lc] && inside(hr, hc) && !b[hr][hc];
      });
      b[r][c] = 0;
      if (ok && !(p === 1 && forbidden(b, r, c))) out.push([r, c]);
    }
    return out;
  }
  // Defense plan for p vs q, thought through every move:
  //  attack first - if p can make an open four now, no defensive bonus (the search just takes it);
  //  else bonus for occupying q's open-four cells (strong) and every fork cell (3-3, 4-4, 6+, 4-3).
  const OPEN4_DEF = 4000, FORK_DEF = 2500;
  function defense(b, p, q) {
    const bonus = new Map();
    if (openFourCells(b, p).length) return bonus;
    const add = (cells, v) => cells.forEach(([r, c]) => { if (!(koreanBlack && p === 1 && forbidden(b, r, c))) bonus.set(r * N + c, Math.max(bonus.get(r * N + c) || 0, v)); });
    add(openFourCells(b, q), OPEN4_DEF);
    for (let kind = 0; kind < 4; kind++) add(forkCells(b, q, kind), FORK_DEF);
    return bonus;
  }

  // ── per-browser learning ──────────────────────────────────────────────────
  // mem.avoid[key] = AI moves (at that position) that preceded a human win; mem.hum[key]["r,c"] = [games, wins] of the human's
  // replies at that position (key = position with the human to move); mem.streak = consecutive human wins.
  // Every game is stored in all 4 rotations (0/90/180/270), so a rotated replay of a known game is recognized too.
  // ponytail: exact-position matching only (no mirror / pattern generalization), capped at CAP keys, oldest dropped.
  const CAP = 4000;
  let mem = { avoid: {}, hum: {}, streak: 0 };
  function posKey(b, p) {
    const out = [p];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (b[r][c]) out.push((r * N + c).toString(36) + b[r][c]);
    return out.join(',');
  }
  const setMemory = (m) => { mem = { avoid: (m && m.avoid) || {}, hum: (m && m.hum) || {}, streak: (m && m.streak) | 0 }; };
  const getMemory = () => mem;
  // shared book (ai-book.js, built offline from every site's boss games): read next to mem, never written back into it
  let book = { avoid: {}, hum: {} };
  const setBook = (m) => { book = { avoid: (m && m.avoid) || {}, hum: (m && m.hum) || {} }; };
  const trim = (o) => { const k = Object.keys(o); if (k.length > CAP) for (const x of k.slice(0, k.length - CAP + 200)) delete o[x]; };
  // 90° clockwise rotation of a cell, and of a posKey (tokens re-sorted so it equals posKey of the rotated board)
  const rot = (r, c) => [c, N - 1 - r];
  function rotKey(key) {
    const [p, ...s] = key.split(',');
    const t = s.map(x => { const i = parseInt(x.slice(0, -1), 36), [r, c] = rot((i / N) | 0, i % N); return [r * N + c, x.slice(-1)]; });
    return [p, ...t.sort((a, b2) => a[0] - b2[0]).map(([i, v]) => i.toString(36) + v)].join(',');
  }
  // history: [{p, row, col, key}] in play order (key = posKey before the move). winner: 1|2|0 (draw). One call = one result (streak moves once).
  function learn(history, aiColor, winner) {
    const hw = winner && winner !== aiColor;
    if (hw) mem.streak++; else if (winner === aiColor) mem.streak = 0;
    let hs = history;
    for (let t = 0; t < 4; t++) { // ponytail: a rotation-symmetric position gets counted once per matching rotation; harmless for argmax
      for (const h of hs) {
        if (h.p === aiColor) continue;
        const e = (mem.hum[h.key] = mem.hum[h.key] || {}), rc = h.row + ',' + h.col, v = (e[rc] = e[rc] || [0, 0]);
        v[0]++; if (hw) v[1]++;
      }
      if (hw) { // dodge the AI's last moves; the longer the human's streak, the further back we go
        const mine = hs.filter(h => h.p === aiColor).slice(-(3 + 2 * Math.min(mem.streak - 1, 3)));
        for (const h of mine) { const a = (mem.avoid[h.key] = mem.avoid[h.key] || []), rc = h.row + ',' + h.col; if (!a.includes(rc)) a.push(rc); }
      }
      hs = hs.map(h => { const [row, col] = rot(h.row, h.col); return { p: h.p, row, col, key: rotKey(h.key) }; });
    }
    trim(mem.hum); trim(mem.avoid);
  }
  // the human's most likely reply at a position (human to move), preferring ones that won before
  function predict(b, q) {
    const k = posKey(b, q), m = mem.hum[k], o = book.hum[k];
    if (!m && !o) return null;
    const e = Object.assign({}, o);
    if (m) for (const rc in m) e[rc] = e[rc] ? [e[rc][0] + m[rc][0], e[rc][1] + m[rc][1]] : m[rc];
    let best = null, bs = -1;
    for (const rc in e) { const sc = e[rc][1] * 1000 + e[rc][0]; if (sc > bs) { bs = sc; best = rc; } }
    const [r, c] = best.split(',').map(Number);
    return { row: r, col: c, wins: e[best][1] };
  }
  // drop moves that were lost with before, or that walk into a reply the human has already won with
  function unlearned(b, p, cands) {
    const k = posKey(b, p), q = 3 - p, av = (mem.avoid[k] || []).concat(book.avoid[k] || []);
    const ok = cands.filter(m => {
      if (av && av.includes(m.row + ',' + m.col)) return false;
      b[m.row][m.col] = p;
      const pr = predict(b, q);
      b[m.row][m.col] = 0;
      return !(pr && pr.wins > 0);
    });
    return ok.length ? ok : cands;
  }

  let koreanBlack = false; // set per bestMove call: AI plays black under Korean rules

  // candidate moves near existing stones, best first. Forced moves (win / block five) are returned alone.
  function candidates(b, p, K) {
    const q = 3 - p, seen = new Uint8Array(N * N), list = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (!b[r][c]) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const nr = r + dr, nc = c + dc;
        if (!inside(nr, nc) || b[nr][nc] || seen[nr * N + nc]) continue;
        seen[nr * N + nc] = 1;
        const rule = koreanBlack && p === 1;
        if (rule && forbidden(b, nr, nc)) continue;
        const gm = gain(b, nr, nc, p), go = gain(b, nr, nc, q);
        const win = gm >= FIVE - V[4] && (!rule || exactFive(b, nr, nc, 1));
        list.push({ row: nr, col: nc, win, block: go >= FIVE - V[4], pri: gm + go * 0.9 });
      }
    }
    const w = list.find(m => m.win);
    if (w) return [w];
    const blocks = list.filter(m => m.block);
    if (blocks.length) return blocks.slice(0, 2);
    list.sort((a, b2) => b2.pri - a.pri);
    return list.slice(0, K);
  }

  // transposition table (per bestMove call): same position reached by a different move order is searched once
  const Z = [0, 1, 2].map(() => Array.from({ length: N * N }, () => (Math.random() * 4294967296) | 0));
  let TT = new Map();
  function negamax(b, depth, alpha, beta, p, K, dl, h) {
    if (Date.now() > dl.t) { dl.out = true; return 0; }
    if (depth === 0) return evaluate(b, p);
    const a0 = alpha, key = h ^ (p === 2 ? 0x5bd1e995 : 0), e = TT.get(key);
    if (e && e.d >= depth) {
      if (e.f === 0) return e.v;
      if (e.f === 1 && e.v > alpha) alpha = e.v; else if (e.f === 2 && e.v < beta) beta = e.v;
      if (alpha >= beta) return e.v;
    }
    const cands = candidates(b, p, K);
    if (!cands.length) return 0;
    if (cands[0].win) return FIVE + depth;
    let best = -Infinity;
    for (const m of cands) {
      b[m.row][m.col] = p;
      const s = -negamax(b, depth - 1, -beta, -alpha, 3 - p, K, dl, h ^ Z[p][m.row * N + m.col]);
      b[m.row][m.col] = 0;
      if (dl.out) return 0;
      if (s > best) best = s;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    TT.set(key, { d: depth, v: best, f: best <= a0 ? 2 : best >= beta ? 1 : 0 }); // 2 = upper bound, 1 = lower bound, 0 = exact
    return best;
  }
  const hashOf = (b) => { let h = 0; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (b[r][c]) h ^= Z[b[r][c]][r * N + c]; return h; };

  function bestMove(b, p, level) {
    const L = LEVELS[level] || LEVELS.normal;
    koreanBlack = p === 1;
    const stones = b.flat().filter(Boolean).length;
    if (!stones) return { row: 7, col: 7 };
    if (stones === 1) { // answer next to the first stone
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (b[r][c]) {
        const d = [[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 1], [1, 0]][Math.floor(Math.random() * 6)];
        if (inside(r + d[0], c + d[1])) return { row: r + d[0], col: c + d[1] };
      }
    }
    // adaptive: the longer the human's win streak, the deeper/wider the search (normal and up)
    const boost = level === 'easy' ? 0 : Math.min(mem.streak, 3);
    const D = L.depth + (boost > 0 ? Math.min(boost, 2) : 0), KK = L.K + boost * 2, MS = L.ms;
    let cands = candidates(b, p, KK);
    let bonus = new Map(), lost = false;
    if (level !== 'easy' && cands.length && !cands[0].win && !cands[0].block) cands = unlearned(b, p, cands);
    if (!cands.length) { // every nearby cell is forbidden: any legal empty cell
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!b[r][c] && !(koreanBlack && p === 1 && forbidden(b, r, c))) return { row: r, col: c };
      return { row: 7, col: 7 };
    }
    if (cands[0].win) return cands[0];
    if (level === 'easy') {
      // always takes a win; blocks a five 50% of the time; otherwise a random pick among the top few
      if (cands[0].block && Math.random() < 0.5) return cands[0];
      const top = cands.slice(0, 4);
      return Math.random() < 0.5 ? top[0] : top[Math.floor(Math.random() * top.length)];
    }
    if (L.def) { // make sure defensive cells are searched even if they rank low
      bonus = defense(b, p, 3 - p);
      let extra = 0;
      for (const k of bonus.keys()) if (extra < 8 &&!cands.some(m => m.row * N + m.col === k)) { cands.push({ row: (k / N) | 0, col: k % N, pri: 0 }); extra++; }
    }
    if (L.vcf) { // forced win for me, or stop the opponent's forced win
      const q = 3 - p, d0 = { t: Date.now() + MS * 0.5, out: false };
      const w = vcf(b, p, L.vcf, d0);
      if (w) return w;
      const sub = () => ({ t: Math.min(d0.t, Date.now() + MS * 0.12), out: false }); // each VCT call gets a slice of the budget
      if (L.vctD) { const w2 = vct(b, p, L.vctD, sub()); if (w2) return w2; }
      const threat = (pl) => vcf(b, pl, L.vcf, d0) || (L.vctD && vct(b, pl, L.vctD, sub()));
      if (threat(q)) {
        lost = true;
        const safeMoves = []; // moves that stop the forced win; the search then picks the best of them (not just the first)
        for (const m of candidates(b, p, 30)) {
          if (Date.now() > d0.t) break;
          b[m.row][m.col] = p;
          const safe = !threat(q);
          b[m.row][m.col] = 0;
          if (safe && Date.now() <= d0.t) safeMoves.push(m);
        }
        if (safeMoves.length) { lost = false; cands = safeMoves.slice(0, KK); }
        if (Date.now() > d0.t) lost = false; // ran out of time: not sure it is lost
      }
    }
    let best = cands[0], rawBest = 0;
    const dl = { t: Date.now() + MS, out: false }, h0 = hashOf(b);
    TT = new Map();
    for (let depth = 2; depth <= D; depth++) {
      let iterBest = null, bs = -Infinity, alpha = -Infinity, iterRaw = 0;
      const order = best ? [best, ...cands.filter(m => m !== best)] : cands;
      for (const m of order) {
        b[m.row][m.col] = p;
        const bn = bonus.get(m.row * N + m.col) || 0; // defensive bonus: searched score + bonus
        const raw = -negamax(b, depth - 1, -Infinity, bn - alpha, 3 - p, KK, dl, h0 ^ Z[p][m.row * N + m.col]);
        b[m.row][m.col] = 0;
        if (dl.out) break;
        const s = raw + bn;
        if (s > bs) { bs = s; iterBest = m; iterRaw = raw; }
        if (bs > alpha) alpha = bs;
      }
      if (dl.out) break; // keep the last fully searched depth
      if (iterBest) { best = iterBest; rawBest = iterRaw; }
      if (bs >= FIVE) break; // forced win found
    }
    // doomed: the opponent has a forced win (four-chain or searched) - the UI uses this for the boss's table flip
    return lost || rawBest <= -FIVE ? { row: best.row, col: best.col, doomed: true } : best;
  }

  const api = { LEVELS, bestMove, evaluate, forbidden, forkCells, openFourCells, vct, posKey, rotKey, learn, setMemory, getMemory, setBook, predict, candidates };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GomokuAI = api;
})(typeof window !== 'undefined' ? window : globalThis);
