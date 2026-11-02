'use strict';
// ===== 온라인 대전 : 게임 서버(웹소켓) 연결 =====
// 게임 서버 주소. 비워두면 이 페이지를 띄운 서버의 /ws 로 접속합니다.
// 게임 페이지를 다른 곳(예: GitHub Pages)에 올렸다면 여기에 서버 주소를 넣으세요.
// 예: 'wss://game.example.com/ws'
const GAME_SERVER = '';

const Net = (() => {
  let ws = null, h = {}, code = null, inGame = false, side = -1;

  function serverUrl() {
    if (GAME_SERVER) return GAME_SERVER;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return '';
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  }

  function open(first, handlers) {
    close();
    h = handlers || {};
    const url = serverUrl();
    if (!url) { h.onError && h.onError('게임 서버 주소가 설정되지 않았어요.'); return; }
    let sock;
    try { sock = new WebSocket(url); } catch (_) { h.onError && h.onError('게임 서버에 연결할 수 없어요.'); return; }
    ws = sock;
    let opened = false;
    const timer = setTimeout(() => {
      if (!opened && ws === sock) { close(); h.onError && h.onError('게임 서버 응답이 없어요. 잠시 후 다시 시도해 주세요.'); }
    }, 8000);
    sock.onopen = () => { opened = true; clearTimeout(timer); sock.send(JSON.stringify(first)); };
    sock.onmessage = e => {
      if (ws !== sock) return;
      let m;
      try { m = JSON.parse(e.data); } catch (_) { return; }
      switch (m.t) {
        case 'waiting': h.onWaiting && h.onWaiting(); break;
        case 'code': code = m.code; h.onCode && h.onCode(code); break;
        case 'start': inGame = true; side = m.side; h.onStart && h.onStart(m); break;
        case 'error': h.onError && h.onError(m.msg || '오류가 발생했어요.'); break;
        default: h.onData && h.onData(m);
      }
    };
    sock.onclose = () => {
      if (ws !== sock) return;
      clearTimeout(timer);
      ws = null; const was = inGame; inGame = false;
      if (!opened) h.onError && h.onError('게임 서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.');
      else h.onClose && h.onClose(was);
    };
    sock.onerror = () => {};
  }

  function send(o) { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(o)); } catch (_) {} } }

  function close() {
    const s = ws;
    ws = null; code = null; inGame = false; side = -1;
    if (s) { try { s.send(JSON.stringify({ t: 'leave' })); } catch (_) {} try { s.close(); } catch (_) {} }
  }

  return {
    quick(name, handlers) { open({ t: 'quick', name }, handlers); },
    host(name, handlers) { open({ t: 'create', name }, handlers); },
    join(roomCode, name, handlers) { open({ t: 'join', code: String(roomCode || '').trim().toUpperCase(), name }, handlers); },
    send, close,
    get code() { return code; },
    get connected() { return !!(ws && ws.readyState === 1 && inGame); },
    get side() { return side; },
  };
})();
