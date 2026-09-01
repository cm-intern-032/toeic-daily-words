/* UI 層：hash 路由 + 畫面渲染。資料一律走 Content / Store / Scheduler。 */
"use strict";

const $main = () => document.getElementById("main");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* defsZh 第一行、去掉詞性前綴與領域標籤，給測驗選項/卡片用 */
function shortDef(w) {
  const first = (w.defsZh || "").split("\n")[0];
  const stripped = first.replace(/^\s*(\[[^\]]+\]\s*)?([a-z]+\.\s*)+/i, "").trim();
  return stripped || first; // 整行都是前綴時退回原句
}
function posLabel(pos) { return pos && pos.length ? pos.join(" · ") : ""; }

/* 共用片段：例句、釋義行、發音按鈕（改這裡，各畫面同步生效） */
function exHtml(e) {
  return `<div class="ex"><p class="en">${esc(e.en)}</p>${e.zh ? `<p class="zh">${esc(e.zh)}</p>` : ""}</div>`;
}
function defsHtml(w, maxLines) {
  let lines = esc(w.defsZh).split("\n");
  if (maxLines) lines = lines.slice(0, maxLines);
  return `<div class="defs">${lines.map(l => `<p>${l}</p>`).join("")}</div>`;
}
/* 行內 SVG 圖示（Feather icons, MIT）——全站禁用 emoji */
const ICONS = {
  speaker: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  list: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
};
function speakBtn(headword, extra) {
  return `<button class="iconbtn${extra ? " " + extra : ""}" data-word="${esc(headword)}"
    onclick="Speech.unlock();Speech.speak(this.dataset.word)" aria-label="發音">${ICONS.speaker}</button>`;
}

/* ── 路由 ─────────────────────────────── */
const routes = {
  "": renderHome, "home": renderHome, "units": renderUnits, "unit": renderUnitDetail,
  "word": renderWord, "flash": renderFlash, "quiz": renderQuizSetup,
  "quiz-run": renderQuizRun, "restore": renderRestore, "settings": renderSettings,
};

function nav(hash) { location.hash = hash; }

/* 每個路由屬於哪個底部分頁（新路由記得補一行） */
const TAB_OF = { home: "home", units: "units", unit: "units", word: "units", flash: "home", quiz: "quiz", "quiz-run": "quiz", restore: "settings", settings: "settings" };

/* 沉浸式葉層畫面（單字卡/索引/翻卡/測驗進行中）隱藏底部分頁列——
   不是所有畫面都需要全域導航，專注畫面只留返回 */
const CHROMELESS = new Set(["unit", "word", "flash", "quiz-run"]);

async function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  const view = routes[parts[0]] || renderHome;
  document.body.classList.toggle("no-tabs", CHROMELESS.has(parts[0]));
  const tab = TAB_OF[parts[0] || "home"];
  document.querySelectorAll(".tabbar button").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  try { await view(parts.slice(1)); }
  catch (err) {
    $main().innerHTML = `<div class="pad"><div class="notice bad">載入失敗：${esc(err.message)}。請確認網路後重試。</div></div>`;
  }
  $main().scrollTop = 0; // 滾動都在 #main 內層（ios-pwa-rules §3）
}

/* App 內對話框：standalone 下不用 confirm()/alert()（ios-pwa-rules §12） */
function showDialog(msg, buttons) {
  const dlg = document.getElementById("appDialog");
  if (!dlg || typeof dlg.showModal !== "function") { // 極舊環境退回原生
    if (buttons.length > 1) { if (window.confirm(msg)) buttons[buttons.length - 1].onPick?.(); }
    else window.alert(msg);
    return;
  }
  document.getElementById("dlgMsg").textContent = msg;
  const host = document.getElementById("dlgBtns");
  host.innerHTML = "";
  for (const b of buttons) {
    const btn = document.createElement("button");
    btn.className = "btn " + (b.kind || "");
    btn.textContent = b.label;
    btn.addEventListener("click", () => { dlg.close(); b.onPick && b.onPick(); });
    host.appendChild(btn);
  }
  dlg.showModal();
}
function showConfirm(msg, okLabel, onOk, danger) {
  showDialog(msg, [{ label: "取消", kind: "ghost" }, { label: okLabel, kind: danger ? "danger" : "", onPick: onOk }]);
}
function showAlert(msg) { showDialog(msg, [{ label: "知道了" }]); }
window.addEventListener("hashchange", route);

function topbar(title, backHash, action) {
  return `<div class="topbar">
    ${backHash != null ? `<button class="backbtn" onclick="history.length>1?history.back():nav('${backHash}')" aria-label="返回">‹</button>` : ""}
    <h1>${esc(title)}</h1>
    ${action ? `<div class="topbar-action">${action}</div>` : ""}</div>`;
}

