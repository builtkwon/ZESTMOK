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
    boss:   { depth: 10, K: 16, ms: 3500, vcf: 16, vctD: 6, def: true, book: true, pat: true, rootK: 24, preD: 3 }, // 원준: deepest search + VCF/VCT + explicit defense (self-play: beats the old hard 6-2 / 7-1)
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

  // ── opening book (boss only): ai-open.js, built offline by tools/engine/build-opening.js from Rapfi's best moves ──
  // Keyed by the position up to the 8 board symmetries and translation, so a human opening off-centre still hits.
  // Used only while every stone and the move stay 2+ cells from the edge (the book was built around the centre).
  const TF = [[1, 0, 0, 1], [0, 1, -1, 0], [-1, 0, 0, -1], [0, -1, 1, 0], [1, 0, 0, -1], [-1, 0, 0, 1], [0, 1, 1, 0], [0, -1, -1, 0]];
  const ch = (v) => String.fromCharCode(72 + v); // 'H' = 0; book moves may sit just outside the stones' box (negative)
  // canonical key of a position: min over the 8 transforms (r,c) -> (a r + b c, e r + f c), shifted so the stones' box starts at 0,0
  function canon(b) {
    const st = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (b[r][c]) st.push([r, c, b[r][c]]);
    let best = null;
    TF.forEach(([a, bb, e, f], t) => {
      const x = st.map(([r, c, v]) => [a * r + bb * c, e * r + f * c, v]);
      const r0 = Math.min(...x.map(s => s[0])), c0 = Math.min(...x.map(s => s[1]));
      const tok = (v) => x.filter(s => s[2] === v).map(s => ch(s[0] - r0) + ch(s[1] - c0)).sort().join('');
      const key = tok(1) + '/' + tok(2);
      if (!best || key < best.key) best = { key, t, r0, c0 };
    });
    return best;
  }
  // a board move -> its 2-char code in the canonical frame of `k` (builder side), and back (lookup side)
  const toCanon = (k, r, c) => { const [a, bb, e, f] = TF[k.t]; return ch(a * r + bb * c - k.r0) + ch(e * r + f * c - k.c0); };
  const fromCanon = (k, m) => { const [a, bb, e, f] = TF[k.t], x = m.charCodeAt(0) - 72 + k.r0, y = m.charCodeAt(1) - 72 + k.c0; return [a * x + e * y, bb * x + f * y]; };
  let opening = {};
  const setOpening = (m) => { opening = m || {}; };
  const edgeOk = (r, c) => r >= 2 && r <= N - 3 && c >= 2 && c <= N - 3;
  function bookMove(b, p) {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (b[r][c] && !edgeOk(r, c)) return null;
    const k = canon(b), m = opening[k.key];
    if (!m) return null;
    const [r, c] = fromCanon(k, m);
    if (!edgeOk(r, c) || b[r][c] || (p === 1 && forbidden(b, r, c))) return null;
    const key = posKey(b, p), rc = r + ',' + c;
    if ((mem.avoid[key] || []).includes(rc) || (book.avoid[key] || []).includes(rc)) return null; // lost with it here before: search instead
    return { row: r, col: c };
  }

  let NODES = 0; // negamax calls (tools: speed per node)
  let PAT = false; // set per bestMove call: search uses the pattern eval/candidates (boss)
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

  // ── pattern evaluation + candidates (boss only, LEVELS.boss.pat) ────────────
  // Every empty cell gets, per direction and per player, the shape that player would make by playing there on that line:
  // a class read from a table indexed by the 10 neighbours on the line (5 each side, 2 bits each: empty/black/white/edge).
  // Kept up to date stone by stone (patSet touches the 40 cells in line with the stone), so a leaf eval is a dot product of counts.
  // Classes (what the line becomes; "one more stone" makes the next class up), F = open, B = closed, OL = black 6+:
  const C_B1 = 1, C_F1 = 2, C_B2 = 3, C_F2 = 4, C_B3 = 5, C_F3 = 6, C_B4 = 7, C_F4 = 8, C_5 = 9, C_OL = 10;
  const NN = N * N, WINV = 1e6, NCB = 1001; // NCB = sorted 4-tuples of 11 classes
  let LN = null, SQ, PT, CMEMO, CODE, CL, CNT, NEAR, BD, CI, SV, COMBO, FL, ET, CT;
  // fitted tables (tools/engine/fit-eval.js --write): 2 chars per combo (B64, 12-bit signed, unit 1/128 logit); iw = indicator weights
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const TAB = { e10: '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', e11: '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', e20: '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', e21: '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', c10: '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', c11: '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', c20: '7G624f6+6v8q8y+6GFAAAA7v4d7I6S8j8w/rGeAAAA4m6C6G7E9N+QFhAAAA6e6/7v+J/9GxAAAA7r8s+MAyHQAAAA+d/kA3DmAAAAA0ErCCAAAAAAAAAAAAAAAAAAAAAAAA7e4X7n8A8f98/jGdAAAA4C5Z6M6p9L/JIOAAAA667a7/+S/YHPAAAA7d8//UAzGqAAAA9x/BAoDPAAAACLFXA2AAAA/8AAAAAAAAAAAAAAAAAA3M4j5c6a9N/oH+AAAA6c6w7f95AlG9AAAA7w8v/mBbF6AAAA9l/9BuF9AAAADOI3/vAAAA/9CFAAAAAAAAAAAAAAAA7u7i7u+r+aGkAAAA8c9JAfAVHAAAAA+MAhBuE2AAAABeD8B7AAAABbAAAAAAAAAAAAAAAAAA9u+nASCvDWAAAA/5BOClDyAAAAEfFaBrAAAAB8AAAAAAAAAAAAAAAAAA+V/MBJ//AAAACnB9DdAAAAAAAAAAAAAAAAAAAAAAAA/yAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA775w7K7R9A+MBkDhAAAA5k6M608P90/AIYAAAA717H78+v+GG6AAAA7V9C/mAlFCAAAA+1+iCJFIAAAAD7DpDkAAAAB8AAAAAAAAAAAAAAAAAA4W466E7L92AIKFAAAA5+6n7d+c/yJ9AAAA8J80/+B+JnAAAA9VAVCcFzAAAADBGoCBAAAACFAAAAAAAAAAAAAAAAAA7T7Y8J/M/JFxAAAA8L7l/3CbGbAAAA+TAHCkB3AAAACfEgCCAAAADXAAAAAAAAAAAAAAAAAA95+bBHCqGuAAAA/uAp+xFBAAAAErFQ/5AAAAAAAAAAAAAAAAAAAAAAAA/jAE/sAAAAAAAwAABfAAAAAAAAAAAAAAAAAAAAAAAA/iAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA0927305F93AkLpAAAA5X467q+iBcL/AAAA7r8yA7C+JNAAAA+zBODoIdAAAAD1JYDeAAAADhAAAAAAAAAAAAAAAAAA6+5m8F+8BLG2AAAA7h88BGDkIeAAAA/j/QCrBwAAAAClF1CBAAAAAAAAAAAAAAAAAAAAAAAA+C+tBdDgG/AAAA+kCXF0CEAAAAEhEfAAAAAAAAAAAAAAAAAAAAAAAAAA/yBo/9AAAAAAFXFZAAAAAAAAAAAAAAAAAAAAAAAAAA/9AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA988P+V/MAqCzAAAA8H+7BxBfHFAAAA+u+hBEB6AAAAE8DVAAAAAAAAAAAAAAAAAAAAAAAAAA9v/xBIDE/8AAAA+UAsC1DnAAAACxEyAAAAAAAAAAAAAAAAAAAAAAAAAA/0A7AAAAAAAA/9B+CCAAAAAA/7AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/kB5BgCECCAAAABAAsBuAAAAAAC1CuAAAAAAB/AAAAAAAAAAAAAAAAAA+2BFAAAAAAAA/8CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', c21: '8M877X8o8D70/CACCjAAAA8C7V8u8Y8S+R+8D3AA/y6k7R7L80+jAEF1AAAA8F8r7o/Q+/FUAA/l809q+j/pF1AAAA+H/yBdEXAAAA+fBSDwAAAA/2B+AAAACAAAAAAAAAAA8F7C9i8q8/+T+VCKAAAA6l7h7z759x/nEiAAAA7d7975+U/REYAAAA8y9m/PASFxAA/1+U/OAYEcAAAA9nBpESAA+xBqBmAAAABrAAAAAAAAAA5x6i6Y6493/BGoAAAA7d7q89+T/hGKAAAA7w8z/TBnIhAA/P+k/t+4GpAAAA+IDUFoAAAAB+AAAAAAAAAAAAAAAAAA8z8F9R+RAUF7AAAA8A9H/b/OGBAAAA+iAMBGFGAAAA/mBpD3AAAA/5AAAAAAAAAAAAAAAAAA8o96/5BVGjAAAA+v/ABoFNAAAA/JBZGMAAAA/z/+AAAAAAAAAAAAAAAA/bAFB7DLAAAA+oCxB+AAAABqAAAAAAAAAAAAAAAAAA/mBrB8AAAAB7AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA9g7t8i7+9m9f/eDCAAAA7O7D8V8m+kAlFHAA/78Z8N8g+s/0FSAA/38R92+g/sGjAA/++O9N/+EYAAAA+WCVEuAAAABm/7AAAAAAAAAAAAAAAA6F6W6n8S+WAEHPAAAA7M667093AuGtAAAA7S8e/iBoIVAA/j+d/X/KHNAAAA/JDhIBAAAA/6CDAAAAAAAAAAAAAAAA667R87+E/SF3AAAA7z83+2AhHjAA/++T/AA6DfAAAA9gDyGgAAAABrCCAAAAAAAAAAAAAAAA7m87+3BwH1AA/8/FAkCXEzAA/5+VCHF5AA/2B4AAAAAAAAAAAAAAAAAA+z+2/I/+AAAA/aBIAAAAAADDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA414n4s6W9cAWIRAAAA6K4u7f+UBDIZAA/56X7a+vBrJQAA/99u/RBZI8AAAA/yFQKIAAAAFxH/AAAAAAAAAAAAAAAA9B6d83/LCdISAAAA6W83+0BuIDAAAA9cAWB1E0AA/+/ADJHvAAAA/9AAAAAAAAAAAAAAAAAA719B/qCSKWAAAA/LBEBPImAAAAAKE4HyAAAA/3B7AAAAAAAAAAAAAAAA/1/e/8BbAAAA/VBpDoAAAAAAAAAAAAAAAAAAAAAAAAAA/1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+S779z+DAYFRAAAA7i9+/1B3HpAAAA/X/IDVE8AAAABiBGFjAAAAAAB7AAAAAAAAAAAAAAAA7P82+lCzIOAAAA+XAsAbFWAAAABPB8DKAAAA/7AAAAAAAAAAAAAAAAAA/cA7/tAAAAAA/S/6AAAAAAAAAAAAAAAAAAAAAAAAAAAABrAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA96/u+xATHaAAAA/UAB/qB+AAAA/IBRB4AAAA//AAAAAAAAAAAAAAAAAA/+/fAAAAAAAAAt/9/+AAAA/8AAAAAAAAAAAAAAAAAA/7B8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA///+/+AAAAAAAAAA//AAAA/2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', iw: [[5.233,0.516,-2.096,-1.18,0.017,0.014],[5.33,0.119,-2.383,-1.216,-3.082,-0.007]] }; // fitted: tools/engine/fit-eval.js
  const SH = (k) => 2 * (k < 0 ? k + 5 : k + 4); // bit position of offset k in a cell's line code
  function patSetup() { // lazily: only the boss pays for the tables (~2.5 MB)
    LN = new Int16Array(4 * 11 * NN); // LN[(d * 11 + k + 5) * NN + x] = cell k steps from x along DIRS[d], or -1
    DIRS.forEach(([dr, dc], d) => { for (let k = -5; k <= 5; k++) for (let x = 0; x < NN; x++) { const r = ((x / N) | 0) + dr * k, c = x % N + dc * k; LN[(d * 11 + k + 5) * NN + x] = inside(r, c) ? r * N + c : -1; } });
    SQ = []; // cells within 2 (5x5 square)
    for (let x = 0; x < NN; x++) { const r = (x / N) | 0, c = x % N, s = []; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (inside(r + i, c + j)) s.push((r + i) * N + c + j); SQ.push(Int16Array.from(s)); }
    PT = [null, new Int8Array(1 << 20).fill(-1), new Int8Array(1 << 20).fill(-1)];
    CMEMO = [new Int8Array(177147).fill(-1), new Int8Array(177147).fill(-1)];
    CODE = new Int32Array(4 * NN); CL = [null, new Uint8Array(4 * NN), new Uint8Array(4 * NN)];
    CNT = [null, new Int32Array(3), new Int32Array(3)]; NEAR = new Int16Array(NN); BD = new Uint8Array(NN);
    CI = [null, new Uint16Array(NN), new Uint16Array(NN)]; SV = [null, new Float64Array(2), new Float64Array(2)];
    COMBO = new Uint16Array(11 ** 4); FL = [null, new Uint8Array(NCB), new Uint8Array(NCB)];
    const idx = new Map();
    for (let a = 0; a < 11 ** 4; a++) {
      const cs = [a % 11, ((a / 11) | 0) % 11, ((a / 121) | 0) % 11, (a / 1331) | 0].sort((x, y) => y - x), k = cs.join();
      if (!idx.has(k)) { const n = idx.size; idx.set(k, n); FL[1][n] = comboFlags(1, cs); FL[2][n] = comboFlags(2, cs); }
      COMBO[a] = idx.get(k);
    }
    const dec = (str) => Float64Array.from({ length: NCB }, (_, i) => { const v = str ? B64.indexOf(str[2 * i]) * 64 + B64.indexOf(str[2 * i + 1]) : 0; return ((v ^ 2048) - 2048) / 128; });
    ET = [null, [dec(TAB.e10), dec(TAB.e11)], [dec(TAB.e20), dec(TAB.e21)]];
    CT = [null, [dec(TAB.c10), dec(TAB.c11)], [dec(TAB.c20), dec(TAB.c21)]];
  }
  // w: 11 cells, w[5] = the stone just placed; 1 own, 2 blocked (enemy or edge), 0 empty. exact = black (five must be exactly 5)
  function centerRun(w, exact) { // 1 five through the centre, 2 overline (black), 0 neither
    let lo = 5, hi = 5;
    while (lo > 0 && w[lo - 1] === 1) lo--;
    while (hi < 10 && w[hi + 1] === 1) hi++;
    const n = hi - lo + 1;
    return n === 5 || (n > 5 && !exact) ? 1 : n > 5 ? 2 : 0;
  }
  function lineClass(w, exact) {
    let key = 0; for (let i = 0; i < 11; i++) key = key * 3 + w[i];
    const m = CMEMO[exact][key]; if (m >= 0) return m;
    let res = 0;
    const s = centerRun(w, exact);
    if (s) res = s === 1 ? C_5 : C_OL;
    else {
      let fives = 0;
      for (let e = 0; e < 11; e++) if (!w[e]) { w[e] = 1; if (centerRun(w, exact) === 1) fives++; w[e] = 0; }
      if (fives) res = fives >= 2 ? C_F4 : C_B4;
      else for (let e = 0; e < 11; e++) if (!w[e]) { w[e] = 1; const c = lineClass(w, exact); w[e] = 0; if (c >= C_B2 && c <= C_F4 && c - 2 > res) res = c - 2; }
    }
    return (CMEMO[exact][key] = res);
  }
  const W11 = [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0];
  function patClass(p, code) {
    const v = PT[p][code]; if (v >= 0) return v;
    for (let i = 0; i < 11; i++) if (i !== 5) { const s = (code >> (2 * (i < 5 ? i : i - 1))) & 3; W11[i] = !s ? 0 : s === p ? 1 : 2; }
    W11[5] = 1;
    return (PT[p][code] = lineClass(W11, p === 1 ? 1 : 0));
  }
  // a cell's 4 classes for p, sorted, as one of 1001 combo indexes; per combo: threat flags for p
  // FL bits: 1 five now, 2 open four / 4-4 / 4-3 (black: not when 3-3 or 6+ makes it forbidden), 4 makes some four
  function comboFlags(p, cs) {
    let five = 0, four = 0, f4 = 0, f3 = 0, ol = 0;
    for (const c of cs) { if (c === C_5) five++; else if (c === C_F4) { f4++; four++; } else if (c === C_B4) four++; else if (c === C_F3) f3++; else if (c === C_OL) ol++; }
    if (five) return 1 | 4;
    if (p === 1 && (ol || f3 >= 2)) return four ? 4 : 0; // (likely) forbidden for black
    return (f4 || four >= 2 || (four && f3) ? 2 : 0) | (four ? 4 : 0);
  }
  function ciOf(p, x) { const cl = CL[p]; return COMBO[((cl[x] * 11 + cl[NN + x]) * 11 + cl[2 * NN + x]) * 11 + cl[3 * NN + x]]; }
  function cellFeat(p, x, s) { // add (s = 1) / remove (s = -1) empty cell x's table values and flags for p
    const ci = CI[p][x], f = FL[p][ci], sv = SV[p];
    sv[0] += s * ET[p][0][ci]; sv[1] += s * ET[p][1][ci];
    if (f & 1) CNT[p][0] += s; if (f & 2) CNT[p][1] += s; if (f & 4) CNT[p][2] += s;
  }
  function patInit(b) {
    if (!LN) patSetup();
    for (let x = 0; x < NN; x++) BD[x] = b[(x / N) | 0][x % N];
    CNT[1].fill(0); CNT[2].fill(0); SV[1].fill(0); SV[2].fill(0); NEAR.fill(0);
    for (let x = 0; x < NN; x++) {
      if (BD[x]) for (const y of SQ[x]) NEAR[y]++;
      for (let d = 0; d < 4; d++) {
        let code = 0;
        for (let k = -5; k <= 5; k++) if (k) { const y = LN[(d * 11 + k + 5) * NN + x]; code |= (y < 0 ? 3 : BD[y]) << SH(k); }
        CODE[d * NN + x] = code;
        if (!BD[x]) { CL[1][d * NN + x] = patClass(1, code); CL[2][d * NN + x] = patClass(2, code); }
      }
    }
    for (let x = 0; x < NN; x++) if (!BD[x]) { CI[1][x] = ciOf(1, x); CI[2][x] = ciOf(2, x); cellFeat(1, x, 1); cellFeat(2, x, 1); }
  }
  // place (v = 1|2) or remove (v = 0) a stone at x, updating codes, classes and counts of the cells in line with it
  function patSet(x, v) {
    if (v) { cellFeat(1, x, -1); cellFeat(2, x, -1); }
    for (let d = 0; d < 4; d++) for (let k = -5; k <= 5; k++) {
      if (!k) continue;
      const y = LN[(d * 11 - k + 5) * NN + x]; // x sits at offset k from y
      if (y < 0) continue;
      const i = d * NN + y, code = (CODE[i] & ~(3 << SH(k))) | (v << SH(k));
      if (BD[y]) { CODE[i] = code; continue; }
      cellFeat(1, y, -1); cellFeat(2, y, -1);
      CODE[i] = code; CL[1][i] = patClass(1, code); CL[2][i] = patClass(2, code);
      CI[1][y] = ciOf(1, y); CI[2][y] = ciOf(2, y);
      cellFeat(1, y, 1); cellFeat(2, y, 1);
    }
    const sq = SQ[x];
    if (v) { BD[x] = v; for (let j = 0; j < sq.length; j++) NEAR[sq[j]]++; return; }
    BD[x] = 0; for (let j = 0; j < sq.length; j++) NEAR[sq[j]]--;
    for (let d = 0; d < 4; d++) { const i = d * NN + x; CL[1][i] = patClass(1, CODE[i]); CL[2][i] = patClass(2, CODE[i]); }
    CI[1][x] = ciOf(1, x); CI[2][x] = ciOf(2, x);
    cellFeat(1, x, 1); cellFeat(2, x, 1);
  }
  // Eval for the side to move p (logit of p's winrate, x ESCALE): sum over empty cells of ET[colour][own/opp][combo]
  // plus threat indicators (weights TAB.iw): p has an open-four-like cell and the opponent no five cell; ... and the
  // opponent cannot even four; the opponent has a five cell; an open-four-like cell; both; bias.
  const NI = 6, IF = new Float64Array(NI);
  function indFeat(p) {
    const m = CNT[p], o = CNT[3 - p], i0 = m[1] > 0 && !o[0];
    IF[0] = +i0; IF[1] = +(i0 && !o[2]); IF[2] = +(o[0] > 0); IF[3] = +(o[1] > 0); IF[4] = +(o[0] > 0 && o[1] > 0); IF[5] = 1;
    return IF;
  }
  const ESCALE = 1000;
  function patEval(p) {
    const q = 3 - p;
    if (CNT[p][0]) return WINV;
    if (CNT[q][0] >= 2) return -WINV;
    const f = indFeat(p), w = TAB.iw[p - 1];
    let z = SV[p][0] + SV[q][1];
    for (let i = 0; i < NI; i++) z += w[i] * f[i];
    return Math.round(z * ESCALE);
  }
  function patCands(b, p, K) {
    const q = 3 - p, list = [], blocks = [];
    for (let x = 0; x < NN; x++) {
      if (BD[x] || !NEAR[x]) continue;
      let mine5 = false, opp5 = false, f3 = 0, ol = false;
      for (let d = 0; d < 4; d++) {
        const c = CL[p][d * NN + x];
        if (c === C_5) mine5 = true; else if (c === C_F3) f3++; else if (c === C_OL) ol = true;
        if (CL[q][d * NN + x] === C_5) opp5 = true;
      }
      const r = (x / N) | 0, col = x % N;
      if (mine5) return [{ row: r, col, win: true, block: false, pri: WINV }]; // a five is never forbidden
      if (p === 1 && (ol || f3 >= 2) && forbidden(b, r, col)) continue; // only such cells can be forbidden (see forbidden)
      const m = { row: r, col, win: false, block: opp5, pri: CT[p][0][CI[p][x]] + CT[p][1][CI[q][x]] };
      if (opp5) blocks.push(m);
      list.push(m);
    }
    if (blocks.length) return blocks.slice(0, 2);
    list.sort((a, b2) => b2.pri - a.pri);
    return list.slice(0, K);
  }

  // transposition table (per bestMove call): same position reached by a different move order is searched once
  const Z = [0, 1, 2].map(() => Array.from({ length: N * N }, () => (Math.random() * 4294967296) | 0));
  let TT = new Map();
  function negamax(b, depth, alpha, beta, p, K, dl, h) {
    NODES++;
    if (Date.now() > dl.t) { dl.out = true; return 0; }
    if (depth === 0) return PAT ? patEval(p) : evaluate(b, p);
    const a0 = alpha, key = h ^ (p === 2 ? 0x5bd1e995 : 0), e = TT.get(key);
    if (e && e.d >= depth) {
      if (e.f === 0) return e.v;
      if (e.f === 1 && e.v > alpha) alpha = e.v; else if (e.f === 2 && e.v < beta) beta = e.v;
      if (alpha >= beta) return e.v;
    }
    const cands = PAT ? patCands(b, p, K) : candidates(b, p, K);
    if (!cands.length) return 0;
    if (cands[0].win) return FIVE + depth;
    let best = -Infinity;
    for (const m of cands) {
      b[m.row][m.col] = p; if (PAT) patSet(m.row * N + m.col, p);
      const s = -negamax(b, depth - 1, -beta, -alpha, 3 - p, K, dl, h ^ Z[p][m.row * N + m.col]);
      b[m.row][m.col] = 0; if (PAT) patSet(m.row * N + m.col, 0);
      if (dl.out) return 0;
      if (s > best) best = s;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    TT.set(key, { d: depth, v: best, f: best <= a0 ? 2 : best >= beta ? 1 : 0 }); // 2 = upper bound, 1 = lower bound, 0 = exact
    return best;
  }
  const hashOf = (b) => { let h = 0; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (b[r][c]) h ^= Z[b[r][c]][r * N + c]; return h; };
  const ROOT_MIX = 0.3; // root order = searched score + 0.3 x candidate prior (logit units; tuned on M1, docs/boss-ai-v2.md)
  // boss root ordering: full-window shallow search score of each move (pattern state must be initialised for b)
  function rootScores(b, p, list, depth, K, dl) {
    const h0 = hashOf(b);
    for (const m of list) {
      const x = m.row * N + m.col;
      b[m.row][m.col] = p; patSet(x, p);
      m.sc = -negamax(b, depth - 1, -Infinity, Infinity, 3 - p, K, dl, h0 ^ Z[p][x]);
      b[m.row][m.col] = 0; patSet(x, 0);
    }
    return list;
  }

  function bestMove(b, p, level) {
    const L = LEVELS[level] || LEVELS.normal;
    koreanBlack = p === 1 || !!L.pat; // the pattern boss also knows a black opponent cannot play 3-3 / 6+
    PAT = false;
    const stones = b.flat().filter(Boolean).length;
    if (!stones) return { row: 7, col: 7 };
    if (L.book) { const m = bookMove(b, p); if (m) return m; }
    if (L.pat) { patInit(b); PAT = true; }
    if (stones === 1) { // answer next to the first stone
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (b[r][c]) {
        const d = [[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 1], [1, 0]][Math.floor(Math.random() * 6)];
        if (inside(r + d[0], c + d[1])) return { row: r + d[0], col: c + d[1] };
      }
    }
    // adaptive: the longer the human's win streak, the deeper/wider the search (normal and up)
    const boost = level === 'easy' ? 0 : Math.min(mem.streak, 3);
    const D = L.depth + (boost > 0 ? Math.min(boost, 2) : 0), KK = L.K + boost * 2, MS = L.ms;
    const cand = (k) => PAT ? patCands(b, p, k) : candidates(b, p, k);
    let cands = cand(L.rootK ? 999 : KK); // boss: every legal near cell, cut to rootK after the shallow pre-search below
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
        for (const m of cand(30)) {
          if (Date.now() > d0.t) break;
          b[m.row][m.col] = p;
          const safe = !threat(q);
          b[m.row][m.col] = 0;
          if (safe && Date.now() <= d0.t) safeMoves.push(m);
        }
        if (safeMoves.length) { lost = false; cands = safeMoves.slice(0, L.rootK || KK); }
        if (Date.now() > d0.t) lost = false; // ran out of time: not sure it is lost
      }
    }
    TT = new Map();
    if (L.rootK && cands.length > L.rootK) { // boss: rank root moves by a full-window depth-preD search (+ prior), keep rootK + defense cells
      const pre = { t: Date.now() + MS * 0.1, out: false };
      rootScores(b, p, cands, L.preD, KK, pre);
      if (!pre.out) cands.sort((x, y) => (y.sc + ROOT_MIX * y.pri * ESCALE) - (x.sc + ROOT_MIX * x.pri * ESCALE));
      cands = cands.filter((m, i) => i < L.rootK || bonus.has(m.row * N + m.col));
    }
    let best = cands[0], rawBest = 0;
    const dl = { t: Date.now() + MS, out: false }, h0 = hashOf(b);
    for (let depth = 2; depth <= D; depth++) {
      let iterBest = null, bs = -Infinity, alpha = -Infinity, iterRaw = 0;
      const order = best ? [best, ...cands.filter(m => m !== best)] : cands;
      for (const m of order) {
        b[m.row][m.col] = p; if (PAT) patSet(m.row * N + m.col, p);
        const bn = bonus.get(m.row * N + m.col) || 0; // defensive bonus: searched score + bonus
        const raw = -negamax(b, depth - 1, -Infinity, bn - alpha, 3 - p, KK, dl, h0 ^ Z[p][m.row * N + m.col]);
        b[m.row][m.col] = 0; if (PAT) patSet(m.row * N + m.col, 0);
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

  const api = { LEVELS, bestMove, evaluate, forbidden, forkCells, openFourCells, vct, posKey, rotKey, learn, setMemory, getMemory, setBook, predict, candidates, canon, toCanon, fromCanon, setOpening, bookMove,
    nodes: () => NODES, pat: { root: (b, p, list, d, K) => { PAT = true; TT = new Map(); const r = rootScores(b, p, list, d, K, { t: Infinity, out: false }); PAT = false; return r; }, init: patInit, set: patSet, cands: patCands, eval: patEval, indFeat, cnt: () => CNT, cl: () => CL, ci: () => CI, bd: () => BD, NCB, NI, TAB } }; // pat: tools/tests only
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GomokuAI = api;
})(typeof window !== 'undefined' ? window : globalThis);
