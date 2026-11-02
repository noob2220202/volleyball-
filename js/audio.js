'use strict';
// ===== 칩튠 사운드 (WebAudio로 실시간 합성, 오리지널 멜로디) =====
const Sound = (() => {
  let ac = null, master = null, sfxGain = null, bgmGain = null;
  let sfxOn = true, bgmOn = true, bgmTimer = null, nextTime = 0, step = 0;

  function init() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain(); master.gain.value = 0.6; master.connect(ac.destination);
      sfxGain = ac.createGain(); sfxGain.connect(master);
      bgmGain = ac.createGain(); bgmGain.gain.value = 0.35; bgmGain.connect(master);
    }
    if (ac.state === 'suspended') ac.resume();
  }

  function tone(freq, dur, type, vol, slide, delay, dest) {
    if (!ac) return;
    const t = ac.currentTime + (delay || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  let noiseBuf = null;
  function noise(dur, vol, freq, delay) {
    if (!ac) return;
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ac.currentTime + (delay || 0);
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 2000;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol || 0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(sfxGain);
    s.start(t); s.stop(t + dur + 0.02);
  }

  function play(k) {
    if (!ac || !sfxOn) return;
    switch (k) {
      case 'jump': tone(320, 0.12, 'square', 0.08, 720); break;
      case 'swing': tone(900, 0.05, 'square', 0.05, 500); break;
      case 'bump': tone(520, 0.07, 'square', 0.12, 260); tone(1040, 0.04, 'triangle', 0.08); break;
      case 'spike': noise(0.18, 0.35, 3500); tone(180, 0.2, 'square', 0.18, 60); tone(1200, 0.08, 'square', 0.08, 300); break;
      case 'dive': noise(0.15, 0.15, 900); tone(200, 0.1, 'triangle', 0.1, 120); break;
      case 'net': tone(140, 0.12, 'triangle', 0.2, 90); break;
      case 'wall': tone(260, 0.05, 'square', 0.06, 200); break;
      case 'ground': noise(0.25, 0.3, 700); tone(110, 0.2, 'triangle', 0.25, 50); break;
      case 'thud': noise(0.08, 0.1, 600); break;
      case 'point': [659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'square', 0.1, null, 0.25 + i * 0.08)); break;
      case 'whistle': tone(1800, 0.25, 'sine', 0.12, 2100); tone(1820, 0.25, 'triangle', 0.05, 2000); break;
      case 'win': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.18, 'square', 0.1, null, i * 0.12)); break;
      case 'select': tone(880, 0.06, 'square', 0.07); break;
      case 'ok': tone(660, 0.06, 'square', 0.07); tone(990, 0.08, 'square', 0.07, null, 0.06); break;
    }
  }

  // ---- 배경음악 : 오리지널 8마디 루프 ----
  const LEAD = [
    72, 76, 79, 76, 77, 76, 74, 0,
    69, 72, 76, 72, 74, 72, 71, 0,
    65, 69, 72, 69, 71, 72, 74, 76,
    79, 0, 77, 76, 74, 0, 71, 0,
    72, 76, 79, 84, 83, 79, 76, 0,
    81, 79, 76, 72, 74, 76, 72, 0,
    77, 76, 74, 72, 74, 76, 77, 79,
    76, 74, 71, 74, 72, 0, 0, 0,
  ];
  const ROOTS = [48, 45, 41, 43, 48, 45, 41, 43];
  const mf = n => 440 * Math.pow(2, (n - 69) / 12);
  const STEP = 60 / 152 / 2;

  function schedule() {
    while (nextTime < ac.currentTime + 0.25) {
      const i = step % LEAD.length;
      const dt = nextTime - ac.currentTime;
      if (LEAD[i]) tone(mf(LEAD[i]), STEP * 0.9, 'square', 0.07, null, dt, bgmGain);
      const root = ROOTS[Math.floor(i / 8)];
      tone(mf(root + (i % 2 ? 7 : 0) - 12 + 12), STEP * 0.8, 'triangle', 0.16, null, dt, bgmGain);
      if (i % 4 === 2) {
        // 하이햇 대용
        const t = nextTime;
        if (noiseBuf) {
          const s = ac.createBufferSource(); s.buffer = noiseBuf;
          const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
          const g = ac.createGain(); g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
          s.connect(f); f.connect(g); g.connect(bgmGain); s.start(t); s.stop(t + 0.05);
        }
      }
      nextTime += STEP; step++;
    }
  }

  function startBgm() {
    if (!ac || !bgmOn || bgmTimer) return;
    if (!noiseBuf) noise(0.001, 0.0001);
    nextTime = ac.currentTime + 0.1; step = 0;
    bgmTimer = setInterval(schedule, 60);
  }
  function stopBgm() { if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; } }

  return {
    init, play, startBgm, stopBgm,
    setSfx(v) { sfxOn = v; },
    setBgm(v) { bgmOn = v; if (!v) stopBgm(); },
    get sfx() { return sfxOn; }, get bgm() { return bgmOn; },
  };
})();