/* 水平滑動手勢（ios-pwa-rules §3）：slop 判向、水平才 capture、
   垂直交還瀏覽器捲動（元素需 touch-action:pan-y）、pointercancel 必處理 */
function attachSwipe(el, onPrev, onNext) {
  const SLOP = 8, THRESH = 70;
  let startX = 0, startY = 0, dx = 0, decided = null, pid = null;
  el.addEventListener("pointerdown", e => {
    if (e.button) return;
    pid = e.pointerId; startX = e.clientX; startY = e.clientY; dx = 0; decided = null;
  });
  el.addEventListener("pointermove", e => {
    if (e.pointerId !== pid) return;
    const mx = e.clientX - startX, my = e.clientY - startY;
    if (!decided) {
      if (Math.abs(mx) < SLOP && Math.abs(my) < SLOP) return;
      decided = Math.abs(mx) > Math.abs(my) ? "h" : "v";
      if (decided === "h") { try { el.setPointerCapture(pid); } catch (err) {} el.style.transition = "none"; }
    }
    if (decided !== "h") return;
    dx = mx;
    // 沒有目標方向時做阻尼（rubber-band）
    const damp = (dx < 0 && !onNext) || (dx > 0 && !onPrev) ? 0.25 : 1;
    el.style.transform = `translateX(${dx * damp}px)`;
    el.style.opacity = String(1 - Math.min(Math.abs(dx * damp) / 500, .35));
  });
  const reset = () => {
    el.style.transition = "transform .25s var(--ease), opacity .25s";
    el.style.transform = ""; el.style.opacity = "";
  };
  const fly = (dir, cb) => {
    el.style.transition = "transform .18s ease-out, opacity .18s";
    el.style.transform = `translateX(${dir * window.innerWidth}px)`;
    el.style.opacity = "0";
    setTimeout(cb, 150);
  };
  el.addEventListener("pointerup", e => {
    if (e.pointerId !== pid) return;
    pid = null;
    if (decided !== "h") return;
    if (dx <= -THRESH && onNext) fly(-1, onNext);
    else if (dx >= THRESH && onPrev) fly(1, onPrev);
    else reset();
  });
  el.addEventListener("pointercancel", e => { if (e.pointerId === pid) { pid = null; reset(); } });
}

/* ── 首頁：今日任務 ───────────────────── */
async function renderHome() {
  const tasks = await Scheduler.buildTodayTasks();
  const all = await Content.loadAll();
  const p = Store.progress();
  const learned = all.filter(w => p[w.id] && Store.attempted(p[w.id])).length;
  const mastered = all.filter(w => p[w.id] && p[w.id].deleted !== "unit" && Store.isMastered(p[w.id])).length;
  const graduated = Object.values(Store.units()).filter(u => u.stage >= CONFIG.GRADUATE_STAGE).length;

  const weekday = "日一二三四五六"[new Date().getDay()];
  let sections = "";

  if (tasks.newUnit) {
    const words = await Content.loadUnit(tasks.newUnit);
    const fresh = words.filter(w => !Store.wordP(w.id).deleted);
    sections += `<div class="task">
      <div class="task-tag">新單元</div>
      <h2>Unit ${tasks.newUnit}</h2>
      <p>${fresh.length} 個新單字，先快速瀏覽一遍，再用單字卷檢驗。</p>
      <button class="btn" onclick="Speech.unlock();nav('#/flash/${tasks.newUnit}?task=first')">開始學習</button>
    </div>`;
  }

  for (const r of tasks.reviewUnits) {
    sections += r.weak.length === 0
      ? `<div class="task">
        <div class="task-tag">複習</div>
        <h2>Unit ${r.unit}</h2>
        <p>這個單元的字都已掌握，直接完成今天的複習。</p>
        <button class="btn ghost" onclick="Scheduler.completeUnit(${r.unit});route()">標記完成</button>
      </div>`
      : `<div class="task">
        <div class="task-tag">複習</div>
        <h2>Unit ${r.unit}</h2>
        <p>${r.weak.length} 個待加強的字（低盒位或正確率不足）。</p>
        <button class="btn" onclick='Speech.unlock();startQuiz({kind:"review",unit:${r.unit}})'>開始複習測驗</button>
      </div>`;
  }

  if (!tasks.newUnit && tasks.reviewUnits.length === 0) {
    sections = `<div class="done-note">
      <b>今天的任務都完成了</b>
      ${graduated >= CONFIG.UNITS ? "全部單元畢業，恭喜！" : "想加練可以到「測驗」自由出卷。"}
    </div>`;
  }

  const defer = tasks.deferred.length
    ? `<div class="notice">今日複習量已達上限（${CONFIG.DAILY_WEAK_CAP} 字），Unit ${tasks.deferred.join("、")} 順延到明天。</div>` : "";

  // 未來 7 天複習負載（ui-design-spec §6.3）
  const today = Dates.today();
  const days = [];
  for (let d = 0; d < 7; d++) {
    const date = Dates.plus(today, d);
    let count = 0;
    for (let n = 1; n <= CONFIG.UNITS; n++) {
      const u = Store.units()[n];
      if (u && u.stage > 0 && u.stage < CONFIG.GRADUATE_STAGE && u.nextDue === date) {
        const words = await Content.loadUnit(n);
        count += words.filter(w => { const q = Store.wordP(w.id); return q.deleted !== "unit" && Store.isWeak(q); }).length;
      }
    }
    days.push({ count, wd: "日一二三四五六"[new Date(date.replace(/-/g, "/")).getDay()] });
  }
  const maxLoad = Math.max(1, ...days.map(x => x.count));
  const loadbars = days.map((x, idx) => `<div class="col ${idx === 0 ? "today" : ""}">
      <span class="d">${x.count || ""}</span>
      <div class="bar" style="height:${x.count ? Math.max(6, Math.round(x.count / maxLoad * 64)) : 2}px"></div>
      <span class="d">${idx === 0 ? "今天" : x.wd}</span>
    </div>`).join("");

  $main().innerHTML = `
    ${topbar("今日任務")}
    <div class="pad">
      <p class="datefmt">${Dates.today().replaceAll("-", " / ")}（${weekday}）</p>
      ${defer}
      ${sections}
      <div class="loadchart">
        <p class="fieldname">未來 7 天複習負載</p>
        <div class="loadbars">${loadbars}</div>
      </div>
      <div class="stat3">
        <div><b>${learned}</b><span>已學單字</span></div>
        <div><b>${mastered}</b><span>已掌握</span></div>
        <div><b>${graduated}</b><span>畢業單元</span></div>
      </div>
      ${Store.persistOk ? "" : `<div class="notice bad">注意：無法寫入儲存空間，進度不會保留。請確認 Safari 沒有使用無痕模式。</div>`}
    </div>`;
}

