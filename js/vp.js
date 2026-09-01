/* iOS 鍵盤與 visualViewport 對策（docs/ios-pwa-rules.md §2 的實作，
   移植自規格書驗證過的 VP 模組）。
   原則：面板幾何永不變；鍵盤高度只變 #main 的 padding-bottom（--kb-h）；
   預估先行（focus 手勢同一 task 內墊好留白）、實測校正（事件到了再修正一次）；
   絕不 scrollTo(0,0) 硬壓 iOS 的位移。 */
"use strict";

const VP = (() => {
  const root = document.documentElement;
  const vv = window.visualViewport;
  const KB_ANIM = 420;          // 鍵盤動畫約 250-350ms，留餘裕
  const KB_GUESS_RATIO = 0.42;  // 第一次沒實測值時的估計
  const MIN_KB = 100;
  let lockUntil = 0, lockTimer = null, queued = false;

  const set = kb => root.style.setProperty("--kb-h", Math.round(kb) + "px");

  // 把正在輸入的欄位露到鍵盤上方：在 #main 內滾，不動面板本身
  function revealField(el) {
    const body = el && el.closest && el.closest("#main");
    if (!body) return;
    const kb = parseFloat(root.style.getPropertyValue("--kb-h")) || 0;
    const limit = window.innerHeight - kb - 32;
    const r = el.getBoundingClientRect();
    if (r.bottom > limit) body.scrollTop += Math.ceil(r.bottom - limit);
  }
  function revealActive() {
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) revealField(a);
  }
  function remembered() {       // 上次實測的鍵盤高度
    let v = 0;
    try { v = Number(localStorage.getItem("kb_height")); } catch (e) {}
    return isFinite(v) && v > MIN_KB ? v : 0;
  }
  function measure() {          // 注意：這裡不做 scrollTo(0,0)、不做位移補償
    if (!vv) { set(0); return; }
    let kb = window.innerHeight - vv.height;
    if (kb < MIN_KB) kb = 0;
    else { try { localStorage.setItem("kb_height", String(Math.round(kb))); } catch (e) {} }
    set(kb);
    revealActive();             // 用實測值再校正一次位置
  }
  function lock() {             // 鍵盤動畫期間慢一拍的 vv 事件不理
    lockUntil = Date.now() + KB_ANIM;
    if (lockTimer) clearTimeout(lockTimer);
    lockTimer = setTimeout(() => { lockTimer = null; measure(); }, KB_ANIM + 30);
  }
  function onChange() {
    if (Date.now() < lockUntil || queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; measure(); });
  }
  return {
    watch() {
      if (!vv) { set(0); return; }
      vv.addEventListener("resize", onChange);
      vv.addEventListener("scroll", onChange);
      window.addEventListener("orientationchange", () => { lockUntil = 0; setTimeout(measure, 120); });
      measure();
    },
    // 在 focus 手勢的同一個 task 內墊好留白，iOS 就沒理由自己推畫面
    keyboardOpening(el) {
      set(remembered() || Math.round(window.innerHeight * KB_GUESS_RATIO));
      revealField(el);
      lock();
    },
    keyboardClosing() { set(0); lock(); },
  };
})();

document.addEventListener("focusin", e => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) VP.keyboardOpening(e.target);
});
document.addEventListener("focusout", e => {
  if (!/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  setTimeout(() => {            // 60ms：換欄位時鍵盤沒收，不清留白
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    VP.keyboardClosing();
  }, 60);
});
VP.watch();
