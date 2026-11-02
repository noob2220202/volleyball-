'use strict';
// ===== CPU 상대 =====
const AI_LEVELS = [
  { name: '쉬움', err: 22, react: 14, spike: 0.25, dive: false, dead: 8 },
  { name: '보통', err: 9, react: 6, spike: 0.65, dive: true, dead: 4 },
  { name: '어려움', err: 3, react: 1, spike: 0.95, dive: true, dead: 2 },
];

function simBall(b, steps, stopY) {
  const s = { x: b.x, y: b.y, vx: b.vx, vy: b.vy };
  const R = C.BALL_R;
  for (let t = 1; t <= steps; t++) {
    s.vy += C.BALL_G; s.x += s.vx; s.y += s.vy;
    if (s.x < R) { s.x = R; s.vx = Math.abs(s.vx); }
    if (s.x > C.W - R) { s.x = C.W - R; s.vx = -Math.abs(s.vx); }
    if (s.y > C.NET_TOP && Math.abs(s.x - C.NET_X) < C.NET_HW + R) {
      s.vx = -s.vx * 0.7; s.x = C.NET_X + (s.x < C.NET_X ? -1 : 1) * (C.NET_HW + R);
    }
    if (stopY !== undefined && s.vy > 0 && s.y >= stopY) { s.t = t; return s; }
    if (s.y + R >= C.GROUND) { s.t = t; return s; }
  }
  s.t = steps;
  return s;
}

class CpuBrain {
  constructor(side, level) {
    this.side = side; this.level = level;
    this.err = 0; this.lastHits = -1; this.reactUntil = 0; this.target = C.START_X[side];
    this.jumpRoll = 0; this.dir = 0; this.decided = -1;
  }
  input(g) {
    const L = AI_LEVELS[this.level] || AI_LEVELS[1];
    const side = this.side, p = g.players[side], b = g.ball;
    const toward = side === 0 ? 1 : -1;
    const inp = { l: 0, r: 0, u: 0, d: 0, a: 0 };
    if (g.phase === 'over') return inp;
    const mine = x => (side === 0 ? x < C.NET_X : x > C.NET_X);

    if (this.lastHits !== g.hits || g.phase === 'ready' && g.t === 69) {
      this.lastHits = g.hits;
      this.err = (Math.random() * 2 - 1) * L.err;
      this.reactUntil = g.frame + L.react;
      this.jumpRoll = Math.random();
      this.dir = Math.floor(Math.random() * 4);
    }

    const pred = simBall(b, 200, C.GROUND - 44);
    let target;
    if (g.phase === 'ready') {
      target = g.server === side ? b.x - toward * (5 + Math.abs(this.err) * 0.4) : C.START_X[side];
    } else if (mine(pred.x)) {
      target = pred.x - toward * 7 + this.err;
    } else {
      target = side === 0 ? 150 : 330;
    }
    if (g.frame >= this.reactUntil || g.phase === 'ready') this.target = target;
    const dx = this.target - p.x;
    if (dx > L.dead) inp.r = 1; else if (dx < -L.dead) inp.l = 1;

    if (g.phase !== 'play') return inp;

    // 다이빙
    if (L.dive && p.st === 0 && mine(pred.x) && Math.abs(pred.x - p.x) > 42 && pred.t < 20 && b.vy > 0) {
      inp.a = 1;
      inp.r = pred.x > p.x ? 1 : 0; inp.l = pred.x < p.x ? 1 : 0;
      return inp;
    }

    // 점프 스파이크
    if (p.st === 0 && this.jumpRoll < L.spike) {
      const f = simBall(b, 18);
      if (mine(f.x) && Math.abs(f.x - C.NET_X) < 130 && Math.abs(f.x - p.x) < 24 &&
          f.y > 60 && f.y < 128 && f.t >= 17) {
        inp.u = 1;
      }
    }
    if (p.st === 1) {
      const hx = p.x, hy = p.y - 17;
      const n = simBall(b, 2);
      if (Math.hypot(n.x - hx, n.y - hy) < 40 && mine(b.x) && p.sw === 0) {
        inp.a = 1;
        inp.l = 0; inp.r = 0;
        if (this.dir === 1) inp.u = 1;
        else if (this.dir === 2) inp.d = 1;
        else if (this.dir === 3) { if (toward > 0) inp.r = 1; else inp.l = 1; }
      }
    }
    return inp;
  }
}
