# iOS PWA 平台行為守則（本專案適用摘錄）

> 摘自使用者提供的《iOS 網頁 App（PWA）平台行為規格書》（出處：daily-todo 專案 v1–v14 實測）。
> 動到任何輸入、滾動、觸控、鍵盤、standalone 相關的程式前，先讀本檔。

## 硬性規則
1. 所有可輸入欄位 `font-size ≥ 16px`（否則 iOS focus 時整頁放大且不縮回）
2. viewport meta 禁用 `maximum-scale` / `user-scalable=no`
3. 文件層鎖死：`html,body{height:100%;overflow:hidden}`、`body{position:fixed;inset:0}`；
   滾動全部發生在 `#main` 內層容器（`overflow-y:auto` + `overscroll-behavior-y:contain`）
4. 鍵盤高度只餵給滾動容器的 `padding-bottom`（`--kb-h`），面板幾何永不變 → `js/vp.js`
5. 禁止把 iOS 為輸入框做的位移「壓回去」（不做 `scrollTo(0,0)` 補償、不綁 `visualViewport.height` 當面板高）
6. `focus()` 必須發生在使用者手勢的同一個 task；不在開頁/開面板時自動 focus
7. 自製手勢元素 `touch-action:none`；一般按鈕 `manipulation`
8. 按鈕類 `-webkit-touch-callout:none` + `user-select:none`；**輸入框內絕不封鎖**長按選字/複製
9. 點擊目標 ≥ 44×44pt（視覺可小，用 `::after` 擴大熱區）
10. 可點的東西用真的 `<button>`（VoiceOver/鍵盤）
11. `interactive-widget=resizes-content` 與 `dvh` 在 iOS 解不了鍵盤問題，不得作為方案基礎
12. standalone 下不用 `confirm()`/`alert()`，用 App 內對話框（`showConfirm`/`showAlert`）
13. SW 更新：`?live=1` 直通網路；HTML 的 app-version meta 與 sw.js `VERSION` 同步遞增；
    偵測到新版顯示更新列讓使用者重新載入

## 已否決方案（別再試）
- 面板高度綁 `visualViewport.height`（iOS 事件慢一拍，動畫期間跳動）
- focus 後 `scrollTo(0,0)` 位移補償（輸入框被鍵盤蓋住、選字放大鏡失準）
- 開面板自動 `focus()`（鍵盤自彈、畫面被推）
- 動作寫在 `pointerup`（補發的 mousedown 收走焦點）

## 驗收清單（每次動到相關區域自檢）
- 點任何輸入框不觸發整頁放大；鍵盤不會自己跳出來
- 點底部欄位時欄位保持在鍵盤正上方；收鍵盤後畫面歸位無殘留偏移
- 欄位內長按可選字/複製/貼上
- 長按按鈕不跳系統選單；所有點擊目標 ≥ 44×44
- `document.scrollingElement.scrollHeight <= clientHeight`（文件層不滾動）
- 發版後能收到更新提示並拿到一致的新版本
