/* 資料層：內容 JSON（唯讀，逐單元載入）與進度 localStorage（讀寫）。
   UI 一律經由 Content / Store 存取，禁止直接碰 localStorage（企劃 §10）。 */

const Content = (() => {
  const cache = new Map(); // unit -> Promise<word[]>

  function loadUnit(n) {
    if (typeof window !== "undefined" && window.__UNITS) {
      return Promise.resolve(window.__UNITS[n] || []); // 單檔預覽版：資料直接內嵌
    }
    if (!cache.has(n)) {
      cache.set(n, fetch(`data/units/unit-${String(n).padStart(2, "0")}.json`)
        .then(r => { if (!r.ok) throw new Error("unit " + n + " HTTP " + r.status); return r.json(); })
        .catch(err => { cache.delete(n); throw err; }));
    }
    return cache.get(n);
  }

  async function loadAll() {
    const units = [];
    for (let i = 1; i <= CONFIG.UNITS; i++) units.push(loadUnit(i));
    return (await Promise.all(units)).flat();
  }

  async function getWord(id) {
    if (!/^w\d{4}$/.test(String(id))) return null;
    const unit = Math.floor((parseInt(id.slice(1), 10) - 1) / CONFIG.UNIT_SIZE) + 1;
    if (unit < 1 || unit > CONFIG.UNITS) return null;
    const words = await loadUnit(unit);
    return words.find(w => w.id === id) || null;
  }

  return { loadUnit, loadAll, getWord };
})();

const Store = (() => {
  const KEYS = { progress: "progress", units: "units", meta: "meta" };
  let mem = { progress: null, units: null, meta: null }; // 記憶體快取
  let persistOk = true;

  function read(key, fallback) {
    if (mem[key]) return mem[key];
    try {
      const raw = localStorage.getItem(KEYS[key]);
      mem[key] = raw ? JSON.parse(raw) : fallback;
    } catch (e) { mem[key] = fallback; }
    if (!mem[key] || typeof mem[key] !== "object") mem[key] = fallback;
    return mem[key];
  }

  function write(key) {
    if (!persistOk) return;
    try { localStorage.setItem(KEYS[key], JSON.stringify(mem[key])); }
    catch (e) { persistOk = false; }
  }

  /* ── 單字進度 ── */
  function progress() { return read("progress", {}); }

  const freshP = () => ({ correct: 0, incorrect: 0, box: 0, starred: false, deleted: null });

  /* 唯讀：沒有紀錄就回傳預設值，但「不」寫進 progress——
     否則瀏覽一次列表就會把 400 筆零紀錄持久化，之後每次寫入都變大包。 */
  function wordP(id) { return progress()[id] || freshP(); }

  /* 只有真正要寫入時才建立紀錄 */
  function ensureP(id) {
    const p = progress();
    return p[id] || (p[id] = freshP());
  }

  function updateWord(id, patch) {
    Object.assign(ensureP(id), patch);
    write("progress");
  }

  function markAnswer(id, ok) {
    const w = ensureP(id);
    if (ok) { w.correct++; w.box = Math.min(w.box + 1, CONFIG.LEITNER_MAX_BOX); }
    else { w.incorrect++; w.box = 0; }
    write("progress");
  }

  /* 批次恢復 deleted==="unit" 的字：一次寫入，回傳恢復筆數 */
  function restoreUnitDeleted() {
    const p = progress();
    let n = 0;
    for (const k in p) if (p[k].deleted === "unit") { p[k].deleted = null; n++; }
    if (n) write("progress");
    return n;
  }

  /* ── 單元進度 ── */
  function units() { return read("units", {}); }

  function unitP(n) {
    const u = units();
    if (!u[n]) u[n] = { stage: 0, lastStudied: null, nextDue: null };
    return u[n];
  }

  function updateUnit(n, patch) {
    Object.assign(unitP(n), patch);
    write("units");
  }

  /* ── meta ── */
  function meta() {
    const m = read("meta", { lastOpenDate: null, newUnitPerDay: CONFIG.NEW_UNIT_PER_DAY });
    return m;
  }
  function updateMeta(patch) { Object.assign(meta(), patch); write("meta"); }

  /* ── 衍生查詢 ── */
  const acc = p => (p.correct + p.incorrect) ? p.correct / (p.correct + p.incorrect) : 0;
  const attempted = p => p.correct + p.incorrect > 0;
  const isWeak = p => p.box < CONFIG.WEAK_BOX || acc(p) < CONFIG.WEAK_ACC;
  const isMastered = p => p.box >= CONFIG.MASTER_BOX && acc(p) >= CONFIG.MASTER_ACC;
  const isWrongOften = p => p.incorrect >= CONFIG.WRONG_MIN_INCORRECT && acc(p) < CONFIG.WRONG_ACC;

  /* ── 備份 ── */
  function exportJson() {
    return JSON.stringify({
      app: "toeic-vocab-v1", exportedAt: new Date().toISOString(),
      progress: progress(), units: units(), meta: meta(),
    }, null, 1);
  }

  function importJson(text) {
    const d = JSON.parse(text); // 丟出例外由 UI 顯示
    if (!d || typeof d !== "object" || !d.progress || !d.units) throw new Error("備份內容缺少 progress/units 欄位");
    mem = { progress: d.progress, units: d.units, meta: d.meta || meta() };
    write("progress"); write("units"); write("meta");
  }

  return { progress, wordP, updateWord, markAnswer, restoreUnitDeleted,
           units, unitP, updateUnit,
           meta, updateMeta, acc, attempted, isWeak, isMastered, isWrongOften,
           exportJson, importJson, get persistOk() { return persistOk; } };
})();

