'use strict';
// ===== 메인 : 화면 전환, 게임 루프, 온라인 연동 =====
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const cvs = $('#screen'), ctx = cvs.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  Render.init();

  // ---------- 설정 ----------
  const DEF = { level: 1, char: 0, sfx: 1, bgm: 1, touch: 2 };
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
  const online = { side: 0, rname: '', ping: 0, lastSeen: 0, seq: 0, ack: 0, hist: [] };

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

  // 화면 버튼은 휴대폰·태블릿에서만. PC(텔레그램 데스크톱 포함)는 키보드로만 조작
  const isMobileDevice = () => {
    const tp = TG.platform();
    if (tp) return tp === 'android' || tp === 'android_x' || tp === 'ios';
    return matchMedia('(hover: none) and (pointer: coarse)').matches;
  };
  const isTouch = () => S.touch === 1 || (S.touch === 2 && isMobileDevice());

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

  // 화면 꽉 채우기: 남는 공간은 해변·하늘을 더 그려서 채움 (늘이지 않음)
  // 세로로 들고 게임을 하면 화면 전체를 가로로 돌려서 표시
  function resize() {
    const ins = TG.insets();
    let w = window.innerWidth - ins.left - ins.right, h = window.innerHeight - ins.top - ins.bottom;
    const rot = isTouch() && mode !== 'demo' && h > w;
    const app = $('#app');
    if (rot) {
      Object.assign(app.style, { left: (ins.left + w) + 'px', top: ins.top + 'px', width: h + 'px', height: w + 'px', transform: 'rotate(90deg)' });
      [w, h] = [h, w];
    } else {
      Object.assign(app.style, { left: ins.left + 'px', top: ins.top + 'px', width: w + 'px', height: h + 'px', transform: '' });
    }
    document.body.classList.toggle('rot', rot);
    const s = Math.min(w / C.W, h / C.H);
    const VW = Math.max(C.W, Math.round(w / s)), VH = Math.max(C.H, Math.round(h / s));
    if (cvs.width !== VW || cvs.height !== VH) {
      cvs.width = VW; cvs.height = VH;
      ctx.imageSmoothingEnabled = false;
      Render.setView(VW, VH);
    }
    document.documentElement.style.setProperty('--btn', Math.round(Math.max(50, Math.min(92, h * 0.19, w * 0.11))) + 'px');
    const ps = Math.max(0.62, Math.min(1.8, w / 380, (h - 16) / 390));
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
    game = newGame(WIN_SCORE);
    online.seq = online.ack = 0; online.hist = [];
    online.lastSeen = performance.now();
    localEdge = makeEdge();
    TG.confirmClose(m === 'online');
    show(null);
    TG.backButton(true);
    layoutTouch();
    Sound.startBgm();
  }

  function toMenu() {
    if (mode === 'online') Net.close();
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
      case 'online': return online.side === 0 ? ['YOU', 'RIVAL'] : ['RIVAL', 'YOU'];
    }
    return null;
  }

  function mySide() { return mode === 'cpu' ? humanSide : mode === 'online' ? online.side : 0; }
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
      if (mode === 'online') {
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

  // ---------- 온라인 (게임 서버가 계산, 나는 입력만 보내고 화면을 그림) ----------
  function netHandlers() {
    return {
      onWaiting() { $('#quickStatus').textContent = '상대를 찾는 중... 다른 사람이 들어오면 바로 시작해요'; },
      onCode(code) {
        $('#hostCode').textContent = code;
        $('#hostStatus').textContent = '상대를 기다리는 중...';
      },
      onStart(m) {
        online.side = m.side;
        online.rname = String(m.rname || '').slice(0, 20);
        $('#quickStatus').textContent = $('#joinStatus').textContent = '상대를 찾았어요!';
        startGame('online');
      },
      onData(m) {
        online.lastSeen = performance.now();
        switch (m.t) {
          case 's':
            if (mode !== 'online') return;
            game = unpackGame(m.g, game);
            online.ack = m.g.q || 0;
            handleEvents(game.ev, true);
            checkOver();
            break;
          case 'rematch':
            $('#overStatus').textContent = $('#btnAgain').disabled ? '' : '상대가 한 판 더 원해요!';
            break;
          case 'left':
            if (mode === 'online') { mode = 'demo'; Net.close(); Sound.stopBgm(); TG.confirmClose(false); layoutTouch(); notice('상대가 나갔어요', '상대가 대전을 떠났어요.'); }
            break;
          case 'pong': online.ping = Math.round(performance.now() - m.ts); break;
        }
      },
      onClose(wasInGame) {
        if (mode === 'online') { mode = 'demo'; Sound.stopBgm(); TG.confirmClose(false); layoutTouch(); notice('연결 끊김', '게임 서버와 연결이 끊어졌어요.'); }
        else if (!wasInGame) { $('#hostStatus').textContent = $('#joinStatus').textContent = $('#quickStatus').textContent = '서버와 연결이 끊어졌어요.'; $('#btnJoin').disabled = false; }
      },
      onError(msg) {
        if (mode === 'online') { Net.close(); mode = 'demo'; notice('연결 오류', msg); layoutTouch(); return; }
        $('#hostStatus').textContent = msg;
        $('#joinStatus').textContent = msg;
        $('#quickStatus').textContent = msg;
        $('#btnJoin').disabled = false;
      },
    };
  }
  const myName = () => (TG.name() || '').slice(0, 20);

  let localEdge = makeEdge();
  function localInput() { return localEdge(Input.solo(), Input.counts()); }

  function sendInput() {
    const raw = Input.solo(), c = Input.counts();
    const i = localInput();
    online.seq++;
    online.hist.push({ s: online.seq, i });
    if (online.hist.length > 120) online.hist.shift();
    Net.send({ t: 'i', b: inputToBits(raw), a: c.a, u: c.u, s: online.seq });
  }

  // 내 캐릭터는 서버가 아직 처리하지 않은 입력을 미리 적용해서 바로 반응하게 (클라이언트 예측)
  function onlineView() {
    if (game.phase === 'over') return game;
    const me = online.side;
    const p = Object.assign({}, game.players[me]);
    const stub = { phase: game.phase, ev: [], frame: game.frame, t: game.t, ball: game.ball };
    const h = online.hist;
    let start = h.findIndex(e => e.s > online.ack);
    if (start < 0) return game;
    if (h.length - start > 40) start = h.length - 40;
    if (start > 0) { p.pu = h[start - 1].i.u; p.pa = h[start - 1].i.a; }
    for (let k = start; k < h.length; k++) updatePlayer(stub, p, h[k].i);
    const players = game.players.slice(); players[me] = p;
    return Object.assign({}, game, { players });
  }

  function roomLink(code) { return TG.inviteLink(code); }

  // ---------- 루프 ----------
  let pingTimer = 0;
  function tick() {
    if (mode === 'online') {
      sendInput();
    } else if (!paused) {
      let inputs;
      if (mode === 'demo') inputs = [brains[0].input(game), brains[1].input(game)];
      else if (mode === 'cpu') {
        inputs = [];
        inputs[humanSide] = localInput();
        inputs[1 - humanSide] = brains[1 - humanSide].input(game);
      }
      stepGame(game, inputs);
      handleEvents(game.ev, mode !== 'demo');
      if (mode === 'demo' && game.phase === 'over' && game.t > 180) game = newGame(99);
      if (mode === 'demo' && (game.score[0] > 8 || game.score[1] > 8)) game.score = [0, 0];
      checkOver();
    }
    if (mode === 'online') {
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
    Render.draw(ctx, mode === 'online' && Net.connected ? onlineView() : game, { hideHud: mode === 'demo', labels: labels() });
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
        Net.host(myName(), netHandlers());
        break;
      case 'quick':
        $('#quickStatus').textContent = '대기실 확인 중...';
        show('p-quick');
        Net.quick(myName(), netHandlers());
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
        if (mode === 'online') {
          b.disabled = true;
          Net.send({ t: 'rematch' });
          $('#overStatus').textContent = '상대를 기다리는 중...';
        } else startGame(mode);
        break;
    }
  });

  function doJoin() {
    const code = $('#joinCode').value.trim().toUpperCase();
    if (code.length !== 4) { $('#joinStatus').textContent = '코드 4자리를 입력해 주세요.'; return; }
    $('#joinStatus').textContent = '접속 중...';
    $('#btnJoin').disabled = true;
    Net.join(code, myName(), netHandlers());
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

  // 디버그용 (읽기 전용)
  window.mallang = { get game() { return game; }, get mode() { return mode; }, get side() { return online.side; } };

  TG.init();
  TG.onBack(() => {
    if (mode === 'cpu') { if (!paused && game.phase !== 'over') setPause(true); else toMenu(); return; }
    if (mode === 'online') { if (confirm('대전을 그만두고 나갈까요?')) toMenu(); return; }
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
