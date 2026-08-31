# 審查修復報告（第一輪 code review 後）

8 個角度的自動審查共確認 12 項問題，已全數處置。邏輯測試擴充至 32 項、e2e 19 項，全數通過。

## 修復（correctness）
| 問題 | 處置 |
|---|---|
| sw.js VERSION 未隨改版遞增，已安裝 PWA 永遠吃舊快取 | bump 至 v1.1.0；README 部署流程本就要求，這次真的照做 |
| 常錯清單「移除」讓字從每日複習永久消失且無法恢復 | **語意修正**：`deleted:"wrongList"` 現在只影響常錯清單（§6「查詢條件差異」的本意）；每日弱字/複習卷/已掌握統計改用 `deleted !== "unit"` |
| startQuiz 使 route() 連跑兩次、第一題選項重洗 | 先檢查 hash 再決定手動 route() 或交給 hashchange |
| 測驗可能出現兩個相同釋義選項（只有一個算對） | 干擾項以顯示文字去重，同單元優先、不足從全池補 |
| 畸形單字 id（#/word/foo）觸發 unit-NaN.json 抓取與假網路錯誤 | getWord 驗證 id 格式與單元範圍，直接回 null → 導回單元列表 |
| SW 離線時快取未命中拋未處理拒絕 | 加 catch：導航退回殼頁、其餘回 504 |
| 防雪崩會白白延後零弱字單元 | 只延「最新到期且弱字 > 0」的單元；最舊到期永遠保留 |
| INTERVALS[5]=30 永遠用不到（企劃 §5 自身 off-by-one） | **依規格保留行為**，config.js 加註說明；v2 想用 30 天把 GRADUATE_STAGE 改 7 |

## 修復（效能）
- `Store.wordP` 讀取不再把預設紀錄寫進 progress（避免 400 筆零紀錄持久化、每題全量重寫、備份膨脹）；寫入路徑改走 `ensureP`
- 全部恢復改 `Store.restoreUnitDeleted()` 批次一次寫入
- 單元列表與每日任務的單元載入改平行（冷載入 10 次往返 → 1 批）

## 重構（重複消除）
- 抽出 `exHtml` / `defsHtml` / `speakBtn`（發音鈕三處已有一處漏 unlock 的實際漂移）、`Dates` 內部共用 `fmt`、`TAB_OF` 常數上提、shortDef 去除重複運算
- 移除死代碼：`store:persist-failed` 事件（首頁直接讀 `Store.persistOk`）

## 記錄在案、未修
- build.py §5b 純英例句補位與雙語主路徑機制重複、只補零例句的字（有 1 句雙語例句的字不補滿 3 句）——v1 資料已達標，列 v2
- 測驗選項 inline onclick 內插值皆為程式生成 id，無 XSS 面；若未來 id 格式變動需重審