/* ── 日期工具（本地時區，改系統日期即可驗證排程） ── */
const Dates = (() => {
  /* 排程全靠這個格式做字典序比較，兩個出口必須共用同一個格式化 */
  const fmt = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  return {
    today() { return fmt(new Date()); },
    plus(dateStr, days) {
      const [y, m, dd] = dateStr.split("-").map(Number);
      return fmt(new Date(y, m - 1, dd + days));
    },
  };
})();

/* ── 每日任務（企劃 §5 虛擬碼的直譯） ── */
const Scheduler = (() => {
  async function buildTodayTasks() {
    const today = Dates.today();
    const uState = Store.units();

    // 到期且未畢業的單元，最舊到期優先
    const due = [];
    for (let n = 1; n <= CONFIG.UNITS; n++) {
      const u = uState[n];
      if (u && u.stage > 0 && u.stage < CONFIG.GRADUATE_STAGE && u.nextDue && u.nextDue <= today) {
        due.push({ n, u });
      }
    }
    due.sort((a, b) => (a.u.nextDue < b.u.nextDue ? -1 : a.u.nextDue > b.u.nextDue ? 1 : a.n - b.n));

    await Promise.all(due.map(d => Content.loadUnit(d.n))); // 平行抓，冷載入不串行等待
    const reviewUnits = [];
    for (const { n } of due) {
      const words = await Content.loadUnit(n);
      const weak = words.filter(w => {
        const p = Store.wordP(w.id);
        // wrongList 只影響常錯清單（§6 查詢條件差異），不能讓字從每日複習消失
        return p.deleted !== "unit" && Store.isWeak(p);
      });
      reviewUnits.push({ unit: n, weak });
    }

    // 防雪崩：弱字總量 > 上限，把「最新到期且有弱字」的單元延到明天（stage 不變）。
    // 零弱字單元延了也不減量，跳過；最舊到期（index 0）永遠保留。
    const deferred = [];
    while (reviewUnits.reduce((s, r) => s + r.weak.length, 0) > CONFIG.DAILY_WEAK_CAP) {
      let idx = -1;
      for (let i = reviewUnits.length - 1; i > 0; i--) {
        if (reviewUnits[i].weak.length > 0) { idx = i; break; }
      }
      if (idx < 1) break;
      const drop = reviewUnits.splice(idx, 1)[0];
      Store.updateUnit(drop.unit, { nextDue: Dates.plus(today, 1) });
      deferred.push(drop.unit);
    }

    // 今日新單元：第一個 stage == 0 的單元（每天 1 個；今天已學過新單元就不再派）
    let newUnit = null;
    const learnedNewToday = Object.entries(Store.units())
      .some(([, u]) => u.lastStudied === today && u.stage === 1);
    if (!learnedNewToday) {
      for (let n = 1; n <= CONFIG.UNITS; n++) {
        const u = Store.units()[n];
        if (!u || u.stage === 0) { newUnit = n; break; }
      }
    }

    return { newUnit, reviewUnits, deferred };
  }

  /* 完成一次單元學習/複習後推進 stage（同一天不重複推進） */
  function completeUnit(n) {
    const today = Dates.today();
    const u = Store.unitP(n);
    if (u.lastStudied === today && u.stage > 0) return; // 今天已算過
    const stage = Math.min(u.stage + 1, CONFIG.GRADUATE_STAGE);
    const nextDue = stage >= CONFIG.GRADUATE_STAGE ? null : Dates.plus(today, CONFIG.INTERVALS[stage - 1]);
    Store.updateUnit(n, { stage, lastStudied: today, nextDue });
  }

  return { buildTodayTasks, completeUnit };
})();
