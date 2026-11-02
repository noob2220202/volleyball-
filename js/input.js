'use strict';
// ===== 입력 : 키보드 + 터치 =====
const Input = (() => {
  const keys = new Set();
  const MAP = [
    { l: ['KeyA'], r: ['KeyD'], u: ['KeyW'], d: ['KeyS'], a: ['KeyF', 'KeyG', 'KeyZ'] },
    { l: ['ArrowLeft'], r: ['ArrowRight'], u: ['ArrowUp'], d: ['ArrowDown'], a: ['Enter', 'NumpadEnter', 'Slash', 'Numpad0', 'ShiftRight'] },
  ];
  const SOLO_EXTRA = { a: ['Space'] };
  const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);

  window.addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT')) return;
    keys.add(e.code);
    if (GAME_KEYS.has(e.code) && document.body.classList.contains('ingame')) e.preventDefault();
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); clearTouch(); });

  function fromKeys(set, extra) {
    const m = MAP[set], o = {};
    for (const k of ['l', 'r', 'u', 'd', 'a']) {
      o[k] = m[k].some(c => keys.has(c)) || (extra && extra[k] ? extra[k].some(c => keys.has(c)) : false) ? 1 : 0;
    }
    return o;
  }

  // ---- 터치 ----
  const touch = [{ l: 0, r: 0, u: 0, d: 0, a: 0 }, { l: 0, r: 0, u: 0, d: 0, a: 0 }];
  const active = new Map();
  let layer = null;

  function clearTouch() { active.clear(); recompute(); }
  function recompute() {
    for (const t of touch) for (const k in t) t[k] = 0;
    if (!layer) return;
    layer.querySelectorAll('button.on').forEach(b => b.classList.remove('on'));
    for (const el of active.values()) {
      touch[+el.dataset.p][el.dataset.k] = 1;
      el.classList.add('on');
    }
  }
  function btnAt(x, y) {
    const t = document.elementFromPoint(x, y);
    return t && t.closest ? t.closest('#touch button[data-k]') : null;
  }

  function setupTouch(el) {
    layer = el;
    el.addEventListener('pointerdown', e => {
      const b = e.target.closest('button[data-k]');
      if (!b) return;
      e.preventDefault();
      try { b.releasePointerCapture(e.pointerId); } catch (_) {}
      active.set(e.pointerId, b); recompute();
      if (window.Sound) Sound.init();
    });
    window.addEventListener('pointermove', e => {
      if (!active.has(e.pointerId)) return;
      const b = btnAt(e.clientX, e.clientY), cur = active.get(e.pointerId);
      if (b && b !== cur && b.dataset.p === cur.dataset.p) { active.set(e.pointerId, b); recompute(); }
    }, { passive: true });
    const end = e => { if (active.delete(e.pointerId)) recompute(); };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }

  function padHTML(p, cls) {
    return `<div class="pad move ${cls}" data-side="${p}">
        <button data-p="${p}" data-k="l" aria-label="왼쪽">◀</button>
        <button data-p="${p}" data-k="d" aria-label="아래">▼</button>
        <button data-p="${p}" data-k="r" aria-label="오른쪽">▶</button>
      </div>
      <div class="pad act ${cls}" data-side="${p}">
        <button data-p="${p}" data-k="u" class="big jump">점프</button>
        <button data-p="${p}" data-k="a" class="big spike">스파이크</button>
      </div>`;
  }

  function setLayout(mode) {
    if (!layer) return;
    clearTouch();
    if (mode === 'dual') {
      layer.className = 'dual';
      layer.innerHTML = `<div class="half left">${padHTML(0, 'p1')}</div><div class="half right">${padHTML(1, 'p2')}</div>`;
    } else if (mode === 'solo') {
      layer.className = 'solo';
      layer.innerHTML = padHTML(0, 'p1');
    } else {
      layer.className = ''; layer.innerHTML = '';
    }
  }

  const or = (a, b) => ({ l: a.l | b.l, r: a.r | b.r, u: a.u | b.u, d: a.d | b.d, a: a.a | b.a });

  return {
    setupTouch, setLayout,
    // 혼자 조종 : 모든 키 + 터치
    solo() { return or(or(fromKeys(0, SOLO_EXTRA), fromKeys(1)), touch[0]); },
    player(i) { return or(fromKeys(i), touch[i]); },
    pressed(code) { return keys.has(code); },
  };
})();