/* ── 單元列表（ui-design-spec §6.2）：格子圖 + 64px 列 ── */
const heatColor = s => `var(--heat-${Math.min(6, Math.max(0, s))})`;

async function renderUnits() {
  await Content.loadAll(); // 平行抓全部單元，之後的 loadUnit 都命中快取
  let cells = "", rows = "";
  for (let n = 1; n <= CONFIG.UNITS; n++) {
    const words = await Content.loadUnit(n);
    const u = Store.units()[n];
    const stage = Math.min(u ? u.stage : 0, 6); // 熱度色階 0–6（stage 7 畢業視同 6）
    const learned = words.filter(w => { const p = Store.wordP(w.id); return p.deleted !== "unit" && Store.attempted(p); }).length;
    const alive = words.filter(w => Store.wordP(w.id).deleted !== "unit").length;
    cells += `<button style="background:${heatColor(stage)}" class="${stage >= 3 ? "deep" : ""}"
      onclick="nav('#/unit/${n}')" aria-label="Unit ${n}，熱度 ${stage}">${n}</button>`;
    rows += `<button class="unitrow" onclick="nav('#/unit/${n}')">
      <span class="heat" style="background:${heatColor(stage)}"></span>
      <span class="u-mid">
        <span class="u-title">Unit ${n}</span>
        <span class="track"><span style="width:${alive ? learned / alive * 100 : 0}%"></span></span>
      </span>
      <span class="u-count">${learned}<small>/ ${alive}</small></span>
    </button>`;
  }
  $main().innerHTML = `${topbar("單元")}<div class="pad">
    <div class="gridmap">${cells}</div>
    <div class="list">${rows}</div>
  </div>`;
}

/* ── 單元字表 ─────────────────────────── */
/* ── 單元＝可滑動的單字卡分頁器 ─────────
   #/unit/n 直接開卡片，左滑下一個、右滑上一個；#/unit/n/list 是索引清單 */
let pager = null; // {unit, words, i, lastSpoken}

async function renderUnitDetail([n, mode]) {
  n = parseInt(n, 10);
  const words = await Content.loadUnit(n);
  const alive = words.filter(w => Store.wordP(w.id).deleted !== "unit");
  if (mode === "list") { renderUnitList(n, alive); return; }
  if (!alive.length) {
    $main().innerHTML = `${topbar("Unit " + n, "#/units")}
      <div class="pad"><div class="empty"><b>此單元的字都被刪除了</b>可到設定→恢復找回。</div></div>`;
    return;
  }
  if (!pager || pager.unit !== n) pager = { unit: n, i: 0, lastSpoken: null };
  pager.words = alive;
  if (pager.i >= alive.length) pager.i = alive.length - 1;
  drawPager(0);
}

