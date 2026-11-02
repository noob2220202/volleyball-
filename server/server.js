'use strict';
// ===== 말랑배구 게임 서버 =====
// - 게임 파일(index.html, js, css) 서비스
// - /ws 웹소켓: 빠른 대전 매칭, 방 코드 대전, 게임 진행(서버가 직접 계산)
// 실행: node server/server.js   (포트: 환경변수 PORT, 기본 8080)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const G = require('../js/game.js');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = path.resolve(__dirname, '..');
const DT = 1000 / 60;
const WIN = Number(process.env.WIN_SCORE) || G.WIN_SCORE; // 테스트용으로만 바꿈
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// ---------- 정적 파일 ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
const PUBLIC = /^\/(index\.html|style\.css|js\/[\w.-]+\.js|assets\/[\w./-]+)$/;

const server = http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (_) { res.writeHead(400); return res.end(); }
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: wss.clients.size, waiting: quickWaiting ? 1 : 0 }));
  }
  if (url === '/') url = '/index.html';
  if (!PUBLIC.test(url) || url.includes('..')) { res.writeHead(404); return res.end('Not found'); }
  const file = path.join(ROOT, url);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------- 매칭 / 방 ----------
let quickWaiting = null;            // 빠른 대전 대기 중인 1명
const pendingRooms = new Map();     // 방 코드 -> 방장 소켓
const rooms = new Set();            // 진행 중인 게임

const send = (ws, o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
const isOpen = ws => ws && ws.readyState === 1;

function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!pendingRooms.has(c)) return c;
  }
}

function detach(ws) {
  if (quickWaiting === ws) quickWaiting = null;
  if (ws.code && pendingRooms.get(ws.code) === ws) pendingRooms.delete(ws.code);
  ws.code = null;
  const room = ws.room;
  if (room) {
    rooms.delete(room);
    for (const p of room.players) {
      if (p !== ws) { p.room = null; send(p, { t: 'left' }); }
    }
    ws.room = null;
  }
}

function startRoom(a, b) {
  detach(a); detach(b);
  const room = {
    players: [a, b],
    game: G.newGame(WIN),
    inp: [0, 1].map(() => ({ raw: G.bitsToInput(0), counts: { u: 0, a: 0 }, seq: 0, got: false })),
    edges: [G.makeEdge(), G.makeEdge()],
    ready: [false, false],
    last: Date.now(), acc: 0,
  };
  a.room = room; a.side = 0;
  b.room = room; b.side = 1;
  rooms.add(room);
  room.players.forEach((p, i) => send(p, { t: 'start', side: i, rname: room.players[1 - i].name }));
}

function onMessage(ws, m) {
  switch (m.t) {
    case 'quick': {
      detach(ws);
      ws.name = cleanName(m.name);
      if (quickWaiting && quickWaiting !== ws && isOpen(quickWaiting)) startRoom(quickWaiting, ws);
      else { quickWaiting = ws; send(ws, { t: 'waiting' }); }
      break;
    }
    case 'create': {
      detach(ws);
      ws.name = cleanName(m.name);
      const code = newCode();
      ws.code = code; pendingRooms.set(code, ws);
      send(ws, { t: 'code', code });
      break;
    }
    case 'join': {
      const code = String(m.code || '').toUpperCase().slice(0, 4);
      const host = pendingRooms.get(code);
      ws.name = cleanName(m.name);
      if (!host || !isOpen(host)) { send(ws, { t: 'error', msg: '방을 찾을 수 없어요. 코드를 확인해 주세요.' }); break; }
      if (host === ws) { send(ws, { t: 'error', msg: '내가 만든 방이에요.' }); break; }
      startRoom(host, ws);
      break;
    }
    case 'i': {
      const room = ws.room; if (!room) break;
      const s = room.inp[ws.side];
      s.raw = G.bitsToInput(m.b | 0);
      s.counts = { u: m.u | 0, a: m.a | 0 };
      s.seq = m.s | 0; s.got = true;
      break;
    }
    case 'rematch': {
      const room = ws.room; if (!room || room.game.phase !== 'over') break;
      room.ready[ws.side] = true;
      send(room.players[1 - ws.side], { t: 'rematch' });
      if (room.ready[0] && room.ready[1]) {
        room.game = G.newGame(WIN);
        room.ready = [false, false];
        room.players.forEach((p, i) => send(p, { t: 'start', side: i, rname: room.players[1 - i].name }));
      }
      break;
    }
    case 'leave': detach(ws); break;
    case 'ping': send(ws, { t: 'pong', ts: m.ts }); break;
  }
}

function cleanName(n) { return String(n || '').replace(/[\u0000-\u001f<>]/g, '').slice(0, 20); }

// ---------- 게임 루프 (서버가 60fps로 직접 계산) ----------
setInterval(() => {
  const now = Date.now();
  for (const room of rooms) {
    room.acc += Math.min(250, now - room.last); room.last = now;
    let n = 0; const ev = [];
    while (room.acc >= DT && n < 6) {
      const inputs = [0, 1].map(i => room.edges[i](room.inp[i].raw, room.inp[i].counts));
      G.stepGame(room.game, inputs);
      ev.push(...room.game.ev);
      room.acc -= DT; n++;
    }
    if (n === 0) continue;
    const snap = G.packGame(room.game);
    snap.e = ev;
    room.players.forEach((p, i) => { snap.q = room.inp[i].seq; send(p, { t: 's', g: snap }); });
  }
}, 4);

// ---------- 웹소켓 ----------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 });
wss.on('connection', ws => {
  ws.alive = true; ws.name = ''; ws.room = null; ws.code = null; ws.side = -1;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', data => {
    let m;
    try { m = JSON.parse(data); } catch (_) { return; }
    if (m && typeof m.t === 'string') onMessage(ws, m);
  });
  ws.on('close', () => detach(ws));
  ws.on('error', () => {});
});

// 응답 없는 연결 정리
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    try { ws.ping(); } catch (_) {}
  }
}, 10000);

server.listen(PORT, () => console.log(`말랑배구 서버 실행 중: http://localhost:${PORT}`));
