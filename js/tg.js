'use strict';
// ===== 텔레그램 미니앱 연동 =====
// 봇의 미니앱 링크 (BotFather 에서 /newapp 으로 만든 주소). 비워두면 일반 웹 링크로 초대합니다.
// 예: 'https://t.me/MallangVolleyBot/play'
const TG_APP_URL = 'https://t.me/TIP_VOLLEYBALL_game';

const TG = (() => {
  const W = window.Telegram && window.Telegram.WebApp;
  const inTg = !!(W && W.initData);
  const ver = v => inTg && typeof W.isVersionAtLeast === 'function' && W.isVersionAtLeast(v);
  const BG = '#10162e';

  function init() {
    if (!inTg) return;
    document.body.classList.add('tg');
    try {
      W.ready();
      W.expand();
      if (ver('7.7')) W.disableVerticalSwipes(); // 게임 중 아래로 쓸어서 닫히는 것 방지
      if (ver('6.1')) { W.setHeaderColor(BG); W.setBackgroundColor(BG); }
      if (ver('7.10') && W.setBottomBarColor) W.setBottomBarColor(BG);
    } catch (_) {}
  }

  return {
    inTg, init,
    name() {
      const u = inTg && W.initDataUnsafe && W.initDataUnsafe.user;
      return u ? (u.first_name || u.username || '') : '';
    },
    // 'android' | 'ios' | 'tdesktop' | 'macos' | 'web' ... (텔레그램 밖이면 '')
    platform() { return inTg ? String(W.platform || '') : ''; },
    startParam() { return inTg && W.initDataUnsafe ? (W.initDataUnsafe.start_param || '') : ''; },
    haptic(kind) {
      if (!ver('6.1')) return;
      try {
        if (kind === 'success' || kind === 'error' || kind === 'warning') W.HapticFeedback.notificationOccurred(kind);
        else W.HapticFeedback.impactOccurred(kind);
      } catch (_) {}
    },
    backButton(show) { if (ver('6.1')) { show ? W.BackButton.show() : W.BackButton.hide(); } },
    onBack(fn) { if (ver('6.1')) W.BackButton.onClick(fn); },
    confirmClose(on) { if (ver('6.2')) { on ? W.enableClosingConfirmation() : W.disableClosingConfirmation(); } },
    // 전체화면 (Bot API 8.0+). 처리했으면 true
    toggleFullscreen() {
      if (!ver('8.0')) return false;
      try {
        if (W.isFullscreen) { W.exitFullscreen(); if (W.unlockOrientation) W.unlockOrientation(); }
        else { W.requestFullscreen(); if (innerWidth > innerHeight && W.lockOrientation) W.lockOrientation(); }
      } catch (_) {}
      return true;
    },
    inviteLink(code) {
      if (TG_APP_URL) return TG_APP_URL + '?startapp=' + code;
      return location.origin + location.pathname + '?room=' + code;
    },
    // 텔레그램 친구 선택 창으로 공유. 처리했으면 true
    share(url, text) {
      if (!inTg) return false;
      W.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text));
      return true;
    },
    insets() {
      if (!inTg) return { top: 0, bottom: 0, left: 0, right: 0 };
      const a = W.safeAreaInset || {}, b = W.contentSafeAreaInset || {};
      return { top: (a.top || 0) + (b.top || 0), bottom: (a.bottom || 0) + (b.bottom || 0), left: (a.left || 0) + (b.left || 0), right: (a.right || 0) + (b.right || 0) };
    },
    onViewport(fn) {
      if (!inTg) return;
      for (const e of ['viewportChanged', 'fullscreenChanged', 'safeAreaChanged', 'contentSafeAreaChanged']) {
        try { W.onEvent(e, fn); } catch (_) {}
      }
    },
  };
})();