function drawPager(enterDir) {
  const { words, i, unit } = pager;
  const w = words[i];
  $main().innerHTML = `
    ${topbar("Unit " + unit, "#/units",
      `<button class="iconbtn" onclick="nav('#/unit/${unit}/list')" aria-label="單字列表">${ICONS.list}</button>`)}
    <div class="pad">
      <p class="flash-i">${i + 1} / ${words.length}</p>
      <div class="pager">
        <div class="card wordcard" id="pagerCard">${wordCardHtml(w)}</div>
      </div>
      ${wstats3Html(w.id)}
      <!-- 視覺上以滑動為唯一導航；保留螢幕閱讀器專用的前後頁按鈕 -->
      <button class="sr-only" ${i === 0 ? "disabled" : ""} onclick="pagerGo(-1)">上一個單字</button>
      <button class="sr-only" ${i === words.length - 1 ? "disabled" : ""} onclick="pagerGo(1)">下一個單字</button>
    </div>`;

  const card = document.getElementById("pagerCard");
  if (enterDir) { // 新卡從滑動方向淡入
    card.style.transform = `translateX(${enterDir * 32}px)`;
    card.style.opacity = "0";
    requestAnimationFrame(() => {
      card.style.transition = "transform .22s var(--ease), opacity .22s";
      card.style.transform = ""; card.style.opacity = "";
    });
  }
  attachSwipe(card,
    i > 0 ? () => pagerGo(-1) : null,
    i < words.length - 1 ? () => pagerGo(1) : null);

  if (Store.meta().autoSpeak !== false && pager.lastSpoken !== w.id) {
    pager.lastSpoken = w.id;
    Speech.speak(w.headword);
  }
}

function pagerGo(dir) {
  const next = Math.max(0, Math.min(pager.words.length - 1, pager.i + dir));
  if (next === pager.i) return;
  pager.i = next;
  drawPager(dir);
}

function openPagerAt(unit, idx) {
  pager = { unit, i: idx, lastSpoken: null };
  const target = "#/unit/" + unit;
  if (location.hash === target) route(); else nav(target);
}

function renderUnitList(n, alive) {
  const rows = alive.map((w, idx) => {
    const p = Store.wordP(w.id);
    const st = Store.isMastered(p) ? "✓" : Store.attempted(p) ? "…" : "";
    return `<button class="wordrow" onclick="openPagerAt(${n},${idx})">
      <div><b>${esc(w.headword)}</b>${p.starred ? '<span class="star">★</span>' : ""}<span class="zh">${esc(shortDef(w))}</span></div>
      <span class="wordst ${st === "✓" ? "ok" : ""}">${st}</span>
    </button>`;
  }).join("");
  $main().innerHTML = `
    ${topbar("Unit " + n + " 索引", "#/unit/" + n)}
    <div class="pad"><div class="list">${rows}</div></div>`;
}

/* 分頁器鍵盤操作（桌面） */
document.addEventListener("keydown", e => {
  if (!pager || !location.hash.startsWith("#/unit/") || location.hash.endsWith("/list")) return;
  if (e.target.matches("input,textarea,select")) return;
  if (e.key === "ArrowLeft") pagerGo(-1);
  if (e.key === "ArrowRight") pagerGo(1);
});

/* ── 單字卡模板（分頁器與獨立詳情頁共用，ui-design-spec §6.1） ── */
function wordCardHtml(w) {
  const p = Store.wordP(w.id);
  const formsRow = w.forms ? Object.entries({ plural: "複數", past: "過去式", pp: "過去分詞", ing: "現在分詞", thirdSg: "三單" })
    .filter(([k]) => w.forms[k]).map(([k, lbl]) => `<span class="chip">${lbl} ${esc(w.forms[k])}</span>`).join("") : "";
  const examples = (w.examples || []).map(exHtml).join("");
  const boxes = Array.from({ length: CONFIG.LEITNER_MAX_BOX }, (_, k) => `<i class="${k < p.box ? "on" : ""}"></i>`).join("");
  return `
        <div class="boxsq" role="img" aria-label="盒位 ${p.box}/${CONFIG.LEITNER_MAX_BOX}">${boxes}</div>
        <div class="w-head">
          <span class="headword">${esc(w.headword)}</span>
          ${speakBtn(w.headword, "speak40")}
        </div>
        ${w.ipa ? `<p class="ipa">/${esc(w.ipa)}/</p>` : ""}
        ${defsHtml(w)}
        ${formsRow ? `<div class="chips scroll">${formsRow}</div>` : ""}
        ${examples ? `<h3>例句</h3>${examples}` : ""}
        ${w.synonyms ? `<h3>同義</h3><div class="chips">${w.synonyms.map(s => `<span class="chip">${esc(s)}</span>`).join("")}</div>` : ""}
        ${w.antonyms ? `<h3>反義</h3><div class="chips">${w.antonyms.map(s => `<span class="chip anti">${esc(s)}</span>`).join("")}</div>` : ""}
        ${w.defsEn ? `<h3>英英釋義</h3><p class="defen">${esc(w.defsEn)}</p>` : ""}
        ${w.note ? `<h3>說明</h3><p>${esc(w.note)}</p>` : ""}
        <div class="cardfoot">
          <button class="btn ghost small" onclick="toggleStar('${w.id}')">${p.starred ? "★ 已收藏" : "☆ 收藏"}</button>
          <button class="linkbtn danger" onclick="deleteWord('${w.id}','unit')">刪除此字</button>
        </div>`;
}

