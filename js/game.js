'use strict';
// ===== 말랑배구 : 게임 시뮬레이션 (렌더링과 독립) =====
const C = {
  W: 480, H: 270,
  GROUND: 236,
  NET_X: 240, NET_HW: 3, NET_TOP: 146,
  BALL_R: 10, BALL_G: 0.25, BALL_MAX: 15,
  P_R: 17, P_H: 34,
  P_SPEED: 3.1, P_JUMP: 8.8, P_G: 0.42,
  START_X: [70, 410],
};

// 플레이어 상태(st): 0 지상, 1 점프, 2 다이빙, 3 다이빙 후 일어나기
function makePlayer(side) {
  return { side, x: C.START_X[side], y: C.GROUND, vx: 0, vy: 0, st: 0, t: 0,
    sw: 0, dd: 1, land: 0, emo: 0, pu: 0, pa: 0, jf: 99 };
}

function newGame(winScore) {
  const g = {
    phase: 'ready', t: 100, score: [0, 0], server: 0, win: winScore || 15,
    players: [makePlayer(0), makePlayer(1)],
    ball: { x: 0, y: 0, vx: 0, vy: 0, rot: 0, pw: 0, cd: 0, cs: -1 },
    ev: [], frame: 0, winner: -1, hits: 0,
  };
  resetRally(g, 100);
  return g;
}

function resetRally(g, t) {
  for (const p of g.players) {
    p.x = C.START_X[p.side]; p.y = C.GROUND; p.vx = 0; p.vy = 0;
    p.st = 0; p.t = 0; p.sw = 0; p.land = 0; p.emo = 0;
  }
  const b = g.ball;
  b.x = C.START_X[g.server]; b.y = 56; b.vx = 0; b.vy = 0; b.pw = 0; b.cd = 0; b.cs = -1;
  g.phase = 'ready'; g.t = t || 70;
}

function emit(g, k, x, y, s) { g.ev.push({ k, x: Math.round(x), y: Math.round(y), s }); }

function stepGame(g, inputs) {
  g.ev = [];
  g.frame++;
  const over = g.phase === 'over';
  for (let i = 0; i < 2; i++) {
    updatePlayer(g, g.players[i], over ? NO_INPUT : inputs[i]);
  }
  if (g.phase === 'ready') {
    g.t--;
    const b = g.ball; b.rot += 0.02;
    if (g.t <= 0) { g.phase = 'play'; emit(g, 'whistle', b.x, b.y); }
  } else {
    updateBall(g, inputs);
  }
  if (g.phase === 'point') {
    g.t--;
    if (g.t <= 0) {
      if (g.score[0] >= g.win || g.score[1] >= g.win) {
        g.phase = 'over'; g.t = 0;
        g.winner = g.score[0] > g.score[1] ? 0 : 1;
        g.players[g.winner].emo = 1; g.players[1 - g.winner].emo = 2;
        emit(g, 'win', C.NET_X, 100, g.winner);
      } else {
        resetRally(g, 70);
      }
    }
  } else if (g.phase === 'over') {
    g.t++;
  }
}

const NO_INPUT = { l: 0, r: 0, u: 0, d: 0, a: 0 };

