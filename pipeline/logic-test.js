/* 排程/進度邏輯的無頭測試：stub localStorage 與 fetch，跨「多天」驗證。
   跑法：node pipeline/logic-test.js（在專案根目錄） */
"use strict";
const fs = require("fs");
const path = require("path");

/* ── stubs ── */
const mem = {};
global.localStorage = {
  getItem: k => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: k => { delete mem[k]; },
};
global.document = { dispatchEvent: () => {}, addEventListener: () => {} };
global.fetch = p => {
  const f = path.join(__dirname, "..", "app", p);
  return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(fs.readFileSync(f, "utf8"))) });
};

/* 頂層 const 掛上 globalThis，模擬瀏覽器連續 <script> 的共享環境 */
const load = f => {
  let src = fs.readFileSync(path.join(__dirname, "..", "app", "js", f), "utf8");
  src = src.replace(/^const (CONFIG|Content|Store|Dates|Scheduler|Speech) = /gm, "globalThis.$1 = ");
  (0, eval)(src);
};
load("config.js");
load("store.js");

/* 讓「今天」可控 */
global.FAKE = "2026-08-31";
Dates.today = () => FAKE;

let failures = 0;
function check(name, cond) {
  console.log((cond ? "PASS" : "FAIL") + "  " + name);
  if (!cond) failures++;
}

(async () => {
  /* 1. Leitner 字級 */
  Store.markAnswer("w0001", true);
  Store.markAnswer("w0001", true);
  check("答對兩次 box=2", Store.wordP("w0001").box === 2);
  Store.markAnswer("w0001", false);
  check("答錯歸零 box=0", Store.wordP("w0001").box === 0);
  for (let i = 0; i < 9; i++) Store.markAnswer("w0002", true);
  check("box 封頂 5", Store.wordP("w0002").box === 5);

  /* 2. 常錯定義 */
  const p = Store.wordP("w0003");
  Store.markAnswer("w0003", false); Store.markAnswer("w0003", false); Store.markAnswer("w0003", true);
  check("常錯：錯2對1 → 是", Store.isWrongOften(p));
  for (let i = 0; i < 6; i++) Store.markAnswer("w0003", true);
  check("常錯：多次答對後 → 否", !Store.isWrongOften(p));

  /* 3. 首次學習與間隔 */
  Scheduler.completeUnit(1);
  const u1 = Store.unitP(1);
  check("首學 stage=1", u1.stage === 1);
  check("首學 nextDue=+1 天", u1.nextDue === "2026-09-01");
  Scheduler.completeUnit(1);
  check("同日重複完成不推進", Store.unitP(1).stage === 1);

  /* 4. 隔天複習推進：INTERVALS[1]=2 */
  FAKE = "2026-09-01";
  Scheduler.completeUnit(1);
  check("複習 stage=2", Store.unitP(1).stage === 2);
  check("nextDue=+2 天", Store.unitP(1).nextDue === "2026-09-03");

  /* 5. 畢業 */
  for (const [d, s] of [["2026-09-03", 3], ["2026-09-07", 4], ["2026-09-14", 5], ["2026-09-29", 6]]) {
    FAKE = d; Scheduler.completeUnit(1);
    check(`到 ${d} stage=${s}`, Store.unitP(1).stage === s);
  }
  check("畢業後 nextDue=null", Store.unitP(1).nextDue === null);

  /* 6. buildTodayTasks：新單元派發 */
  FAKE = "2026-09-29";
  let t = await Scheduler.buildTodayTasks();
  check("下一個新單元是 Unit 2", t.newUnit === 2);
  Scheduler.completeUnit(2);
  t = await Scheduler.buildTodayTasks();
  check("今天學過新單元就不再派", t.newUnit === null);

  /* 7. 到期複習出現在任務中 */
  FAKE = "2026-09-30";
  t = await Scheduler.buildTodayTasks();
  check("Unit 2 隔天到期出現", t.reviewUnits.some(r => r.unit === 2));
  check("弱字 = 未答過的 40 字", t.reviewUnits.find(r => r.unit === 2).weak.length === 40);

  /* 8. 防雪崩：讓 4 個單元同日到期（4×40=160 > 120），最新到期的被延後 */
  Store.updateUnit(3, { stage: 1, lastStudied: "2026-09-28", nextDue: "2026-09-29" });
  Store.updateUnit(4, { stage: 1, lastStudied: "2026-09-28", nextDue: "2026-09-30" });
  Store.updateUnit(5, { stage: 1, lastStudied: "2026-09-28", nextDue: "2026-09-30" });
  t = await Scheduler.buildTodayTasks();
  const total = t.reviewUnits.reduce((s, r) => s + r.weak.length, 0);
  check(`防雪崩後弱字 ${total} <= ${CONFIG.DAILY_WEAK_CAP}`, total <= CONFIG.DAILY_WEAK_CAP);
  check("有單元被延後", t.deferred.length >= 1);
  check("被延後單元 nextDue=明天", t.deferred.every(n => Store.unitP(n).nextDue === "2026-10-01"));
  check("最舊到期的 Unit 3 沒被延", !t.deferred.includes(3));

  /* 9. 刪除語意 */
  Store.updateWord("w0081", { deleted: "unit" });      // unit 3 的字
  const w3 = await Content.loadUnit(3);
  const weak3 = w3.filter(w => { const q = Store.wordP(w.id); return !q.deleted && Store.isWeak(q); });
  check("deleted=unit 不進弱字", !weak3.some(w => w.id === "w0081"));
  Store.updateWord("w0082", { deleted: "wrongList" });
  check("deleted=wrongList 也不進每日弱字（!deleted 條件）", !w3.filter(w => { const q = Store.wordP(w.id); return !q.deleted && Store.isWeak(q); }).some(w => w.id === "w0082"));

  /* 10. 匯出/匯入 roundtrip */
  const dump = Store.exportJson();
  Store.markAnswer("w0005", true);
  Store.importJson(dump);
  check("匯入還原 w0005 未作答", Store.wordP("w0005").correct === 0);
  check("匯入保留 Unit1 畢業", Store.unitP(1).stage === 6);

  console.log(failures ? `\n${failures} FAILURES` : "\nALL PASS");
  process.exit(failures ? 1 : 0);
})();
