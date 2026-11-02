'use strict';
// ===== 온라인 대전 : PeerJS(WebRTC P2P) =====
// 방장(host)이 게임을 시뮬레이션하고 상태를 보내며, 참가자(guest)는 입력만 보냅니다.
const Net = (() => {
  const PREFIX = 'mallang-vb-2026-';
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let peer = null, conn = null, role = null, code = null;
  let h = {};

  function randCode() { let s = ''; for (let i = 0; i < 4; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)]; return s; }
  function available() { return typeof window.Peer === 'function'; }

  function errText(e) {
    const t = e && e.type;
    if (t === 'peer-unavailable') return '방을 찾을 수 없어요. 코드를 확인해 주세요.';
    if (t === 'network' || t === 'server-error' || t === 'socket-error') return '서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.';
    if (t === 'browser-incompatible') return '이 브라우저는 온라인 대전을 지원하지 않아요.';
    return '연결 오류: ' + (t || (e && e.message) || '알 수 없음');
  }

  function bindConn(c) {
    conn = c;
    c.on('open', () => h.onOpen && h.onOpen());
    c.on('data', d => {
      if (d && d.t === 'full' && quickMode && nextSlot) { const n = nextSlot; nextSlot = null; n(); return; }
      h.onData && h.onData(d);
    });
    c.on('close', () => { if (conn === c) { conn = null; h.onClose && h.onClose(); } });
    c.on('error', e => h.onError && h.onError(errText(e)));
  }

  function host(handlers) {
    close(); h = handlers; role = 'host';
    if (!available()) { h.onError && h.onError('온라인 모듈을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'); return; }
    const tryOpen = (tries) => {
      code = randCode();
      peer = new Peer(PREFIX + code, { debug: 0 });
      peer.on('open', () => h.onCode && h.onCode(code));
      peer.on('connection', c => {
        if (conn && conn.open) { c.on('open', () => { c.send({ t: 'full' }); setTimeout(() => c.close(), 300); }); return; }
        bindConn(c);
      });
      peer.on('error', e => {
        if (e.type === 'unavailable-id' && tries < 5) { peer.destroy(); tryOpen(tries + 1); return; }
        h.onError && h.onError(errText(e));
      });
    };
    tryOpen(0);
  }

  function join(roomCode, handlers) {
    close(); h = handlers; role = 'guest';
    code = String(roomCode || '').trim().toUpperCase();
    if (!available()) { h.onError && h.onError('온라인 모듈을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'); return; }
    peer = new Peer({ debug: 0 });
    let opened = false;
    const timer = setTimeout(() => { if (!opened) h.onError && h.onError('연결 시간이 초과됐어요. 다시 시도해 주세요.'); }, 20000);
    peer.on('open', () => {
      const c = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      bindConn(c);
      c.on('open', () => { opened = true; clearTimeout(timer); });
    });
    peer.on('error', e => { clearTimeout(timer); h.onError && h.onError(errText(e)); });
  }

  // 빠른 대전 : 고정된 대기실 슬롯(Q0~Q11)을 차례로 확인.
  // 빈 슬롯이면 내가 방장으로 대기, 누가 대기 중이면 그 방에 참가, 꽉 찼으면 다음 슬롯.
  const QSLOTS = 12;
  function quick(handlers, k) {
    k = k || 0;
    close(); h = handlers; quickMode = true;
    if (!available()) { h.onError && h.onError('온라인 모듈을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'); return; }
    if (k >= QSLOTS) { quickMode = false; h.onError && h.onError('지금은 대기실이 꽉 찼어요. 잠시 후 다시 시도하거나 방 코드로 대전해 주세요.'); return; }
    const p = new Peer(PREFIX + 'Q' + k, { debug: 0 });
    peer = p; role = 'host'; code = 'Q' + k;
    p.on('open', () => h.onWaiting && h.onWaiting());
    p.on('connection', c => {
      if (conn && conn.open) { c.on('open', () => { c.send({ t: 'full' }); setTimeout(() => c.close(), 300); }); return; }
      bindConn(c);
    });
    p.on('error', e => {
      if (peer !== p) return;
      if (e.type === 'unavailable-id') { p.destroy(); peer = null; quickJoin(k); return; }
      h.onError && h.onError(errText(e));
    });
  }
  function quickJoin(k) {
    role = 'guest';
    const p = new Peer({ debug: 0 });
    peer = p;
    p.on('open', () => {
      const c = p.connect(PREFIX + 'Q' + k, { reliable: true, serialization: 'json' });
      bindConn(c);
    });
    p.on('error', e => {
      if (peer !== p) return;
      if (e.type === 'peer-unavailable') { quick(h, k); return; } // 방장이 사라졌으면 그 슬롯에서 다시
      h.onError && h.onError(errText(e));
    });
    nextSlot = () => quick(h, k + 1);
  }
  let quickMode = false, nextSlot = null;

  function send(o) { if (conn && conn.open) { try { conn.send(o); } catch (_) {} } }

  function close() {
    const c = conn, p = peer;
    conn = null; peer = null; role = null; quickMode = false; nextSlot = null;
    try { c && c.close(); } catch (_) {}
    try { p && p.destroy(); } catch (_) {}
  }

  return {
    host, join, quick, send, close,
    get isQuick() { return quickMode; },
    get role() { return role; }, get code() { return code; },
    get connected() { return !!(conn && conn.open); },
  };
})();
