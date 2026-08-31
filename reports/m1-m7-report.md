# M1–M7 報告 — 應用程式本體

（一次開發階段完成 M1–M7，驗收證據集中在本檔與 e2e 測試輸出）

## M1 單元列表 + 單字詳情 + 發音 — 完成
- 單元列表：已學/40 進度條 + stage 圓點；單元字表 → 單字詳情
- 詳情頁全部欄位條件渲染（null 即隱藏）：IPA/詞性/釋義/變形/例句/同反義/英英/note
- 發音：Web Speech API en-US；iOS 解鎖：所有「開始」類按鈕 handler 先跑
  `Speech.unlock()`（播空白 utterance）；設定頁有發音測試鈕
- headless Chrome 390×844 截圖驗證渲染正常

## M2 測驗（單元卷）+ 計數 + localStorage — 完成
- 選擇題：同單元隨機抽 3 個釋義當干擾項，不足才從全池補；即時對錯回饋
- 答對/答錯計數、Leitner box 更新；重整瀏覽器後保留（e2e 驗證匯出含三把 key）
- **備份/還原（§9 風險對策）提前在此完成**：設定頁可匯出檔案/文字、貼上匯入

## M3 多單元 / 收藏 / 常錯測驗 — 完成
- 四種模式共用同一抽題函式 `startQuiz(opt)` 與同一渲染器
- 常錯定義走 config：`incorrect>=2 && acc<0.6`

## M4 刪除 + 恢復 — 完成
- 詳情頁/快速記憶刪除 → `deleted:"unit"`；常錯清單「移除」→ `deleted:"wrongList"`
- 恢復頁只列 `deleted=="unit"`（wrongList 純查詢條件差異，無特殊邏輯）；可逐字或全部恢復

## M5 快速記憶 — 完成
- 直接複用 unit JSON 的 word 物件（零新增資料欄位）：正面字+IPA+詞性、背面釋義+例句
- 可發音、可刪除；新單元任務流程 = 快速記憶 → 完成瀏覽 → 自動接單字卷

## M6 記憶曲線 + 今日任務 — 完成
- `Scheduler.buildTodayTasks()` 為 §5 虛擬碼直譯；間隔表/上限全在 config.js
- Node 邏輯測試 27/27 PASS：間隔推進（1/2/4/7/15/30）、畢業、同日不重複推進、
  每日新單元限 1、防雪崩（160 弱字 → 延最新到期單元、留 120、stage 不變）、
  刪除語意、匯出入 roundtrip
- 驗證方式：測試中 mock 今日日期；真機改系統日期同樣可驗證

## M7 PWA + 部署 — 完成
- manifest（standalone、繁中）、apple-touch-icon、192/512 icon（Pillow 生成）
- service worker 預快取殼 + 10 份單元 JSON，cache-first，離線完全可用；
  改版時 bump `sw.js` 的 VERSION 即可清舊快取
- 部署：GitHub Pages（gh-pages 分支 = app/ 內容）

## 端對端測試（puppeteer + headless Chrome）
19/19 PASS：新單元任務完整流程（快速記憶 40 字 → 單字卷 40 題 → 得分 20/40 →
stage=1、nextDue=明天 → 首頁不再派新單元）、詳情/收藏/刪除/恢復、常錯計數、
匯出格式、零 console 錯誤。

## 偏離規格之處
- 同一單元同一天完成兩次測驗只推進一次 stage（規格未定義；防止重複刷 stage）
- 單元「複習完成」的定義 = 完成該單元弱字測驗（弱字為 0 時首頁提供「標記完成」）
- `meta.newUnitPerDay` 欄位保留但 v1 固定為 1（未做 UI，規格未要求）

## 未決問題
- Web Speech 音質需真機聽 20 字後判斷（§9），iPhone 上請實測；不行再走批次 TTS
- iOS 真機的 PWA 安裝/離線驗收需實機執行（模擬環境無法代測）