/* 單字統計三欄：不進卡片、貼齊畫面底（§3.6） */
function wstats3Html(id) {
  const p = Store.wordP(id);
  const acc = p.correct + p.incorrect ? Math.round(Store.acc(p) * 100) + "%" : "—";
  return `<div class="wstats3">
    <div><b>${p.correct}</b><span>答對</span></div>
    <div><b>${p.incorrect}</b><span>答錯</span></div>
    <div><b>${acc}</b><span>正確率</span></div>
  </div>`;
}

/* ── 單字詳情（跨情境的獨立頁：測驗結果、恢復頁等入口） ── */
async function renderWord([id]) {
  const w = await Content.getWord(id);
  if (!w) { nav("#/units"); return; }
  $main().innerHTML = `
    ${topbar("單字詳情", "#/unit/" + w.unit)}
    <div class="pad">
      <div class="card wordcard">${wordCardHtml(w)}</div>
      ${wstats3Html(w.id)}
    </div>`;
}

function toggleStar(id) { Store.updateWord(id, { starred: !Store.wordP(id).starred }); route(); }
function deleteWord(id, kind) {
  showConfirm("刪除後不會出現在學習與測驗中，可到設定→恢復找回。", "刪除", () => {
    Store.updateWord(id, { deleted: kind });
    // 在分頁器裡刪除：原地補位到下一張；獨立詳情頁則返回上一頁
    if (location.hash.startsWith("#/unit/") && pager) {
      pager.words = pager.words.filter(x => x.id !== id);
      if (!pager.words.length) { nav("#/units"); return; }
      if (pager.i >= pager.words.length) pager.i = pager.words.length - 1;
      drawPager(0);
    } else {
      history.back();
    }
  }, true);
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
    flash = { unit: n, words, i: 0, back: false, isTask, lastSpoken: null };
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
  const w = words[i];
  // 正反面同時渲染成 3D 卡片，翻面只切 class，動畫才有「同一張卡」的連續性
  const front = `<span class="headword">${esc(w.headword)}</span>
       ${w.ipa ? `<p class="ipa">/${esc(w.ipa)}/</p>` : ""}
       ${w.pos ? `<p class="posline">${esc(posLabel(w.pos))}</p>` : ""}
       <p class="fliphint">點卡片看釋義</p>`;
  const backFace = `${defsHtml(w, 4)}
       ${(w.examples || [])[0] ? exHtml(w.examples[0]) : ""}`;

  $main().innerHTML = `
    ${topbar("快速記憶 · Unit " + unit, "#/unit/" + unit)}
    <div class="pad flashpad">
      <p class="flash-i">${i + 1} / ${words.length}</p>
      <div class="flashwrap">
        <button class="card flashcard3d ${back ? "flipped" : ""}" id="flashCard" onclick="flipCard()"
          aria-label="${back ? "卡片背面，點擊翻回正面" : "點擊翻面看釋義"}">
          <span class="face front">${front}</span>
          <span class="face back">${backFace}</span>
        </button>
      </div>
      <div class="rowbtns center">
        ${speakBtn(w.headword, "big")}
        <button class="iconbtn big" onclick="flashDelete()" aria-label="刪除">${ICONS.trash}</button>
      </div>
      <div class="rowbtns">
        <button class="btn ghost" ${i === 0 ? "disabled" : ""} onclick="flash.i--;flash.back=false;drawFlash()">上一張</button>
        ${i < words.length - 1
          ? `<button class="btn" onclick="flash.i++;flash.back=false;drawFlash()">下一張</button>`
          : `<button class="btn" onclick="flashFinish()">完成瀏覽</button>`}
      </div>
    </div>`;

  // 左右滑動換卡（與單元分頁器一致的手勢語彙）
  attachSwipe(document.getElementById("flashCard"),
    i > 0 ? () => { flash.i--; flash.back = false; drawFlash(); } : null,
    i < words.length - 1 ? () => { flash.i++; flash.back = false; drawFlash(); } : null);

  // 顯示新卡片時自動發音一次（設定可關；unlock 已在進入流程的手勢中完成）
  if (Store.meta().autoSpeak !== false && flash.lastSpoken !== w.id) {
    flash.lastSpoken = w.id;
    Speech.speak(w.headword);
  }
}