function updatePlayer(g, p, inp) {
  const upPressed = inp.u && !p.pu;
  const actPressed = inp.a && !p.pa;
  p.pu = inp.u ? 1 : 0; p.pa = inp.a ? 1 : 0;
  const dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
  if (p.land > 0) p.land--;
  if (p.sw > 0) p.sw--;

  if (g.phase === 'over') {
    // 승자는 깡총깡총, 패자는 시무룩
    if (p.st === 0 && p.emo === 1 && g.t % 40 === 10) { p.vy = -5.5; p.st = 1; }
    p.vx = 0;
  } else if (p.st === 0) {
    if (actPressed && dir !== 0) {
      p.st = 2; p.t = 24; p.dd = dir; p.vx = dir * 5.6; p.vy = -2.6;
      emit(g, 'dive', p.x, p.y);
    } else if (inp.u) {
      p.st = 1; p.vy = -C.P_JUMP; p.vx = dir * C.P_SPEED; p.jf = 0;
      emit(g, 'jump', p.x, p.y);
    } else {
      p.vx = dir * C.P_SPEED;
    }
  } else if (p.st === 1) {
    p.vx = dir * C.P_SPEED;
    p.jf++;
    if (upPressed && p.jf <= 16) {
      // 점프 버튼 따닥 → 슬라이딩 (방향키 방향, 없으면 공 쪽으로)
      const b = g.ball;
      const dd = dir || (b && b.x < p.x ? -1 : 1);
      p.st = 2; p.t = 26; p.dd = dd; p.vx = dd * 6; p.vy = Math.max(p.vy, 1.5); p.sw = 0;
      emit(g, 'dive', p.x, p.y);
    } else if (actPressed) { p.sw = 10; emit(g, 'swing', p.x, p.y - 30); }
  } else if (p.st === 2) {
    p.t--;
    if (p.y >= C.GROUND) p.vx *= 0.93;
    if (p.t <= 0) { p.st = 3; p.t = 14; p.vx = 0; }
  } else if (p.st === 3) {
    p.vx = 0; p.t--;
    if (p.t <= 0) p.st = 0;
  }

  if (p.st === 1 || p.st === 2 || p.y < C.GROUND) p.vy += C.P_G;
  p.x += p.vx; p.y += p.vy;
  if (p.y >= C.GROUND) {
    p.y = C.GROUND;
    if (p.vy > 0 && p.st === 1) { p.st = 0; p.land = 6; }
    p.vy = 0;
  }
  const minX = p.side === 0 ? 16 : C.NET_X + C.NET_HW + 14;
  const maxX = p.side === 0 ? C.NET_X - C.NET_HW - 14 : C.W - 16;
  if (p.x < minX) p.x = minX;
  if (p.x > maxX) p.x = maxX;
}

function hitCircle(p) {
  if (p.st === 2 || p.st === 3) return { x: p.x + p.dd * 4, y: p.y - 10, r: 15 };
  return { x: p.x, y: p.y - 17, r: C.P_R };
}

