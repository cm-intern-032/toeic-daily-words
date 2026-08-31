/* UI 層：hash 路由 + 畫面渲染。資料一律走 Content / Store / Scheduler。 */
"use strict";

const $main = () => document.getElementById("main");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* defsZh 第一行、去掉詞性前綴與領域標籤，給測驗選項/卡片用 */
function shortDef(w) {
  let line = (w.defsZh || "").split("\n")[0];
  line = line.replace(/^\s*(\[[^\]]+\]\s*)?([a-z]+\.\s*)+/i, "").trim();
  return line || (w.defsZh || "").split("\n")[0];
}
function posLabel(pos) { return pos && pos.length ? pos.join(" · ") : ""; }

/* ── 路由 ─────────────────────────────── */
const routes = {
  "": renderHome, "home": renderHome, "units": renderUnits, "unit": renderUnitDetail,
  "word": renderWord, "flash": renderFlash, "quiz": renderQuizSetup,
  "quiz-run": renderQuizRun, "restore": renderRestore, "settings": renderSettings,
};

function nav(hash) { location.hash = hash; }

async function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  const view = routes[parts[0]] || renderHome;
  document.querySelectorAll(".tabbar button").forEach(b => {
    const tab = { home: "home", units: "units", unit: "units", word: "units", flash: "home", quiz: "quiz", "quiz-run": "quiz", restore: "settings", settings: "settings" }[parts[0] || "home"];
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  try { await view(parts.slice(1)); }
  catch (err) {
    $main().innerHTML = `<div class="pad"><div class="notice bad">載入失敗：${esc(err.message)}。請確認網路後重試。</div></div>`;
  }
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

function topbar(title, backHash) {
  return `<div class="topbar">
    ${backHash != null ? `<button class="backbtn" onclick="history.length>1?history.back():nav('${backHash}')" aria-label="返回">‹</button>` : ""}
    <h1>${esc(title)}</h1></div>`;
}

/* ── 首頁：今日任務 ───────────────────── */
async function renderHome() {
  const tasks = await Scheduler.buildTodayTasks();
  const all = await Content.loadAll();
  const p = Store.progress();
  const learned = all.filter(w => p[w.id] && Store.attempted(p[w.id])).length;
  const mastered = all.filter(w => p[w.id] && !p[w.id].deleted && Store.isMastered(p[w.id])).length;
  const graduated = Object.values(Store.units()).filter(u => u.stage >= CONFIG.GRADUATE_STAGE).length;

  const weekday = "日一二三四五六"[new Date().getDay()];
  let cards = "";

  if (tasks.newUnit) {
    const words = await Content.loadUnit(tasks.newUnit);
    const fresh = words.filter(w => !Store.wordP(w.id).deleted);
    cards += `<div class="card task">
      <div class="task-tag new">新單元</div>
      <h2>Unit ${tasks.newUnit}</h2>
      <p>${fresh.length} 個新單字，先快速瀏覽一遍，再用單字卷檢驗。</p>
      <button class="btn" onclick="Speech.unlock();nav('#/flash/${tasks.newUnit}?task=first')">開始學習</button>
    </div>`;
  }

  for (const r of tasks.reviewUnits) {
    if (r.weak.length === 0) {
      cards += `<div class="card task">
        <div class="task-tag review">複習</div>
        <h2>Unit ${r.unit}</h2>
        <p>這個單元的字都已掌握，直接完成今天的複習。</p>
        <button class="btn ghost" onclick="Scheduler.completeUnit(${r.unit});route()">標記完成</button>
      </div>`;
    } else {
      cards += `<div class="card task">
        <div class="task-tag review">複習</div>
        <h2>Unit ${r.unit}</h2>
        <p>${r.weak.length} 個待加強的字（低盒位或正確率不足）。</p>
        <button class="btn" onclick='Speech.unlock();startQuiz({kind:"review",unit:${r.unit}})'>開始複習測驗</button>
      </div>`;
    }
  }

  if (!tasks.newUnit && tasks.reviewUnits.length === 0) {
    cards = `<div class="card task done-card">
      <h2>今天的任務都完成了 🎉</h2>
      <p>${graduated >= CONFIG.UNITS ? "全部單元畢業，恭喜！" : "想加練可以到「測驗」自由出卷。"}</p>
    </div>`;
  }

  const defer = tasks.deferred.length
    ? `<div class="notice">今日複習量已達上限（${CONFIG.DAILY_WEAK_CAP} 字），Unit ${tasks.deferred.join("、")} 順延到明天。</div>` : "";

  $main().innerHTML = `
    ${topbar("今日任務")}
    <div class="pad">
      <p class="datefmt">${Dates.today().replaceAll("-", " / ")}（${weekday}）</p>
      ${defer}
      ${cards}
      <div class="statrow">
        <div class="stat"><b>${learned}</b><span>已學單字</span></div>
        <div class="stat"><b>${mastered}</b><span>已掌握</span></div>
        <div class="stat"><b>${graduated}</b><span>畢業單元</span></div>
      </div>
      ${Store.persistOk ? "" : `<div class="notice bad">⚠ 無法寫入儲存空間，進度不會保留。請確認 Safari 沒有使用無痕模式。</div>`}
    </div>`;
}

/* ── 單元列表 ─────────────────────────── */
async function renderUnits() {
  let rows = "";
  for (let n = 1; n <= CONFIG.UNITS; n++) {
    const words = await Content.loadUnit(n);
    const u = Store.units()[n];
    const stage = u ? u.stage : 0;
    const learned = words.filter(w => { const p = Store.wordP(w.id); return !p.deleted && Store.attempted(p); }).length;
    const alive = words.filter(w => !Store.wordP(w.id).deleted).length;
    const stagePips = Array.from({ length: CONFIG.GRADUATE_STAGE }, (_, i) =>
      `<i class="${i < stage ? "on" : ""}"></i>`).join("");
    rows += `<div class="card unitrow" onclick="nav('#/unit/${n}')">
      <div class="unitrow-head"><h2>Unit ${n}</h2>
        <span class="stagelbl">${stage >= CONFIG.GRADUATE_STAGE ? "畢業 🎓" : "stage " + stage}</span></div>
      <div class="bar"><div style="width:${alive ? learned / alive * 100 : 0}%"></div></div>
      <div class="unitrow-foot"><span>已學 ${learned}/${alive}</span><span class="pips">${stagePips}</span></div>
    </div>`;
  }
  $main().innerHTML = `${topbar("單元列表")}<div class="pad">${rows}</div>`;
}

/* ── 單元字表 ─────────────────────────── */
async function renderUnitDetail([n]) {
  n = parseInt(n, 10);
  const words = await Content.loadUnit(n);
  const alive = words.filter(w => Store.wordP(w.id).deleted !== "unit");
  const rows = alive.map(w => {
    const p = Store.wordP(w.id);
    const st = Store.isMastered(p) ? "✓" : Store.attempted(p) ? "…" : "";
    return `<div class="wordrow" onclick="nav('#/word/${w.id}')">
      <div><b>${esc(w.headword)}</b>${p.starred ? " ⭐" : ""}<span class="zh">${esc(shortDef(w))}</span></div>
      <span class="wordst ${st === "✓" ? "ok" : ""}">${st}</span>
    </div>`;
  }).join("");
  $main().innerHTML = `
    ${topbar("Unit " + n, "#/units")}
    <div class="pad">
      <div class="rowbtns">
        <button class="btn" onclick="Speech.unlock();nav('#/flash/${n}')">快速記憶</button>
        <button class="btn ghost" onclick='Speech.unlock();startQuiz({kind:"unit",unit:${n}})'>單字卷</button>
      </div>
      <div class="card list">${rows || "<p class='muted pad-s'>此單元的字都被刪除了，可到設定→恢復。</p>"}</div>
    </div>`;
}

/* ── 單字詳情 ─────────────────────────── */
async function renderWord([id]) {
  const w = await Content.getWord(id);
  if (!w) { nav("#/units"); return; }
  const p = Store.wordP(id);
  const acc = p.correct + p.incorrect ? Math.round(Store.acc(p) * 100) + "%" : "—";

  const formsRow = w.forms ? Object.entries({ plural: "複數", past: "過去式", pp: "過去分詞", ing: "現在分詞", thirdSg: "三單" })
    .filter(([k]) => w.forms[k]).map(([k, lbl]) => `<span class="chip">${lbl} ${esc(w.forms[k])}</span>`).join("") : "";

  const examples = (w.examples || []).map(e =>
    `<div class="ex"><p class="en">${esc(e.en)}</p><p class="zh">${esc(e.zh)}</p></div>`).join("");

  $main().innerHTML = `
    ${topbar("單字詳情", "#/unit/" + w.unit)}
    <div class="pad">
      <div class="card wordcard">
        <div class="w-head">
          <h2 class="headword">${esc(w.headword)}</h2>
          <button class="iconbtn" data-word="${esc(w.headword)}" onclick="Speech.unlock();Speech.speak(this.dataset.word)" aria-label="發音">🔊</button>
        </div>
        ${w.ipa ? `<p class="ipa">/${esc(w.ipa)}/</p>` : ""}
        ${w.pos ? `<p class="pos">${esc(posLabel(w.pos))}</p>` : ""}
        <div class="defs">${esc(w.defsZh).split("\n").map(l => `<p>${l}</p>`).join("")}</div>
        ${formsRow ? `<div class="chips">${formsRow}</div>` : ""}
        ${examples ? `<h3>例句</h3>${examples}` : ""}
        ${w.synonyms ? `<h3>同義</h3><div class="chips">${w.synonyms.map(s => `<span class="chip">${esc(s)}</span>`).join("")}</div>` : ""}
        ${w.antonyms ? `<h3>反義</h3><div class="chips">${w.antonyms.map(s => `<span class="chip anti">${esc(s)}</span>`).join("")}</div>` : ""}
        ${w.defsEn ? `<h3>英英釋義</h3><p class="defen">${esc(w.defsEn)}</p>` : ""}
        ${w.note ? `<h3>說明</h3><p>${esc(w.note)}</p>` : ""}
        <div class="w-stats">答對 ${p.correct} · 答錯 ${p.incorrect} · 正確率 ${acc} · 盒位 ${p.box}/${CONFIG.LEITNER_MAX_BOX}</div>
        <div class="rowbtns">
          <button class="btn ghost" onclick="toggleStar('${w.id}')">${p.starred ? "★ 已收藏" : "☆ 收藏"}</button>
          <button class="btn danger" onclick="deleteWord('${w.id}','unit')">刪除此字</button>
        </div>
      </div>
    </div>`;
}

function toggleStar(id) { Store.updateWord(id, { starred: !Store.wordP(id).starred }); route(); }
function deleteWord(id, kind) {
  if (!confirm("刪除後不會出現在學習與測驗中，可到設定→恢復找回。確定？")) return;
  Store.updateWord(id, { deleted: kind });
  history.back();
}

/* ── 快速記憶 ─────────────────────────── */
let flash = null; // {words, i, back, task}

async function renderFlash([arg]) {
  const [unitStr, query] = String(arg || "").split("?");
  const n = parseInt(unitStr, 10);
  if (!n) { nav("#/home"); return; }
  const isTask = (query || "").includes("task=first");
  const words = (await Content.loadUnit(n)).filter(w => !Store.wordP(w.id).deleted);
  if (!flash || flash.unit !== n || flash.isTask !== isTask) {
    flash = { unit: n, words, i: 0, back: false, isTask };
  }
  flash.words = words;
  if (flash.i >= words.length) flash.i = Math.max(0, words.length - 1);
  drawFlash();
}

function drawFlash() {
  const { words, i, back, unit, isTask } = flash;
  if (!words.length) {
    $main().innerHTML = `${topbar("快速記憶", "#/unit/" + unit)}<div class="pad"><div class="notice">沒有可學習的字。</div></div>`;
    return;
  }
  const done = i >= words.length - 1 && back;
  const w = words[i];
  const face = !back
    ? `<h2 class="headword">${esc(w.headword)}</h2>
       ${w.ipa ? `<p class="ipa">/${esc(w.ipa)}/</p>` : ""}
       ${w.pos ? `<p class="pos">${esc(posLabel(w.pos))}</p>` : ""}
       <p class="fliphint">點卡片看釋義</p>`
    : `<div class="defs">${esc(w.defsZh).split("\n").slice(0, 4).map(l => `<p>${l}</p>`).join("")}</div>
       ${(w.examples || [])[0] ? `<div class="ex"><p class="en">${esc(w.examples[0].en)}</p><p class="zh">${esc(w.examples[0].zh)}</p></div>` : ""}`;

  $main().innerHTML = `
    ${topbar("快速記憶 · Unit " + unit, "#/unit/" + unit)}
    <div class="pad flashpad">
      <p class="flash-i">${i + 1} / ${words.length}</p>
      <div class="card flashcard" onclick="flash.back=!flash.back;drawFlash()">${face}</div>
      <div class="rowbtns center">
        <button class="iconbtn big" data-word="${esc(w.headword)}" onclick="Speech.unlock();Speech.speak(this.dataset.word)" aria-label="發音">🔊</button>
        <button class="iconbtn big" onclick="flashDelete()" aria-label="刪除">🗑</button>
      </div>
      <div class="rowbtns">
        <button class="btn ghost" ${i === 0 ? "disabled" : ""} onclick="flash.i--;flash.back=false;drawFlash()">上一張</button>
        ${i < words.length - 1
          ? `<button class="btn" onclick="flash.i++;flash.back=false;drawFlash()">下一張</button>`
          : `<button class="btn" onclick="flashFinish()">完成瀏覽</button>`}
      </div>
    </div>`;
}

function flashDelete() {
  const w = flash.words[flash.i];
  if (!confirm(`刪除「${w.headword}」？`)) return;
  Store.updateWord(w.id, { deleted: "unit" });
  flash.words = flash.words.filter(x => x.id !== w.id);
  if (flash.i >= flash.words.length) flash.i = Math.max(0, flash.words.length - 1);
  flash.back = false;
  drawFlash();
}

function flashFinish() {
  const { unit, isTask } = flash;
  if (isTask) {
    startQuiz({ kind: "unit", unit, task: "first" });
  } else {
    nav("#/unit/" + unit);
  }
  flash = null;
}

/* ── 測驗選擇 ─────────────────────────── */
let multiSel = new Set();

async function renderQuizSetup() {
  const all = await Content.loadAll();
  const starred = all.filter(w => { const p = Store.wordP(w.id); return p.deleted !== "unit" && p.starred; });
  const wrong = all.filter(w => { const p = Store.wordP(w.id); return !p.deleted && Store.isWrongOften(p); });

  const unitChips = Array.from({ length: CONFIG.UNITS }, (_, i) => i + 1)
    .map(n => `<button class="chipbtn ${multiSel.has(n) ? "sel" : ""}" onclick="toggleMulti(${n})">U${n}</button>`).join("");

  const wrongRows = wrong.slice(0, 60).map(w =>
    `<div class="wordrow slim"><div><b>${esc(w.headword)}</b><span class="zh">${esc(shortDef(w))}</span></div>
     <button class="del" onclick="event.stopPropagation();removeFromWrong('${w.id}')">移除</button></div>`).join("");

  $main().innerHTML = `
    ${topbar("測驗")}
    <div class="pad">
      <div class="card">
        <h2>單元卷</h2><p class="muted">單一單元 40 字（已刪除的字不出現）。</p>
        <div class="chiprow">${Array.from({ length: CONFIG.UNITS }, (_, i) => i + 1)
          .map(n => `<button class="chipbtn" onclick='Speech.unlock();startQuiz({kind:"unit",unit:${n}})'>U${n}</button>`).join("")}</div>
      </div>
      <div class="card">
        <h2>多單元複選</h2><p class="muted">點選要合併出題的單元。</p>
        <div class="chiprow">${unitChips}</div>
        <button class="btn" ${multiSel.size ? "" : "disabled"} onclick="Speech.unlock();startMultiQuiz()">開始（${multiSel.size} 個單元）</button>
      </div>
      <div class="card">
        <h2>收藏單字 <span class="cnt">${starred.length}</span></h2>
        <button class="btn" ${starred.length >= CONFIG.QUIZ_OPTIONS ? "" : "disabled"} onclick='Speech.unlock();startQuiz({kind:"star"})'>開始</button>
        ${starred.length < CONFIG.QUIZ_OPTIONS ? `<p class="muted">至少收藏 ${CONFIG.QUIZ_OPTIONS} 個字才能出題。</p>` : ""}
      </div>
      <div class="card">
        <h2>常錯單字 <span class="cnt">${wrong.length}</span></h2>
        <p class="muted">答錯 ≥ ${CONFIG.WRONG_MIN_INCORRECT} 次且正確率 &lt; ${CONFIG.WRONG_ACC * 100}% 的字。</p>
        <button class="btn" ${wrong.length >= CONFIG.QUIZ_OPTIONS ? "" : "disabled"} onclick='Speech.unlock();startQuiz({kind:"wrong"})'>開始</button>
        ${wrongRows ? `<div class="list mt">${wrongRows}</div>` : ""}
      </div>
    </div>`;
}

function toggleMulti(n) { multiSel.has(n) ? multiSel.delete(n) : multiSel.add(n); renderQuizSetup(); }
function removeFromWrong(id) { Store.updateWord(id, { deleted: "wrongList" }); renderQuizSetup(); }
function startMultiQuiz() { startQuiz({ kind: "multi", units: [...multiSel] }); }

/* ── 測驗進行 ─────────────────────────── */
let quiz = null; // {list, pool, i, correct, wrongIds, task, answered}

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

async function startQuiz(opt) {
  const all = await Content.loadAll();
  const aliveInUnit = w => Store.wordP(w.id).deleted !== "unit";
  let list = [], title = "";

  if (opt.kind === "unit") {
    list = (await Content.loadUnit(opt.unit)).filter(aliveInUnit);
    title = `Unit ${opt.unit} 單字卷`;
  } else if (opt.kind === "review") {
    const words = await Content.loadUnit(opt.unit);
    list = words.filter(w => { const p = Store.wordP(w.id); return !p.deleted && Store.isWeak(p); });
    title = `Unit ${opt.unit} 複習`;
  } else if (opt.kind === "multi") {
    for (const n of opt.units) list.push(...(await Content.loadUnit(n)).filter(aliveInUnit));
    title = `多單元卷（${opt.units.map(n => "U" + n).join(" ")}）`;
  } else if (opt.kind === "star") {
    list = all.filter(w => { const p = Store.wordP(w.id); return p.deleted !== "unit" && p.starred; });
    title = "收藏單字卷";
  } else if (opt.kind === "wrong") {
    list = all.filter(w => { const p = Store.wordP(w.id); return !p.deleted && Store.isWrongOften(p); });
    title = "常錯單字卷";
  }

  if (list.length === 0) { alert("沒有可出題的字。"); return; }
  quiz = {
    title, list: shuffle([...list]), pool: all, i: 0, correct: 0, wrongIds: [],
    task: opt.task ? { kind: opt.task, unit: opt.unit } : (opt.kind === "review" ? { kind: "review", unit: opt.unit } : null),
    answered: false,
  };
  nav("#/quiz-run");
  if (location.hash === "#/quiz-run") route();
}

async function renderQuizRun() {
  if (!quiz) { nav("#/quiz"); return; }
  const { list, i } = quiz;

  if (i >= list.length) { renderQuizDone(); return; }
  const w = list[i];

  // 干擾項：同單元優先，不足再從全池補（企劃 §6）
  const sameUnit = quiz.pool.filter(x => x.unit === w.unit && x.id !== w.id);
  const others = shuffle(quiz.pool.filter(x => x.unit !== w.unit && x.id !== w.id));
  const distractors = shuffle([...sameUnit]).slice(0, CONFIG.QUIZ_OPTIONS - 1);
  while (distractors.length < CONFIG.QUIZ_OPTIONS - 1 && others.length) distractors.push(others.pop());
  const opts = shuffle([w, ...distractors]);

  $main().innerHTML = `
    ${topbar(quiz.title, "#/quiz")}
    <div class="pad">
      <p class="flash-i">${i + 1} / ${list.length}　得分 ${quiz.correct}</p>
      <div class="card quizcard">
        <div class="w-head">
          <h2 class="headword">${esc(w.headword)}</h2>
          <button class="iconbtn" data-word="${esc(w.headword)}" onclick="Speech.speak(this.dataset.word)" aria-label="發音">🔊</button>
        </div>
        ${w.ipa ? `<p class="ipa">/${esc(w.ipa)}/</p>` : ""}
      </div>
      <div class="opts" id="opts">
        ${opts.map(o => `<button data-id="${o.id}" onclick="answer('${o.id}','${w.id}',this)">${esc(shortDef(o))}</button>`).join("")}
      </div>
      <div class="quiznext" id="quiznext"></div>
    </div>`;
}

function answer(pickId, rightId, btn) {
  if (quiz.answered) return;
  quiz.answered = true;
  const ok = pickId === rightId;
  Store.markAnswer(rightId, ok);
  if (ok) quiz.correct++; else quiz.wrongIds.push(rightId);

  document.querySelectorAll("#opts button").forEach(b => {
    b.disabled = true;
    if (b.dataset.id === rightId) b.classList.add("correct");
    else if (b === btn) b.classList.add("wrong");
  });
  document.getElementById("quiznext").innerHTML =
    `<span class="fb ${ok ? "ok" : "no"}">${ok ? "答對！" : "答錯，正確答案已標示"}</span>
     <button class="btn" onclick="quiz.i++;quiz.answered=false;route()">${quiz.i + 1 >= quiz.list.length ? "看結果" : "下一題"}</button>`;
  document.querySelector("#quiznext .btn").focus();
}

async function renderQuizDone() {
  const { list, correct, wrongIds, task, title } = quiz;
  if (task) Scheduler.completeUnit(task.unit);

  let wrongRows = "";
  for (const id of wrongIds) {
    const w = await Content.getWord(id);
    if (w) wrongRows += `<div class="wordrow slim" onclick="nav('#/word/${id}')">
      <div><b>${esc(w.headword)}</b><span class="zh">${esc(shortDef(w))}</span></div><span>›</span></div>`;
  }
  const pct = Math.round(correct / list.length * 100);
  $main().innerHTML = `
    ${topbar("測驗結果")}
    <div class="pad">
      <div class="card center-card">
        <p class="scorehero">${correct}<small>/${list.length}</small></p>
        <p class="muted">${title} · 正確率 ${pct}%${task ? " · 今日進度已更新 ✓" : ""}</p>
        <div class="rowbtns center">
          <button class="btn" onclick="quiz=null;nav('#/home')">回今日任務</button>
          <button class="btn ghost" onclick="quiz=null;nav('#/quiz')">再出一卷</button>
        </div>
      </div>
      ${wrongRows ? `<h3 class="secttl">答錯的字</h3><div class="card list">${wrongRows}</div>` : ""}
    </div>`;
  quiz = null;
}

/* ── 恢復已刪除 ───────────────────────── */
async function renderRestore() {
  const all = await Content.loadAll();
  const deleted = all.filter(w => Store.wordP(w.id).deleted === "unit");
  const rows = deleted.map(w =>
    `<div class="wordrow slim"><div><b>${esc(w.headword)}</b><span class="zh">${esc(shortDef(w))}</span></div>
     <button class="btn small ghost" onclick="Store.updateWord('${w.id}',{deleted:null});route()">恢復</button></div>`).join("");
  $main().innerHTML = `
    ${topbar("恢復已刪除", "#/settings")}
    <div class="pad">
      ${deleted.length ? `<button class="btn" onclick="restoreAll()">全部恢復（${deleted.length}）</button>
        <div class="card list mt">${rows}</div>`
        : `<div class="notice">沒有被刪除的單字。</div>`}
    </div>`;
}
async function restoreAll() {
  const all = await Content.loadAll();
  for (const w of all) if (Store.wordP(w.id).deleted === "unit") Store.updateWord(w.id, { deleted: null });
  route();
}

/* ── 設定 ─────────────────────────────── */
function renderSettings() {
  $main().innerHTML = `
    ${topbar("設定")}
    <div class="pad">
      <div class="card">
        <h2>恢復已刪除的單字</h2>
        <button class="btn ghost" onclick="nav('#/restore')">前往恢復頁</button>
      </div>
      <div class="card">
        <h2>備份與還原</h2>
        <p class="muted">進度只存在這台裝置的瀏覽器裡。Safari 可能在儲存空間不足或長期未使用時清除資料，請定期備份。</p>
        <div class="rowbtns">
          <button class="btn" onclick="doExport()">匯出備份檔</button>
          <button class="btn ghost" onclick="showExportText()">顯示備份文字</button>
        </div>
        <textarea id="exportArea" class="ta" hidden readonly></textarea>
        <p class="muted mt">還原：貼上備份內容後按匯入（會覆蓋現有進度）。</p>
        <textarea id="importArea" class="ta" placeholder='{"progress":…}'></textarea>
        <button class="btn ghost" onclick="doImport()">匯入並覆蓋</button>
        <p id="ioMsg" class="muted" role="status"></p>
      </div>
      <div class="card">
        <h2>發音測試</h2>
        <p class="muted">${Speech.supported ? "使用系統語音（en-US）。" : "⚠ 此瀏覽器不支援語音合成。"}</p>
        <button class="btn ghost" ${Speech.supported ? "" : "disabled"}
          onclick="Speech.unlock();Speech.speak('This is a pronunciation test. Concrete. Vacation. Client.')">播放測試句</button>
      </div>
      <div class="card about">
        <h2>關於</h2>
        <p class="muted">TOEIC 單字學習 v1 — 400 字（TSL 1.2 前 400，依多益語料詞頻分 10 單元）。</p>
        <p class="muted">資料來源：TOEIC Service List 1.2（Browne, Culligan &amp; Phillips, CC BY）·
        ECDICT（中文釋義/音標/變形）· Princeton WordNet（英英/同反義）·
        Tatoeba（例句，CC BY 2.0 FR）· OpenCC（簡轉繁）。</p>
      </div>
    </div>`;
}

function doExport() {
  const blob = new Blob([Store.exportJson()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "toeic-vocab-backup-" + Dates.today() + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  document.getElementById("ioMsg").textContent = "已匯出備份檔。";
}
function showExportText() {
  const ta = document.getElementById("exportArea");
  ta.hidden = false; ta.value = Store.exportJson(); ta.focus(); ta.select();
}
function doImport() {
  const msg = document.getElementById("ioMsg");
  try {
    const text = document.getElementById("importArea").value;
    if (!text.trim()) { msg.textContent = "請先貼上備份內容。"; return; }
    if (!confirm("匯入會覆蓋現有進度，確定？")) return;
    Store.importJson(text);
    msg.textContent = "匯入完成。";
  } catch (e) { msg.textContent = "匯入失敗：" + e.message; }
}

/* ── 啟動 ─────────────────────────────── */
document.addEventListener("store:persist-failed", () => { /* 首頁會顯示警告 */ });
Store.updateMeta({ lastOpenDate: Dates.today() });
route();
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