/* 翻面只切 class，讓 3D 轉場接手；不重繪整頁 */
function flipCard() {
  flash.back = !flash.back;
  const el = document.getElementById("flashCard");
  el.classList.toggle("flipped", flash.back);
  el.setAttribute("aria-label", flash.back ? "卡片背面，點擊翻回正面" : "點擊翻面看釋義");
}

function flashDelete() {
  const w = flash.words[flash.i];
  showConfirm(`刪除「${w.headword}」？`, "刪除", () => {
    Store.updateWord(w.id, { deleted: "unit" });
    flash.words = flash.words.filter(x => x.id !== w.id);
    if (flash.i >= flash.words.length) flash.i = Math.max(0, flash.words.length - 1);
    flash.back = false;
    drawFlash();
  }, true);
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

/* ── 測驗選擇（ui-design-spec §6.4）：單一 pill 組 + 單選/複選切換 ── */
let multiSel = new Set();
let quizPick = "single";

async function renderQuizSetup() {
  const all = await Content.loadAll();
  const starred = all.filter(w => { const p = Store.wordP(w.id); return p.deleted !== "unit" && p.starred; });
  const wrong = all.filter(w => { const p = Store.wordP(w.id); return !p.deleted && Store.isWrongOften(p); });

  const unitChips = Array.from({ length: CONFIG.UNITS }, (_, i) => i + 1).map(n =>
    quizPick === "single"
      ? `<button class="chipbtn" onclick='Speech.unlock();startQuiz({kind:"unit",unit:${n}})'>U${n}</button>`
      : `<button class="chipbtn ${multiSel.has(n) ? "sel" : ""}" onclick="toggleMulti(${n})">U${n}</button>`
  ).join("");

  const wrongRows = wrong.slice(0, 60).map(w =>
    `<div class="wordrow slim"><div><b>${esc(w.headword)}</b><span class="zh">${esc(shortDef(w))}</span></div>
     <button class="del" onclick="event.stopPropagation();removeFromWrong('${w.id}')">移除</button></div>`).join("");

  $main().innerHTML = `
    ${topbar("測驗")}
    <div class="pad">
      <div class="section">
        <h2>單元卷</h2>
        <div class="segtoggle" role="group" aria-label="出題方式">
          <button class="${quizPick === "single" ? "on" : ""}" onclick="setQuizPick('single')">單選</button>
          <button class="${quizPick === "multi" ? "on" : ""}" onclick="setQuizPick('multi')">複選</button>
        </div>
        <div class="chiprow">${unitChips}</div>
        ${quizPick === "multi"
          ? `<button class="btn" ${multiSel.size ? "" : "disabled"} onclick="Speech.unlock();startMultiQuiz()">開始（${multiSel.size} 個單元）</button>`
          : `<p class="muted">點選單元即開始出題（已刪除的字不出現）。</p>`}
      </div>
      <div class="section">
        <h2>收藏單字<span class="cnt">${starred.length}</span></h2>
        <button class="btn ghost" ${starred.length >= CONFIG.QUIZ_OPTIONS ? "" : "disabled"} onclick='Speech.unlock();startQuiz({kind:"star"})'>開始</button>
        ${starred.length < CONFIG.QUIZ_OPTIONS ? `<p class="muted">至少收藏 ${CONFIG.QUIZ_OPTIONS} 個字才能出題。</p>` : ""}
      </div>
      <div class="section">
        <h2>常錯單字<span class="cnt">${wrong.length}</span></h2>
        <p class="muted">答錯 ${CONFIG.WRONG_MIN_INCORRECT} 次以上且正確率低於 ${CONFIG.WRONG_ACC * 100}% 的字。</p>
        <button class="btn ghost" ${wrong.length >= CONFIG.QUIZ_OPTIONS ? "" : "disabled"} onclick='Speech.unlock();startQuiz({kind:"wrong"})'>開始</button>
        ${wrongRows ? `<div class="list mt">${wrongRows}</div>` : ""}
      </div>
    </div>`;
}

function setQuizPick(m) { quizPick = m; renderQuizSetup(); }
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
    // 與 Scheduler 的弱字條件一致：wrongList 不影響每日複習
    list = words.filter(w => { const p = Store.wordP(w.id); return p.deleted !== "unit" && Store.isWeak(p); });
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

  if (list.length === 0) { showAlert("沒有可出題的字。"); return; }
  quiz = {
    title, list: shuffle([...list]), pool: all, i: 0, correct: 0, wrongIds: [],
    task: opt.task ? { kind: opt.task, unit: opt.unit } : (opt.kind === "review" ? { kind: "review", unit: opt.unit } : null),
    answered: false,
  };
  // hash 沒變時 hashchange 不會觸發才需要手動 route()；變了就交給事件，避免連續渲染兩次
  if (location.hash === "#/quiz-run") route();
  else nav("#/quiz-run");
}

