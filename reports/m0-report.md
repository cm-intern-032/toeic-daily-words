# M0 報告 — 資料管線 + coverage report

## 完成項目
- `pipeline/build.py`：TSL 1.2 × ECDICT × WordNet × Tatoeba → `app/data/units/unit-01..10.json`（400 字）
- `reports/m0-coverage-report.txt`：全部欄位過門檻
  - 中文釋義 100%、IPA 98.2%、變形（名/動）94.4%、英英 99.0%、同/反義 79.5%、例句含中譯 77.8%
- ECDICT 品質抽檢 50 字：0 筆不可讀（門檻 10 筆），不需改 AI 生成

## 偏離規格之處（含理由）
1. **字表來源改為 TSL 1.2 直取前 400**（原建議選項 2）：實查 ECDICT **沒有 toeic 標記**
   （只有 toefl/ielts/gre 等）。TSL 1.2 是 Browne & Culligan 官方 TOEIC 語料字表，
   本身就依多益詞頻排序，等同原選項 1 的核心，且是單一來源、join 更少。
2. **不使用 Kaikki/Wiktionary**：ECDICT 的 `phonetic`、`exchange` 欄位已涵蓋 IPA 與變形
   且過門檻。少一個 2GB 級資料源，同時**避開 CC BY-SA 的授權感染**——字庫現在只含
   CC BY / WordNet / ECDICT 資料，公開發佈不強制 CC BY-SA。
3. `forms` 多了一個 `pp`（過去分詞）欄位：§3 管線清單有列、§4 schema 範例漏了，取聯集。
4. TSL 原檔為 cp1252 編碼、含重音字（résumé），已折疊為 ASCII 再對 ECDICT。

## 未決問題
- ECDICT 釋義帶領域標籤（[計]/[經]/[醫]），目前保留（可讀且有資訊量）；若嫌雜訊可在
  build.py 一行過濾。
- 例句缺中譯的 89 字目前 examples 為空陣列，UI 隱藏例句區塊（規格允許）。
