# 多益日課 — TOEIC 400 單字學習 App（v1）

純前端靜態 PWA：iPhone Safari 加到主畫面即可離線使用，無後端、無帳號。
400 個 TOEIC 核心單字（TSL 1.2 前 400，依多益語料詞頻排序），10 單元 × 40 字。

**線上版：https://cm-intern-032.github.io/toeic-daily-words/**

部署更新流程：改 `app/` → 調整 `sw.js` 的 `VERSION` → commit →
`git subtree split --prefix app -b gh-pages && git push -f origin gh-pages`

## 結構

```
app/          網站本體（部署這個資料夾）
  data/units/ unit-01..10.json（內容資料，可整批替換）
  js/config.js  所有演算法門檻集中於此
  js/store.js   內容載入 + localStorage 進度層（UI 不直接碰 localStorage）
  js/app.js     路由與畫面
  sw.js         service worker（預快取全部資源，離線可用）
pipeline/     M0 資料管線（Python）與邏輯測試
reports/      各里程碑報告與 coverage report
```

## 核心機制

- **單元級記憶曲線**：完成首學 stage=1，之後每次複習 stage+1，
  間隔 `[1,2,4,7,15,30]` 天，stage 6 畢業（`config.js`）。
- **字級 Leitner**：答對 box+1（上限 5）、答錯歸 0。
  弱字（box<3 或正確率<70%）才進每日複習；每日弱字上限 120，超過順延單元。
- **進度與內容徹底分離**：進度只在 localStorage（可匯出/匯入 JSON），
  換內容資料不動任何程式。

## 開發

```bash
cd app && python3 -m http.server 8734   # 本地跑
node pipeline/logic-test.js             # 排程/進度邏輯測試
cd pipeline && .venv/bin/python build.py  # 重建資料（需 raw/ 資料源）
```

## 資料來源與授權

- 字表：[TOEIC Service List 1.2](https://www.newgeneralservicelist.com/toeic-service-list)（Browne, Culligan & Phillips，CC BY）
- 中文釋義／音標／變形：[ECDICT](https://github.com/skywind3000/ECDICT)（簡轉繁：OpenCC s2twp）
- 英英釋義／同反義：Princeton WordNet（WordNet License）
- 例句與中譯：[Tatoeba](https://tatoeba.org)（CC BY 2.0 FR）

程式碼以 MIT 授權釋出。