async function renderQuizRun() {
  if (!quiz) { nav("#/quiz"); return; }
  const { list, i } = quiz;

  if (i >= list.length) { renderQuizDone(); return; }
  const w = list[i];

  // 干擾項：同單元優先，不足再從全池補（企劃 §6）；
  // 以顯示文字去重，避免同義字撞出兩顆一模一樣的選項（只有一顆算對）
  const usedText = new Set([shortDef(w)]);
  const distractors = [];
  const sameUnit = shuffle(quiz.pool.filter(x => x.unit === w.unit && x.id !== w.id));
  const others = shuffle(quiz.pool.filter(x => x.unit !== w.unit && x.id !== w.id));
  for (const cand of [...sameUnit, ...others]) {
    if (distractors.length >= CONFIG.QUIZ_OPTIONS - 1) break;
    const t = shortDef(cand);
    if (usedText.has(t)) continue;
    usedText.add(t);
    distractors.push(cand);
  }
  const opts = shuffle([w, ...distractors]);

  $main().innerHTML = `
    ${topbar(quiz.title, "#/quiz")}
    <div class="pad">
      <p class="flash-i">${i + 1} / ${list.length}　得分 ${quiz.correct}</p>
      <div class="card quizhead">
        <div class="w-head">
          <span class="headword">${esc(w.headword)}</span>
          ${speakBtn(w.headword, "speak40")}
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
  if (ok) {
    // 答對不打斷節奏：短暫顯示回饋後自動進下一題；答錯才停下來看正確答案
    document.getElementById("quiznext").innerHTML = `<span class="fb ok">答對！</span>`;
    const qi = quiz.i;
    setTimeout(() => {
      if (quiz && quiz.answered && quiz.i === qi && location.hash === "#/quiz-run") {
        quiz.i++; quiz.answered = false; route();
      }
    }, 600);
  } else {
    document.getElementById("quiznext").innerHTML =
      `<span class="fb no">答錯，正確答案已標示</span>
       <button class="btn" onclick="quiz.i++;quiz.answered=false;route()">${quiz.i + 1 >= quiz.list.length ? "看結果" : "下一題"}</button>`;
    document.querySelector("#quiznext .btn").focus();
  }
}

async function renderQuizDone() {
  const { list, correct, wrongIds, task, title } = quiz;
  if (task) Scheduler.completeUnit(task.unit);

  let wrongRows = "";
  for (const id of wrongIds) {
    const w = await Content.getWord(id);
    if (w) wrongRows += `<button class="wordrow slim" onclick="nav('#/word/${id}')">
      <div><b>${esc(w.headword)}</b><span class="zh">${esc(shortDef(w))}</span></div><span>›</span></button>`;
  }
  const pct = Math.round(correct / list.length * 100);
  $main().innerHTML = `
    ${topbar("測驗結果")}
    <div class="pad">
      <div class="center-sect">
        <p class="scorehero">${correct}<small>/${list.length}</small></p>
        <p class="muted">${title}，正確率 ${pct}%${task ? "，今日進度已更新" : ""}</p>
        <div class="rowbtns center">
          <button class="btn" onclick="quiz=null;nav('#/home')">回今日任務</button>
          <button class="btn ghost" onclick="quiz=null;nav('#/quiz')">再出一卷</button>
        </div>
      </div>
      ${wrongRows ? `<p class="secttl">答錯的字</p><div class="list">${wrongRows}</div>` : ""}
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
        <div class="list mt">${rows}</div>`
        : `<div class="notice">沒有被刪除的單字。</div>`}
    </div>`;
}
function restoreAll() {
  Store.restoreUnitDeleted(); // 批次一次寫入，避免逐字全量序列化
  route();
}

/* ── 設定 ─────────────────────────────── */
const APP_VERSION = (document.querySelector('meta[name="app-version"]') || {}).content || "dev";

