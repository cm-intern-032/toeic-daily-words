/* 發音：Web Speech API。iOS Safari 首次 speak() 必須由使用者手勢觸發，
   否則之後全部靜音——所以在任何「開始」按鈕的 handler 裡先呼叫 unlock()（企劃 §6）。 */
const Speech = (() => {
  let unlocked = false;
  let voice = null;

  const supported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

  function pickVoice() {
    if (!supported) return;
    const vs = speechSynthesis.getVoices().filter(v => v.lang && v.lang.startsWith("en"));
    voice =
      vs.find(v => v.lang === CONFIG.SPEECH_LANG && v.localService) ||
      vs.find(v => v.lang === CONFIG.SPEECH_LANG) ||
      vs[0] || null;
  }
  if (supported) {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }

  function unlock() {
    if (!supported || unlocked) return;
    unlocked = true;
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u); // 在手勢裡播一次空白句解鎖
  }

  function speak(text) {
    if (!supported || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = CONFIG.SPEECH_LANG;
    u.rate = CONFIG.SPEECH_RATE;
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  }

  return { supported, unlock, speak };
})();