function updateBall(g, inputs) {
  const b = g.ball, R = C.BALL_R;
  b.vy += C.BALL_G;
  b.x += b.vx; b.y += b.vy;
  b.rot += b.vx * 0.06;
  if (b.pw > 0) b.pw--;
  if (b.cd > 0) b.cd--;

  // 벽
  if (b.x < R) { b.x = R; b.vx = Math.abs(b.vx); if (Math.abs(b.vx) > 2) emit(g, 'wall', b.x, b.y); }
  if (b.x > C.W - R) { b.x = C.W - R; b.vx = -Math.abs(b.vx); if (Math.abs(b.vx) > 2) emit(g, 'wall', b.x, b.y); }

  // 네트 (사각형과 원 충돌)
  const nx0 = C.NET_X - C.NET_HW, nx1 = C.NET_X + C.NET_HW;
  const cx = Math.max(nx0, Math.min(b.x, nx1));
  const cy = Math.max(C.NET_TOP, Math.min(b.y, C.GROUND));
  let dx = b.x - cx, dy = b.y - cy;
  let d2 = dx * dx + dy * dy;
  if (d2 < R * R) {
    let d = Math.sqrt(d2), nx, ny;
    if (d < 0.001) { nx = b.x < C.NET_X ? -1 : 1; ny = 0; d = 0; }
    else { nx = dx / d; ny = dy / d; }
    b.x = cx + nx * R; b.y = cy + ny * R;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= 1.7 * vn * nx; b.vy -= 1.7 * vn * ny;
      emit(g, 'net', b.x, b.y);
    }
  }

  // 플레이어
  for (let i = 0; i < 2; i++) {
    const p = g.players[i];
    if (b.cd > 0 && b.cs === i) continue;
    const h = hitCircle(p);
    dx = b.x - h.x; dy = b.y - h.y;
    const rr = R + h.r;
    d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) continue;
    const d = Math.sqrt(d2) || 1;
    const nx = dx / d, ny = dy / d;
    b.x = h.x + nx * rr; b.y = h.y + ny * rr;
    b.cd = 8; b.cs = i; g.hits++;
    const toward = i === 0 ? 1 : -1;
    const inp = inputs[i] || NO_INPUT;
    if (p.st === 1 && p.sw > 0 && g.phase !== 'over') {
      // 스파이크!
      const hdir = ((inp.r ? 1 : 0) - (inp.l ? 1 : 0)) * toward;
      b.vx = toward * (hdir > 0 ? 12.5 : hdir < 0 ? 6.5 : 10);
      b.vy = inp.u ? -5.5 : inp.d ? 9 : 3.4;
      b.pw = 24; p.sw = 0;
      emit(g, 'spike', b.x, b.y, i);
    } else if (p.st === 2 || p.st === 3) {
      b.vx = nx * 3 + p.dd * 1.5;
      b.vy = -9;
      emit(g, 'bump', b.x, b.y, i);
    } else {
      b.vx = nx * 6.2 + p.vx * 0.35;
      b.vy = -Math.max(7.6, Math.abs(b.vy) * 0.55);
      if (p.st === 1) b.vy += p.vy * 0.3;
      emit(g, 'bump', b.x, b.y, i);
    }
  }

  // 속도 제한
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > C.BALL_MAX) { b.vx *= C.BALL_MAX / sp; b.vy *= C.BALL_MAX / sp; }

  // 바닥
  if (b.y + R >= C.GROUND) {
    b.y = C.GROUND - R;
    if (g.phase === 'play') {
      const scorer = b.x < C.NET_X ? 1 : 0;
      g.score[scorer]++;
      g.server = scorer;
      g.phase = 'point'; g.t = 110;
      emit(g, 'ground', b.x, C.GROUND, scorer);
      emit(g, 'point', b.x, C.GROUND, scorer);
    } else if (Math.abs(b.vy) > 1.5) {
      emit(g, 'thud', b.x, C.GROUND);
    }
    b.vy = -Math.abs(b.vy) * 0.5;
    b.vx *= 0.75;
    if (Math.abs(b.vy) < 0.8) b.vy = 0;
  }
}

// ===== 네트워크용 압축 =====
const PHASES = ['ready', 'play', 'point', 'over'];
const r1 = v => Math.round(v * 10) / 10;
function packGame(g) {
  return {
    p: g.players.map(p => [r1(p.x), r1(p.y), r1(p.vx), r1(p.vy), p.st, p.t, p.sw, p.dd, p.land, p.emo, p.jf]),
    b: [r1(g.ball.x), r1(g.ball.y), r1(g.ball.vx), r1(g.ball.vy), Math.round(g.ball.rot * 100) / 100, g.ball.pw],
    s: g.score, h: PHASES.indexOf(g.phase), t: g.t, f: g.frame, v: g.server, w: g.winner, W: g.win, e: g.ev,
  };
}
function unpackGame(o, g) {
  g = g || newGame(o.W);
  o.p.forEach((a, i) => {
    const p = g.players[i];
    [p.x, p.y, p.vx, p.vy, p.st, p.t, p.sw, p.dd, p.land, p.emo, p.jf] = a;
  });
  const b = g.ball;
  [b.x, b.y, b.vx, b.vy, b.rot, b.pw] = o.b;
  g.score = o.s; g.phase = PHASES[o.h]; g.t = o.t; g.frame = o.f;
  g.server = o.v; g.winner = o.w; g.win = o.W; g.ev = o.e || [];
  return g;
}
