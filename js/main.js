'use strict';
// ===== 메인 : 화면 전환, 게임 루프, 온라인 연동 =====
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const cvs = $('#screen'), ctx = cvs.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  Render.init();

  // ---------- 설정 ----------
  const DEF = { win: 15, level: 1, char: 0, sfx: 1, bgm: 1, touch: 2 };
  let S = Object.assign({}, DEF);
  try { Object.assign(S, JSON.parse(localStorage.getItem('mallang-settings') || '{}')); } catch (_) {}
  const save = () => { try { localStorage.setItem('mallang-settings', JSON.stringify(S)); } catch (_) {} };
  Sound.setSfx(!!S.sfx); Sound.setBgm(!!S.bgm);

  // ---------- 상태 ----------
  let mode = 'demo';
  let game = newGame(99);
  let brains = [new CpuBrain(0, 1), new CpuBrain(1, 1)];
  let paused = false, overShown = false;
  let humanSide = 0;
  const online = { meReady: false, themReady: false, rin: { l: 0, r: 0, u: 0, d: 0, a: 0 }, rac: 0, ruc: 0, cac: 0, cuc: 0, ac: 0, uc: 0, prev: { a: 0, u: 0 }, ping: 0, lastSeen: 0, seq: 0, rseq: 0, ack: 0, hist: [] };

  // ---------- 화면 ----------
  let curPanel = null;
  function show(id) {
    curPanel = id;
    TG.backButton(!(id === 'p-menu'));
    $$('.panel').forEach(p => p.classList.toggle('on', p.id === id));
    $('#overlay').classList.toggle('on', !!id);
    $('#overlay').classList.toggle('dim', !!id && mode !== 'demo');
  }
  function notice(title, text) { $('#noticeTitle').textContent = title; $('#noticeText').textContent = text; show('p-notice'); }

  const isTouch = () => S.touch === 1 || (S.touch === 2 && (matchMedia('(any-pointer: coarse)').matches || 'ontouchstart' in window));

  function layoutTouch() {
    const ingame = mode !== 'demo' && !paused && !$('#overlay').classList.contains('on');
    document.body.classList.toggle('touchui', isTouch());
    if (!isTouch() || mode === 'demo') Input.setLayout(null);
    else Input.setLayout('solo');
    document.body.classList.toggle('ingame', mode !== 'demo');
    $('#btnPause').style.display = mode === 'cpu' ? '' : 'none';
    resize();
    return ingame;
  }

  function resize() {
    const ins = TG.insets();
    document.body.style.padding = `${ins.top}px ${ins.right}px ${ins.bottom}px ${ins.left}px`;
    document.documentElement.style.setProperty('--sb', ins.bottom + 'px');
    const vw = window.innerWidth - ins.left - ins.right, vh = window.innerHeight - ins.top - ins.bottom;
    const portrait = vh > vw;
    const touch = isTouch() && mode !== 'demo';
    let s = Math.min(vw / C.W, vh / C.H);
    if (touch && portrait) s = vw / C.W;
    const st = $('#stage');
    st.style.width = Math.floor(C.W * s) + 'px';
    st.style.height = Math.floor(C.H * s) + 'px';
    document.body.classList.toggle('portrait', portrait);
    document.documentElement.style.setProperty('--u', (s * C.W / 480).toFixed(3));
    const ps = Math.max(0.62, Math.min(1.8, vw / 380, (vh - 16) / 390));
    document.documentElement.style.setProperty('--ps', ps.toFixed(3));
  }
  window.addEventListener('resize', resize);
  TG.onViewport(resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));

  // ---------- 게임 시작/종료 ----------
  function startGame(m) {
    Sound.init();
    mode = m; paused = false; overShown = false;
    Render.clearFx();
    if (m === 'cpu') {
      humanSide = S.char === 1 ? 1 : 0;
      brains = [null, null];
      brains[1 - humanSide] = new CpuBrain(1 - humanSide, S.level);
    }
    if (m !== 'guest') game = newGame(S.win);
    online.seq = online.ack = online.rseq = 0; online.hist = [];
    TG.confirmClose(m === 'host' || m === 'guest');
    online.meReady = online.themReady = false;
    show(null);
    TG.backButton(true);
    layoutTouch();
    Sound.startBgm();
  }

  function toMenu() {
    if (mode === 'host' || mode === 'guest') Net.close();
    mode = 'demo'; paused = false;
    game = newGame(99); brains = [new CpuBrain(0, 1), new CpuBrain(1, 1)];
    Render.clearFx();
    Sound.stopBgm();
    TG.confirmClose(false);
    online.rname = '';
    $('#ping').textContent = '';
    show('p-menu');
    layoutTouch();
    if (location.search) history.replaceState(null, '', location.pathname);
  }

  function setPause(v) {
    if (mode !== 'cpu') return;
    if (game.phase === 'over') return;
    paused = v;
    if (v) { show('p-pause'); Sound.stopBgm(); } else { show(null); Sound.startBgm(); }
    layoutTouch();
  }

  function labels() {
    switch (mode) {
      case 'cpu': return humanSide === 0 ? ['YOU', 'CPU'] : ['CPU', 'YOU'];
      case 'host': return ['YOU', 'RIVAL'];
      case 'guest': return ['RIVAL', 'YOU'];
    }
    return null;
  }

  function mySide() { return mode === 'cpu' ? humanSide : mode === 'guest' ? 1 : 0; }
  function handleEvents(evs, sound) {
    for (const e of evs) {
      Render.fx(e);
      if (!sound) continue;
      Sound.play(e.k);
      if (e.k === 'spike' && e.s === mySide()) TG.haptic('heavy');
      else if (e.k === 'bump' && e.s === mySide()) TG.haptic('light');
      else if (e.k === 'point') TG.haptic(e.s === mySide() ? 'success' : 'error');
    }
  }

  function checkOver() {
    if (mode === 'demo' || overShown) return;
    if (game.phase === 'over' && game.t >= 100) {
      overShown = true;
      const w = game.winner;
      let title = `${CHAR_NAMES_KO[w]} 승리!`;
      if (mode === 'cpu') title = w === humanSide ? '승리! 🎉' : '아쉬워요... 패배';
      if (mode === 'host' || mode === 'guest') {
        title = w === mySide() ? '승리! 🎉' : '패배...';
        if (online.rname) title += ` (vs ${online.rname})`;
      }
      $('#overTitle').textContent = title;
      $('#overScore').textContent = `모찌 ${game.score[0]} : ${game.score[1]} 펭구`;
      $('#overStatus').textContent = '';
      $('#btnAgain').disabled = false;
      show('p-over');
      layoutTouch();
    }
  }

  // ---------- 온라인 ----------
  function netHandlers() {
    const host = () => Net.role === 'host';
    return {
      onWaiting() {
        $('#quickStatus').textContent = '상대를 찾는 중... 다른 사람이 들어오면 바로 시작해요';
      },
      onCode(code) {
        $('#hostCode').textContent = code;
        $('#hostStatus').textContent = '상대를 기다리는 중...';
      },
      onOpen() {
        online.lastSeen = performance.now();
        Net.send({ t: 'hello', name: (TG.name() || '').slice(0, 20) });
        if (host()) {
          startGame('host');
          Net.send({ t: 'start' });
        } else {
          $('#joinStatus').textContent = '연결됨! 곧 시작해요';
          $('#quickStatus').textContent = '상대를 찾았어요! 곧 시작해요';
        }
      },
      onData(m) {
        online.lastSeen = performance.now();
        if (!m || typeof m !== 'object') return;
        switch (m.t) {
          case 'i': // 참가자 입력
            if (mode !== 'host') return;
            online.rin = { l: m.b & 1, r: (m.b >> 1) & 1, u: (m.b >> 2) & 1, d: (m.b >> 3) & 1, a: (m.b >> 4) & 1 };
            online.rac = m.a; online.ruc = m.u; online.rseq = m.s || 0;
            break;
          case 's': // 게임 상태
            if (mode !== 'guest') return;
            game = unpackGame(m.g, game);
            online.ack = m.g.q || 0;
            handleEvents(game.ev, true);
            checkOver();
            break;
          case 'start':
            if (host()) return;
            if (mode !== 'guest') startGame('guest');
            else { overShown = false; online.meReady = online.themReady = false; Render.clearFx(); show(null); layoutTouch(); }
            break;
          case 'rematch':
            online.themReady = true;
            $('#overStatus').textContent = online.meReady ? '' : '상대가 한 판 더 원해요!';
            if (host() && online.meReady) restartOnline();
            break;
          case 'hello': online.rname = String(m.name || '').slice(0, 20); break;
          case 'ping': Net.send({ t: 'pong', ts: m.ts }); break;
          case 'pong': online.ping = Math.round(performance.now() - m.ts); break;
          case 'full':
            Net.close(); notice('입장 불가', '이미 대전 중인 방이에요.'); break;
        }
      },
      onClose() {
        if (mode === 'host' || mode === 'guest') { mode = 'demo'; notice('연결 끊김', '상대와의 연결이 끊어졌어요.'); Sound.stopBgm(); layoutTouch(); }
      },
      onError(msg) {
        if (mode === 'host' || mode === 'guest') { Net.close(); mode = 'demo'; notice('연결 오류', msg); layoutTouch(); return; }
        $('#hostStatus').textContent = msg;
        $('#joinStatus').textContent = msg;
        $('#quickStatus').textContent = msg;
        $('#btnJoin').disabled = false;
      },
    };
  }

  function restartOnline() {
    game = newGame(S.win);
    overShown = false; online.meReady = online.themReady = false;
    Render.clearFx(); show(null); layoutTouch();
    Net.send({ t: 'start' });
  }

  function hostRemoteInput() {
    const i = Object.assign({}, online.rin);
    if (online.rac !== online.cac) { i.a = 1; online.cac = online.rac; }
    if (online.ruc !== online.cuc) { i.u = 1; online.cuc = online.ruc; }
    return i;
  }

  function guestSendInput() {
    const i = Input.solo();
    if (i.a && !online.prev.a) online.ac++;
    if (i.u && !online.prev.u) online.uc++;
    online.prev = { a: i.a, u: i.u };
    const b = i.l | (i.r << 1) | (i.u << 2) | (i.d << 3) | (i.a << 4);
    online.seq++;
    online.hist.push({ s: online.seq, i });
    if (online.hist.length > 120) online.hist.shift();
    Net.send({ t: 'i', b, a: online.ac, u: online.uc, s: online.seq });
  }

  // 참가자 화면: 내 캐릭터는 아직 방장이 처리하지 않은 입력을 미리 적용해서 바로 반응하게(클라이언트 예측)
  function guestView() {
    if (game.phase === 'over') return game;
    const p = Object.assign({}, game.players[1]);
    const stub = { phase: game.phase, ev: [], frame: game.frame, t: game.t };
    const h = online.hist;
    let start = h.findIndex(e => e.s > online.ack);
    if (start < 0) return game;
    if (h.length - start > 40) start = h.length - 40;
    if (start > 0) { p.pu = h[start - 1].i.u; p.pa = h[start - 1].i.a; }
    for (let k = start; k < h.length; k++) updatePlayer(stub, p, h[k].i);
    return Object.assign({}, game, { players: [game.players[0], p] });
  }

  function roomLink(code) { return TG.inviteLink(code); }

  // ---------- 루프 ----------
  let pingTimer = 0;
  function tick() {
    if (mode === 'guest') {
      guestSendInput();
    } else if (!paused) {
      let inputs;
      if (mode === 'demo') inputs = [brains[0].input(game), brains[1].input(game)];
      else if (mode === 'cpu') {
        inputs = [];
        inputs[humanSide] = Input.solo();
        inputs[1 - humanSide] = brains[1 - humanSide].input(game);
      }
      else if (mode === 'host') inputs = [Input.solo(), hostRemoteInput()];
      stepGame(game, inputs);
      handleEvents(game.ev, mode !== 'demo');
      if (mode === 'host') { const g = packGame(game); g.q = online.rseq; Net.send({ t: 's', g }); }
      if (mode === 'demo' && game.phase === 'over' && game.t > 180) game = newGame(99);
      if (mode === 'demo' && (game.score[0] > 8 || game.score[1] > 8)) game.score = [0, 0];
      checkOver();
    }
    if (mode === 'host' || mode === 'guest') {
      if (performance.now() - online.lastSeen > 7000) {
        Net.close(); mode = 'demo'; Sound.stopBgm(); layoutTouch();
        notice('연결 끊김', '상대의 응답이 없어요. 연결이 끊어졌어요.');
        return;
      }
      if (++pingTimer % 120 === 0) {
        Net.send({ t: 'ping', ts: performance.now() });
        $('#ping').textContent = (online.rname ? `vs ${online.rname} · ` : '') + (online.ping ? `PING ${online.ping}ms` : '');
      }
    }
    Render.update(game);
  }

  const DT = 1000 / 60;
  let last = performance.now(), acc = 0;
  function frame(now) {
    acc += Math.min(200, now - last); last = now;
    let n = 0;
    while (acc >= DT && n < 5) { tick(); acc -= DT; n++; }
    if (n >= 5) acc = 0;
    Render.draw(ctx, mode === 'guest' && Net.connected ? guestView() : game, { hideHud: mode === 'demo', labels: labels() });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- 메뉴 이벤트 ----------
  document.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    Sound.init();
    if (b.dataset.go) { Sound.play('select'); show(b.dataset.go); syncSettings(); return; }
    const act = b.dataset.act;
    if (!act) return;
    Sound.play('ok');
    switch (act) {
      case 'cpu': startGame('cpu'); break;
      case 'host':
        $('#hostCode').textContent = '····';
        $('#hostStatus').textContent = '서버에 연결 중...';
        show('p-host');
        Net.host(netHandlers());
        break;
      case 'quick':
        $('#quickStatus').textContent = '대기실 확인 중...';
        show('p-quick');
        online.ac = online.uc = 0;
        Net.quick(netHandlers());
        break;
      case 'join':
        $('#joinStatus').textContent = '';
        $('#btnJoin').disabled = false;
        show('p-join');
        setTimeout(() => $('#joinCode').focus(), 50);
        break;
      case 'cancelNet': Net.close(); show('p-menu'); break;
      case 'resume': setPause(false); break;
      case 'restart': startGame(mode); break;
      case 'toMenu': toMenu(); break;
      case 'again':
        if (mode === 'host' || mode === 'guest') {
          online.meReady = true; b.disabled = true;
          Net.send({ t: 'rematch' });
          if (mode === 'host' && online.themReady) restartOnline();
          else $('#overStatus').textContent = '상대를 기다리는 중...';
        } else startGame(mode);
        break;
    }
  });

  function doJoin() {
    const code = $('#joinCode').value.trim().toUpperCase();
    if (code.length !== 4) { $('#joinStatus').textContent = '코드 4자리를 입력해 주세요.'; return; }
    $('#joinStatus').textContent = '접속 중...';
    $('#btnJoin').disabled = true;
    online.ac = online.uc = 0;
    Net.join(code, netHandlers());
  }
  $('#btnJoin').addEventListener('click', doJoin);
  $('#joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });
  $('#joinCode').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });

  $('#btnCopy').addEventListener('click', async () => {
    if (!Net.code) return;
    const link = roomLink(Net.code);
    try { await navigator.clipboard.writeText(link); $('#hostStatus').textContent = '링크를 복사했어요! 상대를 기다리는 중...'; }
    catch (_) { prompt('이 링크를 친구에게 보내주세요', link); }
  });
  $('#btnShare').addEventListener('click', async () => {
    if (!Net.code) return;
    const link = roomLink(Net.code);
    if (TG.share(link, `말랑배구 한 판 하자! 방 코드: ${Net.code}`)) return;
    if (navigator.share) { try { await navigator.share({ title: '말랑배구 한 판!', text: `방 코드: ${Net.code}`, url: link }); } catch (_) {} }
    else { try { await navigator.clipboard.writeText(link); $('#hostStatus').textContent = '링크를 복사했어요!'; } catch (_) { prompt('링크', link); } }
  });

  // 설정
  function syncSettings() {
    $$('.seg').forEach(seg => {
      const k = seg.dataset.set;
      seg.querySelectorAll('button').forEach(b => b.classList.toggle('sel', String(S[k]) === b.dataset.v));
    });
  }
  $$('.seg').forEach(seg => seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    S[seg.dataset.set] = +b.dataset.v; save(); syncSettings();
    Sound.setSfx(!!S.sfx); Sound.setBgm(!!S.bgm);
    layoutTouch();
  }));

  // HUD
  $('#btnPause').addEventListener('click', e => { e.stopPropagation(); setPause(!paused); });
  $('#btnSound').addEventListener('click', e => {
    e.stopPropagation();
    const on = !(S.sfx || S.bgm);
    S.sfx = S.bgm = on ? 1 : 0; save(); syncSettings();
    Sound.setSfx(on); Sound.setBgm(on);
    if (on && mode !== 'demo' && !paused) Sound.startBgm();
    $('#btnSound').classList.toggle('off', !on);
  });
  $('#btnSound').classList.toggle('off', !(S.sfx || S.bgm));
  $('#btnFull').addEventListener('click', e => {
    e.stopPropagation();
    if (TG.toggleFullscreen()) return;
    const d = document, el = d.documentElement;
    if (!d.fullscreenElement && !d.webkitFullscreenElement) {
      const r = el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen && el.webkitRequestFullscreen();
      Promise.resolve(r).then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
    } else {
      (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    }
  });

  window.addEventListener('keydown', e => {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (mode === 'cpu') setPause(!paused);
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && mode === 'cpu' && !paused) setPause(true);
  });

  // 터치 & 기타
  Input.setupTouch($('#touch'));
  document.addEventListener('touchmove', e => { if (document.body.classList.contains('ingame') && !e.target.closest('.panel')) e.preventDefault(); }, { passive: false });
  document.addEventListener('dblclick', e => e.preventDefault());
  document.addEventListener('gesturestart', e => e.preventDefault());

  // 로고 캐릭터
  (() => {
    const lc = $('#logoChars').getContext('2d');
    const o = { walk: 0, air: false, armUp: false, armsFwd: false, blink: false, emo: 1, shout: false, flat: false, cheer: true, hurt: false };
    Render.drawCreature(lc, 'cat', 26, 38, 1, 1, 1, o);
    Render.drawCreature(lc, 'peng', 70, 38, -1, 1, 1, o);
  })();

  TG.init();
  TG.onBack(() => {
    if (mode === 'cpu') { if (!paused && game.phase !== 'over') setPause(true); else toMenu(); return; }
    if (mode === 'host' || mode === 'guest') { if (confirm('대전을 그만두고 나갈까요?')) toMenu(); return; }
    if (curPanel === 'p-host' || curPanel === 'p-join' || curPanel === 'p-quick') Net.close();
    show('p-menu');
  });

  syncSettings();
  show('p-menu');
  layoutTouch();

  // ?room=CODE 로 들어오면 바로 참가
  const sp = TG.startParam();
  const room = /^[A-Za-z0-9]{4}$/.test(sp) ? sp : new URLSearchParams(location.search).get('room');
  if (room) {
    show('p-join');
    $('#joinCode').value = room.toUpperCase().slice(0, 4);
    setTimeout(doJoin, 300);
  }
})();
