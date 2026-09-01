# Design System: 多益日課（TOEIC Daily Words）

依 stitch-skills `taste-design` 方法論產出；本檔為 app 視覺的唯一準則（single source of truth）。
任何介面改動先對照本檔，再動 `app/css/style.css`。

## 1. Visual Theme & Atmosphere
書桌上的單字卡：冷調紙面、墨水藍字、一支螢光筆。日常工具的平衡密度
（Density 5「Daily App Balanced」）、行動裝置單欄為主的克制版面（Variance 3）、
流暢但收斂的 CSS 動態（Motion 4「Fluid CSS」）——像一本排版講究的練習簿，
不像行銷頁。每天要打開的東西，安靜比炫技重要。

## 2. Color Palette & Roles
- **Cool Paper**（#EFF1F6）— 主背景，冷調紙灰
- **Pure Surface**（#FFFFFF）— 卡片與容器
- **Navy Ink**（#1D2440）— 主文字與主按鈕；非純黑（#000000 禁用）
- **Muted Slate**（#5B6380）— 次要文字、說明
- **Whisper Border**（#DCE0EB）— 1px 結構線、卡片邊框
- **Marker Amber**（#DFAF52）— 唯一強調色：進度、收藏、focus ring、highlight。
  飽和度約 69%（規則上限 80%）；禁止紫色/霓虹光暈
- 語意色（good/bad）僅用於測驗對錯回饋，不作裝飾
- 深色主題為同一套角色的重新配光（#101527 底），非機械反轉

## 3. Typography Rules
- **Display / 英文單字：** Outfit（600/700）— 幾何無襯線，字距收緊（-0.01em），
  以字重與顏色建立層級，不靠爆大字級
- **Body：** Outfit（拉丁）+ Noto Sans TC / PingFang TC（中文系統字）— 行高寬鬆
- **Mono：** JetBrains Mono — 數字（統計、計分、進度 n/N）、IPA 音標、日期
- **禁用：** Inter；軟體 UI 一律禁襯線（前版 Fraunces 因此退場）；純系統預設不加調校

## 4. Component Stylings
- **Buttons：** 平面填色、無外光暈。按下時 translateY(1px) 的觸覺回饋；
  主按鈕 Navy Ink 填色、次要按鈕 ghost 邊框
- **Cards：** 16px 圓角、染墨藍色調的柔和陰影（非灰黑）；只在需要層級時使用，
  列表內改用分隔線
- **Inputs：** 標籤在上、錯誤訊息在下；focus ring 用 Marker Amber
- **Empty states：** 有標題與下一步指引的組合文案，不是一句「沒有資料」
- **Loading：** 內容由 SW 預快取、即時載入，不設 spinner；載入失敗顯示行內錯誤與重試指引

## 5. Layout Principles
- 多視圖架構：hash 路由分畫面 + 底部分頁列；功能不擠在同一頁（使用者全域規則）
- 行動優先：< 768px 一律單欄；無橫向捲動；觸控目標 ≥ 44px
- 內容以 max-width（640px）置中含納；CSS Grid / gap 排版，不用 calc() 百分比疊算
- 元素不重疊，各佔明確空間

## 6. Motion & Interaction
- 進場：卡片列表以 cascade 交錯浮現（每張延遲 40ms，transform+opacity，260ms）
- 按鈕：hover 輕浮起、active 下壓 1px；曲線 cubic-bezier(.2,.7,.3,1)，不用線性
- 只動 transform 與 opacity；`prefers-reduced-motion` 時全部停用
- 不做永續循環動畫——每日學習工具以安靜為上（Motion 4 的在地判斷）

## 7. Anti-Patterns（Banned）
- emoji（全域規則；圖示一律 inline SVG——Feather icons）
- Inter 字型；軟體 UI 中的襯線字型
- 純黑 #000000；霓虹/外發光陰影；紫藍漸層；飽和度 > 80% 的強調色
- 超過一個強調色；warm/cool 灰混用
- 行銷式三等寬卡片列（資料統計磁貼不在此限）
- AI 文案腔（「無縫」「賦能」「次世代」）；捏造數據；假人名
- 「滑動探索」等填充文案與跳動箭頭