function renderSettings() {
  $main().innerHTML = `
    ${topbar("設定")}
    <div class="pad">
      <div class="section">
        <h2>版本與更新</h2>
        <p class="muted">目前版本 ${esc(APP_VERSION)}。iOS 主畫面 App 沒有重新整理手勢，
        覺得內容不對或想立即拿新版時，用這顆按鈕手動更新。</p>
        <button class="btn" id="checkUpdateBtn">檢查並更新到最新版</button>
        <p class="muted" id="updMsg" role="status"></p>
      </div>
      <div class="section">
        <h2>恢復已刪除的單字</h2>
        <button class="btn ghost" onclick="nav('#/restore')">前往恢復頁</button>
      </div>
      <div class="section">
        <h2>備份與還原</h2>
        <p class="muted">進度只存在這台裝置的瀏覽器裡。Safari 可能在儲存空間不足或長期未使用時清除資料，請定期備份。</p>
        <div class="rowbtns">
          <button class="btn" onclick="doExport()">匯出備份檔</button>
          <button class="btn ghost" onclick="showExportText()">顯示備份文字</button>
        </div>
        <textarea id="exportArea" class="ta" hidden readonly></textarea>
        <p class="muted mt">還原：貼上備份內容後按匯入（會覆蓋現有進度）。</p>
        <textarea id="importArea" class="ta" placeholder='{"progress":…}'
          autocapitalize="off" autocomplete="off" spellcheck="false"></textarea>
        <button class="btn ghost" onclick="doImport()">匯入並覆蓋</button>
        <p id="ioMsg" class="muted" role="status"></p>
      </div>
      <div class="section">
        <h2>發音</h2>
        <p class="muted">${Speech.supported ? "使用系統語音（en-US）。" : "注意：此瀏覽器不支援語音合成。"}</p>
        <label class="switchrow">
          <input type="checkbox" id="autoSpeak" ${Store.meta().autoSpeak !== false ? "checked" : ""}>
          快速記憶顯示新卡片時自動發音
        </label>
        <button class="btn ghost" ${Speech.supported ? "" : "disabled"}
          onclick="Speech.unlock();Speech.speak('This is a pronunciation test. Concrete. Vacation. Client.')">播放測試句</button>
      </div>
      <div class="section about">
        <h2>關於</h2>
        <p class="muted">TOEIC 單字學習 — 1250 字（TSL 1.2 全量，依多益語料詞頻分 32 單元）。</p>
        <p class="muted">資料來源：TOEIC Service List 1.2（Browne, Culligan &amp; Phillips, CC BY）·
        ECDICT（中文釋義/音標/變形）· CMUdict（音標補位）· Princeton WordNet（英英/同反義）·
        Tatoeba（例句，CC BY 2.0 FR）· OpenCC（簡轉繁）。</p>
      </div>
    </div>`;
  document.getElementById("autoSpeak").addEventListener("change", e => {
    Store.updateMeta({ autoSpeak: e.target.checked });
  });
  document.getElementById("checkUpdateBtn").addEventListener("click", checkUpdate);
}

/* 手動更新：?live=1 直通網路查線上版號（ios-pwa-rules §13），
   有新版就讓 SW 重新安裝預快取，接管後自動重新載入 */
async function checkUpdate() {
  const btn = document.getElementById("checkUpdateBtn");
  const msg = document.getElementById("updMsg");
  btn.disabled = true;
  msg.textContent = "檢查中…";
  try {
    const res = await fetch("index.html?live=1", { cache: "no-store" });
    const m = (await res.text()).match(/name="app-version" content="([^"]+)"/);
    const latest = m && m[1];
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) await reg.update(); // 觸發新 SW 下載與預快取（新版會 skipWaiting 接管）
    if (latest && latest !== APP_VERSION) {
      msg.textContent = `發現新版本 ${latest}，下載中，完成後會自動重新載入…`;
      if (reg && navigator.serviceWorker.controller) {
        navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
        setTimeout(() => location.reload(), 8000); // 保險絲：逾時直接重載
      } else {
        setTimeout(() => location.reload(), 1500);
      }
    } else {
      msg.textContent = `已是最新版本（${APP_VERSION}）。剛發佈的新版可能要等幾分鐘 CDN 更新。`;
      btn.disabled = false;
    }
  } catch (e) {
    msg.textContent = "無法連上網路，請稍後再試。";
    btn.disabled = false;
  }
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
  const text = document.getElementById("importArea").value;
  if (!text.trim()) { msg.textContent = "請先貼上備份內容。"; return; }
  showConfirm("匯入會覆蓋現有進度。", "匯入並覆蓋", () => {
    try {
      Store.importJson(text);
      msg.textContent = "匯入完成。";
    } catch (e) { msg.textContent = "匯入失敗：" + e.message; }
  }, true);
}

/* ── 啟動 ─────────────────────────────── */
Store.updateMeta({ lastOpenDate: Dates.today() });
route();

/* SW 註冊 + 新版本提示列（ios-pwa-rules §13）：
   偵測到新 worker 裝好且目前頁面由舊版控制時，顯示更新列讓使用者重新載入 */
function showUpdateBar() {
  if (document.getElementById("updateBar")) return;
  const bar = document.createElement("div");
  bar.id = "updateBar";
  bar.className = "updatebar";
  bar.innerHTML = `<span>已下載新版本</span><button class="btn small" onclick="location.reload()">重新載入</button>`;
  document.body.appendChild(bar);
}
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").then(reg => {
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener("statechange", () => {
        if (w.state === "installed" && navigator.serviceWorker.controller) showUpdateBar();
      });
    });
  }).catch(() => {});
}
