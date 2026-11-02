'use strict';
// ===== 렌더링 : 모든 그래픽은 코드로 그린 오리지널 픽셀아트 =====
const CHAR_NAMES = ['MOCHI', 'PENGU'];
const CHAR_NAMES_KO = ['모찌', '펭구'];

const PAL = {
  cat: { out: '#5a2e0e', body: '#ffb35a', light: '#fff0d6', dark: '#e07a26', cheek: '#ff7f95', ear: '#ff9fb4', foot: '#fff0d6' },
  peng: { out: '#141a3c', body: '#3f62d8', light: '#ffffff', dark: '#2a45a8', cheek: '#ff8fae', beak: '#ffa726', foot: '#ffa726' },
};

const Render = (() => {
  let bg = null;
  const ballFrames = [];
  const particles = [];
  const trail = [];
  let shake = 0, flash = 0, banner = null;

  function rng(seed) {
    return () => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function oval(ctx, cx, cy, rx, ry, col) {
    ctx.fillStyle = col;
    cx = Math.round(cx); cy = Math.round(cy);
    for (let y = -ry; y <= ry; y++) {
      const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
      ctx.fillRect(cx - w, cy + y, w * 2 + 1, 1);
    }
  }
  function ovalO(ctx, cx, cy, rx, ry, col, out) {
    oval(ctx, cx, cy, rx + 1, ry + 1, out);
    oval(ctx, cx, cy, rx, ry, col);
  }
  function px(ctx, x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), w, h); }

  // ---------- 배경 ----------
  function buildBG() {
    const c = document.createElement('canvas');
    c.width = C.W; c.height = C.H;
    const x = c.getContext('2d');
    const R = rng(7);
    const sky = ['#4fb8ff', '#62c2ff', '#78ccff', '#8fd6ff', '#a8e0ff', '#c2eaff'];
    const bh = 26;
    for (let i = 0; i < sky.length; i++) {
      x.fillStyle = sky[i]; x.fillRect(0, i * bh, C.W, bh);
      if (i < sky.length - 1) {
        x.fillStyle = sky[i + 1];
        for (let yy = 0; yy < 4; yy++)
          for (let xx = (yy % 2); xx < C.W; xx += (yy < 2 ? 4 : 2)) x.fillRect(xx, i * bh + bh - 4 + yy, 1, 1);
      }
    }
    // 해
    ovalO(x, 412, 40, 17, 17, '#fff4a0', '#ffe066');
    oval(x, 408, 36, 7, 7, '#fffbe0');
    // 구름
    const cloud = (cx, cy, s) => {
      oval(x, cx, cy + 3, 18 * s, 6 * s, '#d6efff');
      oval(x, cx - 10 * s, cy, 10 * s, 7 * s, '#ffffff');
      oval(x, cx + 4 * s, cy - 4 * s, 12 * s, 9 * s, '#ffffff');
      oval(x, cx + 16 * s, cy + 1, 9 * s, 6 * s, '#ffffff');
      x.fillStyle = '#d6efff'; x.fillRect(cx - 18 * s, cy + 6 * s, 42 * s, 2);
    };
    cloud(90, 40, 1); cloud(300, 70, 0.8); cloud(190, 22, 0.6); cloud(470, 95, 0.7);
    // 바다
    const sea = ['#2b86d9', '#2f93e3', '#3aa1ea', '#48b0f0'];
    for (let i = 0; i < 4; i++) { x.fillStyle = sea[i]; x.fillRect(0, 150 + i * 10, C.W, 10); }
    x.fillStyle = '#1f6fbf'; x.fillRect(0, 150, C.W, 2);
    for (let i = 0; i < 70; i++) {
      x.fillStyle = R() < 0.5 ? '#bfe6ff' : '#e8f7ff';
      x.fillRect(Math.floor(R() * C.W), 154 + Math.floor(R() * 34), 2 + Math.floor(R() * 5), 1);
    }
    // 작은 섬
    oval(x, 70, 152, 26, 5, '#3d9a5a');
    x.fillStyle = '#7a4a22'; x.fillRect(74, 132, 2, 18); x.fillRect(73, 136, 2, 6);
    oval(x, 75, 132, 9, 3, '#2f8a4c'); oval(x, 70, 134, 6, 2, '#2f8a4c'); oval(x, 81, 134, 6, 2, '#2f8a4c');
    // 돛단배
    x.fillStyle = '#ffffff'; x.fillRect(352, 156, 1, 1);
    for (let i = 0; i < 9; i++) { x.fillStyle = '#ffffff'; x.fillRect(352, 147 + i, Math.floor(i * 0.8) + 1, 1); }
    x.fillStyle = '#ff6b6b'; x.fillRect(347, 156, 14, 3);
    // 파도
    x.fillStyle = '#ffffff';
    for (let xx = 0; xx < C.W; xx += 12) { x.fillRect(xx, 189, 7, 1); x.fillRect(xx + 6, 191, 6, 1); }
    // 모래사장
    const sand = ['#e9c47a', '#f0cf88', '#f5d895', '#f8dfa2'];
    x.fillStyle = '#d9ad5f'; x.fillRect(0, 192, C.W, 3);
    for (let i = 0; i < 4; i++) { x.fillStyle = sand[i]; x.fillRect(0, 195 + i * 6, C.W, i === 3 ? 80 : 6); }
    for (let i = 0; i < 380; i++) {
      const yy = 196 + Math.floor(R() * 74);
      x.fillStyle = R() < 0.6 ? '#d9b066' : '#fff2c8';
      x.fillRect(Math.floor(R() * C.W), yy, 1, 1);
    }
    // 코트 라인
    x.fillStyle = '#ffffff';
    x.fillRect(10, C.GROUND + 1, C.W - 20, 1);
    x.fillStyle = '#e2b766';
    x.fillRect(10, C.GROUND + 2, C.W - 20, 1);
    // 조개 & 불가사리
    x.fillStyle = '#ff9eb0'; x.fillRect(30, 252, 5, 2); x.fillRect(31, 251, 3, 1);
    x.fillStyle = '#ff7b4a';
    [[450, 256], [449, 255], [451, 255], [448, 256], [452, 256], [450, 254], [449, 257], [451, 257]].forEach(([a, b]) => x.fillRect(a, b, 1, 1));
    return c;
  }

  function buildBall() {
    const R = C.BALL_R, S = R * 2 + 3;
    const cols = ['#ffffff', '#ffcf3a', '#ffffff', '#3d7bff', '#ffffff', '#ff5a5a'];
    for (let f = 0; f < 24; f++) {
      const c = document.createElement('canvas'); c.width = S; c.height = S;
      const x = c.getContext('2d');
      const rot = f / 24 * Math.PI * 2;
      oval(x, R + 1, R + 1, R + 1, R + 1, '#3a2a1a');
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > R * R + R * 0.6) continue;
        let a = Math.atan2(dy, dx) + rot;
        let sct = Math.floor(((a / (Math.PI * 2)) * 6 % 6 + 6) % 6);
        let col = cols[sct];
        if (d2 < 5) col = '#ffffff';
        if (dx + dy > R * 0.95) col = shade(col);
        x.fillStyle = col; x.fillRect(R + 1 + dx, R + 1 + dy, 1, 1);
      }
      x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillRect(R - 4, R - 5, 3, 2); x.fillRect(R - 5, R - 3, 2, 1);
      ballFrames.push(c);
    }
  }
  function shade(col) {
    return { '#ffffff': '#c9d3e0', '#ffcf3a': '#d9a51f', '#3d7bff': '#2a59c4', '#ff5a5a': '#cc3c3c' }[col] || col;
  }

  function init() { bg = buildBG(); buildBall(); }

  // ---------- 캐릭터 ----------
  function drawCreature(ctx, kind, x, yb, f, sx, sy, o) {
    const P = PAL[kind];
    const rx = Math.round(15 * sx), ry = Math.round(15 * sy);
    const cy = yb - ry - 2;
    const fx = x + f * 3; // 얼굴 중심
    // 꼬리 (고양이)
    if (kind === 'cat') {
      ovalO(ctx, x - f * (rx + 1), cy + 1, 3, 5, P.body, P.out);
      oval(ctx, x - f * (rx + 1), cy - 3, 2, 2, P.dark);
    }
    // 발
    const lift = o.walk ? 1 : 0;
    if (!o.flat) {
      ovalO(ctx, x - 6, yb - 2 - (lift ? 1 : 0), 4, 2, P.foot, P.out);
      ovalO(ctx, x + 6, yb - 2 - (lift ? 0 : 1), 4, 2, P.foot, P.out);
    } else {
      ovalO(ctx, x - f * (rx + 2), yb - 4, 4, 2, P.foot, P.out);
    }
    // 뒷팔
    const arm = (ax, ay) => kind === 'cat' ? ovalO(ctx, ax, ay, 3, 3, P.body, P.out) : ovalO(ctx, ax, ay, 2, 5, P.dark, P.out);
    if (o.armsFwd) arm(x + f * (rx + 3), cy - 2);
    else if (o.cheer) arm(x - f * 10, cy - ry - 2);
    else arm(x - f * (rx - 1), cy + 3 - (o.air ? 6 : 0));
    // 귀 (고양이)
    if (kind === 'cat') {
      const ear = (ex) => {
        const top = cy - ry - 5;
        for (let i = 0; i < 9; i++) {
          const w = Math.floor(i / 1.4);
          px(ctx, ex - w - 1, top + i - 1, w * 2 + 3, 1, P.out);
        }
        for (let i = 0; i < 8; i++) {
          const w = Math.floor(i / 1.4);
          px(ctx, ex - w, top + i, w * 2 + 1, 1, i > 2 && i < 6 && w > 0 ? P.ear : P.body);
        }
      };
      ear(x - 8 + f); ear(x + 8 + f);
    } else {
      // 머리 깃털
      px(ctx, x - 1, cy - ry - 4, 2, 4, P.out); px(ctx, x + 1, cy - ry - 3, 2, 3, P.out);
      px(ctx, x, cy - ry - 3, 1, 3, P.dark);
    }
    // 몸통
    ovalO(ctx, x, cy, rx, ry, P.body, P.out);
    // 배 / 얼굴
    if (kind === 'cat') {
      oval(ctx, fx + f * 1, cy + Math.round(ry * 0.45), Math.round(rx * 0.55), Math.round(ry * 0.4), P.light);
      // 이마 줄무늬
      px(ctx, x - 3 + f, cy - ry + 1, 1, 3, P.dark); px(ctx, x + f, cy - ry + 1, 1, 4, P.dark); px(ctx, x + 3 + f, cy - ry + 1, 1, 3, P.dark);
      px(ctx, x - f * (rx - 2), cy - 2, 3, 1, P.dark); px(ctx, x - f * (rx - 2), cy + 1, 3, 1, P.dark);
    } else {
      oval(ctx, fx + f, cy + 1, Math.round(rx * 0.68), Math.round(ry * 0.72), P.light);
      px(ctx, fx - 1 + f, cy - ry + 2, 3, 4, P.body);
    }
    // 눈
    const ey = cy - 3;
    const e1 = fx - 5, e2 = fx + 4;
    const eye = (ex) => {
      if (o.emo === 1) { // 행복 ^^
        px(ctx, ex - 1, ey + 2, 1, 1, P.out); px(ctx, ex, ey + 1, 2, 1, P.out); px(ctx, ex + 2, ey + 2, 1, 1, P.out);
      } else if (o.emo === 2) { // 시무룩 ㅠㅠ
        px(ctx, ex - 1, ey + 1, 4, 1, P.out); px(ctx, ex, ey + 2, 2, 3, '#6cc3ff');
      } else if (o.blink) {
        px(ctx, ex - 1, ey + 2, 4, 1, P.out);
      } else if (o.hurt) { // > <
        px(ctx, ex, ey, 1, 1, P.out); px(ctx, ex + 1, ey + 1, 1, 1, P.out); px(ctx, ex, ey + 2, 1, 1, P.out);
      } else {
        px(ctx, ex, ey, 2, 4, P.out); px(ctx, ex, ey, 1, 1, '#ffffff');
      }
    };
    eye(e1); eye(e2);
    // 볼
    px(ctx, e1 - 3, ey + 5, 3, 2, P.cheek); px(ctx, e2 + 2, ey + 5, 3, 2, P.cheek);
    // 입
    if (kind === 'cat') {
      const mx = fx - 1;
      if (o.shout) { px(ctx, mx, ey + 5, 3, 3, P.out); px(ctx, mx + 1, ey + 7, 1, 1, '#ff6b81'); }
      else { px(ctx, mx - 1, ey + 5, 1, 1, P.out); px(ctx, mx, ey + 6, 1, 1, P.out); px(ctx, mx + 1, ey + 5, 1, 1, P.out); px(ctx, mx + 2, ey + 6, 1, 1, P.out); px(ctx, mx + 3, ey + 5, 1, 1, P.out); }
    } else {
      const bx = fx - 2;
      px(ctx, bx, ey + 4, 5, 1, P.beak); px(ctx, bx + 1, ey + 5, 3, 1, P.beak); px(ctx, bx + 2, ey + 6, 1, 1, P.beak);
      if (o.shout) px(ctx, bx + 1, ey + 5, 3, 1, '#c45a00');
    }
    // 앞팔
    if (o.armsFwd) arm(x + f * (rx + 5), cy + 2);
    else if (o.armUp) arm(x + f * 9, cy - ry - 3);
    else if (o.cheer) arm(x + f * 10, cy - ry - 2);
    else arm(x + f * (rx - 1), cy + 3 - (o.air ? 6 : 0));
  }

  function drawPlayer(ctx, p, frame) {
    const kind = p.side === 0 ? 'cat' : 'peng';
    const f = p.side === 0 ? 1 : -1;
    let sx = 1, sy = 1;
    const o = { walk: 0, air: false, armUp: false, armsFwd: false, blink: false, emo: p.emo, shout: false, flat: false, cheer: false, hurt: false };
    if (p.st === 2 || p.st === 3) {
      const df = p.dd;
      sx = 1.18; sy = 0.7; o.armsFwd = true; o.flat = true; o.hurt = p.st === 3;
      drawShadow(ctx, p.x, p.y, 16);
      drawCreature(ctx, kind, Math.round(p.x), Math.round(p.y), df, sx, sy, o);
      return;
    }
    if (p.land > 0) { sx = 1.12; sy = 0.86; }
    if (p.st === 1) { o.air = true; if (p.vy < -3) { sx = 0.92; sy = 1.08; } }
    if (p.sw > 0) { o.armUp = true; o.shout = true; }
    if (p.emo === 1) o.cheer = true;
    if (p.emo === 2) { sy = 0.9; sx = 1.05; }
    if (p.st === 0 && Math.abs(p.vx) > 0.1) o.walk = Math.floor(frame / 5) % 2;
    o.blink = (frame + p.side * 77) % 180 < 6;
    drawShadow(ctx, p.x, p.y, 13);
    drawCreature(ctx, kind, Math.round(p.x), Math.round(p.y), f, sx, sy, o);
  }

  function drawShadow(ctx, x, y, w) {
    const h = C.GROUND - y;
    const rw = Math.max(4, Math.round(w - h / 12));
    ctx.globalAlpha = Math.max(0.12, 0.35 - h / 600);
    oval(ctx, Math.round(x), C.GROUND + 1, rw, 2, '#7a5520');
    ctx.globalAlpha = 1;
  }

  function drawNet(ctx) {
    const x0 = C.NET_X - C.NET_HW;
    px(ctx, x0 - 1, C.NET_TOP - 1, C.NET_HW * 2 + 2, C.GROUND - C.NET_TOP + 2, '#3a3a4a');
    for (let y = C.NET_TOP; y < C.GROUND; y++) {
      px(ctx, x0, y, C.NET_HW * 2, 1, (Math.floor(y / 3) % 2) ? '#f2f2f2' : '#c9d0dc');
    }
    px(ctx, x0, C.NET_TOP, C.NET_HW * 2, 3, '#ff5a5a');
    ovalO(ctx, C.NET_X, C.NET_TOP - 2, 3, 2, '#ffd23f', '#3a3a4a');
    ctx.globalAlpha = 0.3; oval(ctx, C.NET_X, C.GROUND + 1, 7, 2, '#7a5520'); ctx.globalAlpha = 1;
  }

  function drawBall(ctx, b) {
    const R = C.BALL_R;
    for (let i = trail.length - 1; i >= 0; i--) {
      const t = trail[i];
      ctx.globalAlpha = (i + 1) / (trail.length + 2) * 0.5;
      oval(ctx, t.x, t.y, R - 2, R - 2, '#fff2a8');
    }
    ctx.globalAlpha = 1;
    drawShadow(ctx, b.x, Math.min(b.y + R, C.GROUND), 9);
    const fi = ((Math.floor(b.rot / (Math.PI * 2) * 24) % 24) + 24) % 24;
    if (b.y < -R) {
      // 화면 위 표시
      const x = Math.round(Math.max(6, Math.min(C.W - 6, b.x)));
      ctx.fillStyle = '#ff5a5a';
      for (let i = 0; i < 5; i++) ctx.fillRect(x - i, 2 + i, i * 2 + 1, 1);
      return;
    }
    ctx.drawImage(ballFrames[fi], Math.round(b.x) - R - 1, Math.round(b.y) - R - 1);
  }

  // ---------- 이펙트 ----------
  function fx(ev) {
    const R = Math.random;
    switch (ev.k) {
      case 'spike':
        shake = 6; flash = 2;
        for (let i = 0; i < 14; i++) {
          const a = i / 14 * Math.PI * 2;
          particles.push({ x: ev.x, y: ev.y, vx: Math.cos(a) * (2 + R() * 2), vy: Math.sin(a) * (2 + R() * 2), g: 0, life: 16, col: R() < 0.5 ? '#fff6a0' : '#ffffff', s: 2 });
        }
        particles.push({ star: true, x: ev.x, y: ev.y, life: 10 });
        break;
      case 'bump':
        for (let i = 0; i < 5; i++) particles.push({ x: ev.x, y: ev.y + 6, vx: (R() - 0.5) * 3, vy: -R() * 2, g: 0.1, life: 12, col: '#ffffff', s: 1 });
        break;
      case 'ground':
      case 'thud':
        if (ev.k === 'ground') shake = 4;
        for (let i = 0; i < (ev.k === 'ground' ? 16 : 5); i++) particles.push({ x: ev.x + (R() - 0.5) * 16, y: ev.y - 1, vx: (R() - 0.5) * 4, vy: -1 - R() * 3, g: 0.22, life: 22 + R() * 10, col: R() < 0.5 ? '#d9ad5f' : '#f5d895', s: 2 });
        break;
      case 'dive':
        for (let i = 0; i < 8; i++) particles.push({ x: ev.x, y: ev.y - 1, vx: (R() - 0.5) * 3, vy: -R() * 2.5, g: 0.2, life: 18, col: '#e9c47a', s: 2 });
        break;
      case 'point':
        banner = { text: 'POINT!', t: 70, side: ev.s };
        break;
      case 'net':
        for (let i = 0; i < 4; i++) particles.push({ x: ev.x, y: ev.y, vx: (R() - 0.5) * 2, vy: (R() - 0.5) * 2, g: 0, life: 10, col: '#ffffff', s: 1 });
        break;
    }
  }

  function update(g) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const q = particles[i];
      q.life--;
      if (!q.star) { q.x += q.vx; q.y += q.vy; q.vy += q.g; }
      if (q.life <= 0) particles.splice(i, 1);
    }
    if (g) {
      if (g.ball.pw > 0) { trail.push({ x: g.ball.x, y: g.ball.y }); if (trail.length > 6) trail.shift(); }
      else if (trail.length) trail.shift();
    }
    if (shake > 0) shake--;
    if (flash > 0) flash--;
    if (banner && --banner.t <= 0) banner = null;
  }

  function drawStar(ctx, x, y, life) {
    const s = 3 + (10 - life);
    ctx.fillStyle = '#fff36b';
    ctx.fillRect(x - s, y - 1, s * 2 + 1, 3);
    ctx.fillRect(x - 1, y - s, 3, s * 2 + 1);
    for (let i = -Math.floor(s * 0.6); i <= Math.floor(s * 0.6); i++) { ctx.fillRect(x + i, y + i, 1, 1); ctx.fillRect(x + i, y - i, 1, 1); }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 2, y - 2, 5, 5);
  }

  function draw(ctx, g, opts) {
    opts = opts || {};
    ctx.save();
    if (shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * shake), Math.round((Math.random() - 0.5) * shake));
    ctx.drawImage(bg, 0, 0);
    drawNet(ctx);
    for (const p of g.players) drawPlayer(ctx, p, g.frame);
    drawBall(ctx, g.ball);
    for (const q of particles) {
      if (q.star) drawStar(ctx, Math.round(q.x), Math.round(q.y), q.life);
      else { ctx.fillStyle = q.col; ctx.fillRect(Math.round(q.x), Math.round(q.y), q.s, q.s); }
    }
    ctx.restore();
    if (flash > 0) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(0, 0, C.W, C.H); }

    if (opts.hideHud) return;
    // 점수판
    PixelFont.draw(ctx, g.score[0], 16, 10, 6, '#ffffff', 'left', '#1d3b78');
    PixelFont.draw(ctx, g.score[1], C.W - 16, 10, 6, '#ffffff', 'right', '#1d3b78');
    PixelFont.draw(ctx, CHAR_NAMES[0], 17, 44, 1, '#7a3a10');
    PixelFont.draw(ctx, CHAR_NAMES[1], C.W - 17, 44, 1, '#141a3c', 'right');
    if (opts.labels) {
      PixelFont.draw(ctx, opts.labels[0], 17, 52, 1, '#ffffff', 'left', '#1d3b78');
      PixelFont.draw(ctx, opts.labels[1], C.W - 17, 52, 1, '#ffffff', 'right', '#1d3b78');
    }

    if (g.phase === 'ready' && g.t > 10 && Math.floor(g.t / 8) % 2 === 0) {
      PixelFont.draw(ctx, 'READY?', C.W / 2, 70, 4, '#ffe14d', 'center', '#7a3a10');
    }
    if (g.phase === 'ready' && (g.score[0] === g.win - 1 || g.score[1] === g.win - 1)) {
      PixelFont.draw(ctx, 'MATCH POINT', C.W / 2, 96, 2, '#ff5a5a', 'center', '#ffffff');
    }
    if (banner && g.phase !== 'over') {
      const bx = banner.side === 0 ? C.W / 4 : C.W * 3 / 4;
      const by = 76 - Math.min(10, (70 - banner.t));
      PixelFont.draw(ctx, banner.text, bx, by, 3, '#ffffff', 'center', '#d6336c');
    }
    if (g.phase === 'over') {
      PixelFont.draw(ctx, 'GAME SET!', C.W / 2, 62, 5, '#ffe14d', 'center', '#7a3a10');
      if (g.winner >= 0 && Math.floor(g.t / 20) % 2 === 0) {
        PixelFont.draw(ctx, CHAR_NAMES[g.winner] + ' WIN!', C.W / 2, 96, 3, '#ffffff', 'center', '#d6336c');
      }
    }
  }

  function clearFx() { particles.length = 0; trail.length = 0; banner = null; shake = 0; flash = 0; }

  return { init, draw, fx, update, clearFx, drawCreature };
})();
