# Mycopunk 簡明攻略 Wiki

以裝備介紹、效果與取得條件為主的簡明攻略 Wiki；英文為主、繁體中文輔助。收集 checklist 是獨立輔助工具。採純靜態 HTML／CSS／ES modules，不需前端套件、帳號或資料庫。

線上網站：[Mycopunk Field Guide](https://promise82114.github.io/mycopunk-checklist/)

## GitHub Pages 部署

推送至 `main` 後，`.github/workflows/pages.yml` 會檢查 JavaScript、圖鑑與推薦資料，確認三個匯入器可以重現提交內容，再發布 `prototype/`。也可在 GitHub Actions 手動執行 `Deploy GitHub Pages`。

Pages 的發布來源使用 **GitHub Actions**。網站發布內容僅包含 `prototype/`，Excel、翻譯來源與匯入腳本留在 repo 供重建，不會放入網站部署包。

發布前可執行 `npm run check`。本機與線上網站的瀏覽器儲存空間各自獨立，需要移轉收集紀錄時，請先匯出備份，再至線上網站匯入。

## 本機啟動

需要 Node.js 18 以上。在 repo 根目錄執行：

```powershell
node scripts/serve.mjs
```

開啟 [本機網站](http://127.0.0.1:18423/)。也可執行 `npm start`。請透過 HTTP 伺服器使用，不要直接雙擊 HTML；以 `Ctrl+C` 停止伺服器。

如連接埠被占用，可在 PowerShell 指定另一個：

```powershell
$env:PORT = '18425'
node scripts/serve.mjs
```

網站內容位於 `prototype/`，可由一般靜態 HTTP 伺服器供應；所有資源均在本機，沒有外部字型、翻譯 API 或追蹤服務。

## 攻略介面

- 首頁四分類卡片：5 位角色、13 把武器、5 種投擲物、4 把重武器，共 27 件 Wiki 裝備。
- 每件裝備先呈現雙語簡介、特色／技能、已知取得方式、基礎數值及其個別等級獎勵，再列升級資料。Wiki 未列出的取得條件明示待查；新版裝備缺少工作簿升級時保留介紹，不補造升級。
- 660 筆工作簿升級的品質、英文／繁中效果、已收錄的 Turbocharge、全部數值與格形直接展開，不再有配件詳情視窗或筆記編輯。
- 品質、效果、裝備、中英關鍵字搜尋；同一頁直接閱覽全部符合資料，不需要逐筆點開或分批載入。
- 格形由 JSON 的六角格 axial 座標繪製，605 種形狀對應 658 筆升級。未收錄的 2 筆不猜圖；格數與原表不同時並列來源版本與兩者格數。
- Hidden paths／隱藏解鎖專頁區分隱藏路徑、Pattern Infusion 與裝備等級獎勵。七條 Hidden Paths 直接顯示六角格路徑圖、必填格位、品質限制及資料列獎勵，並分開標示 PC v2.0.2 與舊版影片的適用版本。
- Checklist／收集清單是獨立頁面；裝備資料列旁僅放小型收集勾選。沿用原有穩定 ID、儲存鍵、追蹤與備份格式，舊筆記保留於資料與匯出檔，不再顯示編輯欄位。
- 亮色底、四分類淡色卡片、窄螢幕直向資料列；桌面保留欄名和分類導覽。
- Tier guides／分級搭配保留兩榜對照、364 筆配件分級及 20 條雙語搭配方向。配件連結會導向完整攻略資料列，不開啟對話框。

棋盤配裝模擬尚未加入。`prototype/patterns.js` 已共用座標繪圖、60 度旋轉與格子重疊判斷，可供後續模擬使用；目前不宣稱任何搭配一定裝得下。

## Wiki、格形與解鎖來源

主要來源：[Mycopunk Wiki](https://mycopunk.miraheze.org/wiki/Main_Page)，核對日期 **2026-10-23**。每筆介紹保存個別永久修訂連結；Wiki 文字經改寫與繁中翻譯，依 **CC BY-SA 4.0** 提供，網站頁尾與來源說明保留貢獻者署名與授權。

- `research/wiki-equipment.json`：27 件雙語裝備介紹與來源；`wiki-equipment-snapshot.json` 保存已讀修訂摘錄。工作簿的 Shock／Acid Grenade 分別沿用原 ID 對應 Wiki 的 Voltaic／Caustic Grenade。
- `research/wiki-unlocks.json`：Wiki 機制、Hidden Paths 資料匯出及玩家補充分開標示，不混同配件相鄰增幅。
- `research/wiki-shapes.json`：格形座標、上傳註解中的版本、來源 URL 與雜湊。用原始圖形的彩色六角格抽取座標，忽略灰色背景面板；**不從占格數推算圖形**。
- 初次匯入經使用者明確授權後，445 份公開 SVG 各讀取一次，僅在記憶體中解析。426 個最新來源可解析；19 份舊候選格式不符，沒有猜測或重試。**不保存、不部署、不使用來源 SVG 貼圖**。
- 605 種形狀有 76 種格數與 Excel 不同。Wiki 圖形版本為 v1.8、v2.0、v1.8.1H1、v1.10.2；原工作簿 v1.6 是資料表版本，不能以格數相同推定跨版相容。網站明示各自來源。
- 裝備介紹未註明適用遊戲版本，不從編輯日期猜版本。未經正式版實機驗證。

### Hidden Paths（2026-10-24 核對）

七條路徑取自 [Vilsol 的公開遊戲資料匯出（固定修訂）](https://github.com/Vilsol/mycopunk-data/blob/a63cb1a6064030f77fc602e6d00b83dd967208aa/data/v2.0.2/data.json.gz)，適用 **PC v2.0.2、Build 26120128**，匯出時間 2026-10-22T21:03:57Z。匯出檔只在記憶體讀取與驗證雜湊，研究快照 `research/hidden-paths-current.json` 僅保存七條路徑與來源證據；不保存來源圖片或完整遊戲匯出。

| 路徑 | 目標格數 | 可用品質 | 資料列獎勵 |
| --- | ---: | --- | --- |
| Path 0 | 7 | 不限 | 1 Epic 升級 |
| Path 1 | 22 | 不限 | 1 Exotic 升級 |
| Path 2 | 7 | Rare | 1 Rare 升級 |
| Path 3 | 9 | Epic | 1 Epic 升級 |
| Path 4 | 9 | 不限 | 1 Rare 升級 |
| Path 5 | 10 | 不限 | 1 Rare 升級 |
| Path 6 | 10 | Standard 或 Rare | 1 Rare 升級 |

`prototype/hidden-paths.js` 以 JSON 座標產生六角格，不使用貼圖。依[來源產圖器的格位定義](https://github.com/Vilsol/mycopunk-wiki-generator/blob/9e797d160237883abc994ee7957a3b9988333940/scripts/shared/upgrades/svg-generator.ts#L88)保留 odd-q 欄位交錯、原始方向與灰色參考格；`q = column`、`r = row - floor(column / 2)`，不正規化原點。A1 是圖內的相對索引，不能當成遊戲面板的固定插槽。

[SlideDrum 原始影片](https://www.youtube.com/watch?v=2azMQacNAzA&t=80s)明示適用 **1.0.3（2025-07-14）**；影片章節與舊版排錯線索保存在 `research/hidden-path-evidence.json`。覆蓋額外灰格、跨裝備共用領取進度及一次性獎勵為社群作者說明，尚未由本站實測。新版是否接受任意平移、旋轉或鏡射，亦不能僅由匯出資料確認。獎勵只列品質，未指定配件名稱；原始 `Chance` 欄位不當成玩家掉落機率解讀。

離線重建網站攻略資料：

```powershell
python scripts/import_wiki.py
```

`research/collect-wiki-shapes.py` 預設只從已保存的 API 與座標 JSON 快照離線重建研究資料；`--refresh-missing-index` 以精確檔名補查未收錄名稱，`--fetch-missing-coordinates` 只讀未嘗試的新來源。兩者才會連外，每份一次、最多 4 個並行；不重抓原有 445 份。原 `--fetch-coordinates` 是重讀模式，一般修補不使用。一般開站、檢查及 CI 都不執行連外抓取。網站只帶必要的介紹、機制與座標 JSON，約 585 KB，不包含研究索引或圖檔。

## 第二階段：推薦來源與版本

核對日期為 **2026-10-23**，來源共 14 份榜單，收錄 23 筆武器評級與 364 筆配件評級：

- [Carson Kong — Myco TL 1.4.6](https://tiermaker.com/list/random/mycopunk-weapon-tier-list-18711617/5588347)：標題明示遊戲版本 **1.4.6**，11 把武器，沒有 Accelerator 的分級。
- [No You — Weapons](https://tiermaker.com/list/random/mycopunk-gun-tierlist-18796434/5653581)：來源未註明遊戲版本。對應現有 12 把武器，另有 4 個現有工作簿未收錄的重武器圖示，保留於來源快照但不推測其圖鑑內容。
- [No You 的個人頁與配件榜](https://tiermaker.com/user/18796434)：12 把武器各有配件榜，均未註明遊戲版本。每把武器的推薦頁都連到對應原榜。

**工作簿 v1.6 是資料表版本，不能當作上述榜單適用的遊戲版本。** 未確認榜單適用目前正式版；作者沒有提供逐項推薦理由、隊伍／難度或測試情境。未被榜單列入的配件不自動給予低分。

社群分級忠實保留來源；「搭配方向」則是本站根據工作簿效果整理的編輯推論，不冒稱作者推薦了整組配件，也未經遊戲內實測。每條方向說明觸發條件、自傷或其他代價；原表不完整的效果不補寫成確定機制。來源稀有度與社群分級分開顯示。

`research/tiermaker-snapshot.json` 保存原榜的分級列、圖示網址與項目 ID，透過頁面實際顯示的圖示檔名對應圖鑑；沒有下載 TierMaker 圖片。`research/editorial-guides.json` 保存雙語搭配說明。網站使用的衍生資料為 `prototype/data/recommendations.json`，可離線重建：

```powershell
python scripts/import_recommendations.py
```

更新 Excel、榜單快照或搭配說明後，依序重跑 Excel、推薦與 Wiki 匯入器，再執行 `npm run check`。配件檔名無法精確對應時，推薦匯入器會停止，須人工核對。收集紀錄的穩定 ID、儲存鍵及備份格式沿用第一階段。

## 資料範圍與限制

- 檔名的 v1.6 是資料表版本，不等同遊戲版本。正式版新增角色、武器、手榴彈及配件變更仍需補齊與核對。
- 660 筆是「裝備＋配件」紀錄，共 607 個不同英文名稱。同名項目跨裝備分開保留，收集狀態互不影響；不能將兩個數字當作獎盃需求總數。
- 中文由 AI 輔助翻譯並修飾，角色與武器中文名稱也屬暫譯，尚未與遊戲內用詞核對。英文原文與數字始終保留。
- 效果分類使用英文關鍵字多標籤，僅供查找，不是實測推薦；例如裝填速度不會自動被分類為移動速度。
- 數值、負號與上下界順序依來源保留，不自行交換看似反向的 Min/Max。描述與數值矛盾、疑似誤植或殘文也不憑空修補。
- 升級列表只展開原表有記載且非 n/a 的 Turbocharge；空白不補寫效果，`[Redacted]` 保留隱去狀態。
- 舊 Build 與參考輔助分頁不納入配件清單；原表中的失效引用不會當作正式推薦匯入。
- 配件圖示來自使用者提供的工作簿；首頁分類線圖為本站自繪。格形以資料產生向量六角格，不複製第三方求解器。

## 收集紀錄與備份

紀錄存在瀏覽器 `localStorage`，不會傳送至伺服器。**網址的主機或連接埠不同，就有不同的儲存空間**；換瀏覽器、裝置、網站網址或清除網站資料前，請先匯出備份。

每個穩定 ID 由裝備 ID 與英文配件名稱產生，不依列號、排序或中文翻譯變動。未來英文改名時仍需建立 ID 遷移對照，不能直接把原紀錄丟棄。

備份格式為 `appId: mycopunk-checklist`、`schemaVersion: 1`，`records` 依 ID 儲存 `collected`、`tracked`、`note` 與 `updatedAt`。支援 10 MB 以下的 JSON 備份；為相容舊版，仍接收每筆上限 5,000 字的舊筆記並隨匯出保留。

匯入會先顯示新增、更新、保留本機與未對應筆數：

1. 同一 ID 保留 `updatedAt` 較新的整筆紀錄，包含明確的「未取得」狀態；時間相同時保留本機版本。
2. 備份未包含的本機紀錄不刪除。未對應目前圖鑑的 ID 仍會保留並隨備份匯出。
3. 寫入前先保存原始儲存文字；可在「資料說明 → 匯入前備份」下載。這是最近一次匯入前的單份備份，再次匯入會替換它。
4. 原有資料若毀損或版本不支援，暫停修改並保留原始文字，可下載調查或用有效備份修復。
5. 儲存不可用時會顯示提示，本次勾選與追蹤暫存在記憶體，請在離開前匯出。備份匯入若無法先保存原始資料，則停止覆寫。

## 重新匯入 Excel

啟動網站不需要 Python。只有更新工作簿資料時需要 Python 3.10 以上，匯入器只使用標準函式庫：

```powershell
python scripts/import_excel.py --strict
```

若環境使用 Windows Python launcher，可改用 `py -3 scripts/import_excel.py --strict`。

匯入器只讀取 Excel，不修改、重算或覆寫來源檔；保留原始檔作為回復來源。圖鑑 JSON 和圖示輸出至 `prototype/data/`、`prototype/assets/icons/`。沒有任何指令會讀取或改寫瀏覽器的個人收集紀錄。

`localization/phrases.json` 保存英文詞句與固定翻譯鍵。翻譯位於 `localization/zh-Hant-a.json`、`zh-Hant-b.json`、`zh-Hant-c.json`。新詞句只追加新鍵，既有鍵不重排；同一句英文透過內容對應，並非依 Excel 列號套用翻譯。`--strict` 遇到缺少譯文時會停止輸出新圖鑑，請補齊譯文後重跑。

目前匯入器針對這份工作簿的欄位結構設計，不能將任意 Excel 視為相同格式。

## 驗證紀錄（2026-10-23）

- 核對 660 個唯一配件 ID、20 個工作簿分類、607 個不同英文名稱、全部譯文與圖示；兩個舊資料匯入器沿用，原始 Excel 不改寫。
- 推薦資料逐一對照 391 個來源項目（23 武器、364 配件、4 排除），並驗證來源版本、歸屬、20 條路線、分級篩選與收集進度。
- 攻略資料核對 27 件裝備修訂、426 個格形來源與格點唯一性、434 筆配件對應、來源版本及取得條件歸屬。
- 幾何檢查每份圖形旋轉六次回原形、旋轉不改變格數、平移後的重疊偵測、每格一個繪圖多邊形，以及格數不一致標示。
- 介面已移除配件詳情對話框與筆記編輯；舊版收集資料與備份結構保持相容。
- 獨立測試網址實際驗證四分類／27 件索引、裝備介紹與舊版取得來源、直接展開數值與座標繪圖、收集跨頁／重整保存、未取得空清單、推薦返回攻略列，以及既有 `?category=characters` 網址。
- 桌面、700px、390px、320px 無水平溢出；主測試頁無 JavaScript 錯誤，切換頁面後無重複元素 ID。測試未寫入 GitHub Pages 的瀏覽器儲存空間。
- 正式遊戲內的效果、譯名、隱藏路徑的實際觸發與獎盃總數仍待實機核對。

## Hidden Paths 驗證紀錄（2026-10-24）

- 七條共 74 個目標格逐一對回原始 `Pattern.nodes[row].nodes[column]`，核對欄列尺寸、品質規則、獎勵與來源版本；錯誤格位、缺少路徑或版本不符會被驗證器拒絕。
- 每張圖的多邊形數等於來源參考格板大小，亮格數等於目標格數；不依占格數猜圖、不引入來源圖片。
- 本機瀏覽器核對 7 張卡片、74 個亮格、來源與跳轉；1280px、390px、320px 無水平溢出，無 JavaScript 錯誤；首頁四分類導覽仍正常。
- 尚未進入遊戲測試觸發；主機版本、旋轉與鏡射判定仍待核對。

## 格形漏項修補（2026-10-24）

先前兩份 Wiki 搜尋分頁共 874 個結果中有 191 個重複 page ID；加上分類索引仍漏掉實際存在的檔案。不能以搜尋結果或分類名單推定 Wiki 沒有圖。本輪針對 181 個未收錄名稱以精確檔名查詢，讀取 174 個新來源；再依七個條目實際引用的圖檔，核對四個 Prism 的 `Font H … font` 檔名與 `Rail-Tuning` 的連字號差異，補讀 5 份。原本的圖檔不重讀，新增 179 份座標，共新增 224 筆升級的格形。

- `research/wiki-shapes-api-missing.json` 保存精確查詢的中繼資料；`wiki-shape-page-evidence.json` 保存條目實際引用圖檔的證據，不採模糊名稱配對。
- 現為 605 種格形／658 筆升級。其餘 `Improve Replication`、`Explosive Bullets` 的對應條目於核對時為空頁，未引用圖檔，暫時保留原表占格數；不推論其他位置一定沒有圖。
- 缺圖顯示「格形座標待補；不代表 Wiki 無圖」，避免把本站收錄狀態誤當來源缺資料。
- 179 份來源 SVG 只在記憶體解析，新增資料仍僅包含座標、雜湊與來源；不保存、不部署來源圖檔。已保留各圖檔明示版本，沒有以新版資料覆寫原 Excel 的占格數。

修補驗證：全站實際呈現 660 筆升級，其中 658 筆有程式繪製的格形、2 筆顯示座標待補；四個 Prism 共 12 個六角格，Corrode Siphon 為來源 v2.0 的 4 格並另列 Excel 6 格。桌面與 390px 無水平溢出、無 JavaScript 錯誤。離線重建結果可重現，沿用舊收集資料與備份格式。
