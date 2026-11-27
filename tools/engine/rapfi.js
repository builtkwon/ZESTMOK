// Minimal Gomocup (Piskvork) client for a LOCAL Rapfi build. PC only: the engine is never shipped (docs/boss-ai-v2.md).
// Env RAPFI = path to pbrain-rapfi (its config.toml + model sit next to it; coord_conversion_mode = "none").
// Moves are [row, col] in play order, black first. Rule 4 = renju; our local build is patched to allow black 4-4 (Korean rule).
const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

class Rapfi {
  constructor(bin = process.env.RAPFI) {
    if (!bin) throw new Error('set RAPFI=/path/to/pbrain-rapfi');
    this.p = spawn(bin, [], { cwd: path.dirname(bin) });
    this.q = []; this.waiters = []; this.last = {};
    readline.createInterface({ input: this.p.stdout }).on('line', (l) => {
      if (l.startsWith('INFO EVAL ')) this.last.eval = +l.slice(10);
      else if (l.startsWith('INFO WINRATE ')) this.last.wr = +l.slice(13);
      if (l.startsWith('MESSAGE') || l.startsWith('DEBUG') || l.startsWith('INFO')) return this.onMsg && this.onMsg(l);
      if (l.startsWith('ERROR')) console.error('rapfi:', l);
      const w = this.waiters.shift(); if (w) w(l); else this.q.push(l);
    });
  }
  send(s) { this.p.stdin.write(s + '\n'); }
  line() { return this.q.length ? Promise.resolve(this.q.shift()) : new Promise((r) => this.waiters.push(r)); }
  async start(opts = {}) {
    this.send('START 15'); const ok = await this.line();
    if (ok !== 'OK') throw new Error('START: ' + ok);
    this.send('INFO rule 4');
    this.send('INFO show_detail 2'); // INFO EVAL / INFO WINRATE lines for the side to move
    this.limit(opts);
  }
  // one of: ms (time per move) or nodes (node cap; time set very large). depth optional.
  limit({ ms, nodes, depth } = {}) {
    this.send('INFO timeout_match 0');
    this.send('INFO timeout_turn ' + (nodes ? 600000 : ms || 1000));
    this.send('INFO max_node ' + (nodes || 0));
    if (depth) this.send('INFO max_depth ' + depth);
  }
  board(moves, cmd) { // stones in play order; 1 = side to move ("self"), 2 = opponent
    const me = moves.length % 2; // index parity of the side to move
    this.send(cmd);
    moves.forEach(([r, c], i) => this.send(`${c},${r},${i % 2 === me ? 1 : 2}`));
    this.send('DONE');
  }
  // engine's move for the side to move, with its eval and winrate (0..1) for that side. block = cells it may not play ("r,c")
  async best(moves, block = []) {
    this.send('YXBLOCKRESET');
    if (block.length) { this.send('YXBLOCK'); for (const k of block) { const [r, c] = k.split(',').map(Number); this.send(`${c},${r}`); } this.send('DONE'); }
    this.last = {};
    this.board(moves, 'BOARD');
    const [x, y] = (await this.line()).split(',').map(Number);
    return { move: [y, x], eval: this.last.eval, wr: this.last.wr };
  }
  async forbid(moves) { // black-to-move forbidden points (engine's rule), as "r,c" strings
    this.board(moves, 'YXBOARD');
    this.send('YXSHOWFORBID');
    const l = await this.line(); // "FORBID xxyyxxyy."
    const s = l.replace(/^FORBID /, '').replace(/\.$/, ''), out = [];
    for (let i = 0; i + 4 <= s.length; i += 4) out.push(+s.slice(i + 2, i + 4) + ',' + +s.slice(i, i + 2));
    return out;
  }
  quit() { this.send('END'); this.p.stdin.end(); }
}
module.exports = Rapfi;
