# Ant Design System (v5.9.4, Community Figma import)
# Ant Design 設計系統（v5.9.4，社群版 Figma 匯入）

A complete design-system import of the **"Ant Design - Version 5.9.4 (Community)"** Figma file (attached to this project as a mounted .fig). Ant Design is the enterprise UI language from Ant Group: a token-driven component system for data-dense web products — consoles, dashboards, admin and workflow tools.

> **中文說明：** 本專案是 **「Ant Design - Version 5.9.4 (Community)」Figma 檔案**的完整設計系統匯入。Ant Design 是螞蟻集團的企業級 UI 設計語言：以設計代幣（token）驅動的元件系統，適用於資料密集的網頁產品——控制台、儀表板、後台管理與工作流工具。

**Source / 來源：** the attached .fig file "Ant Design - Version 5.9.4 (Community)" (64 pages, 123 component sets + ~787 icon glyphs, 350 Figma variables across 8 collections). No other sources were provided. All values here are extracted verbatim from that file — not from the public antd package.
（隨附的 .fig 檔：64 個頁面、123 個元件集 + 約 787 個圖示、8 個集合共 350 個 Figma 變數。所有數值均逐字取自該檔案，而非公開的 antd 套件。）

**No logo asset exists in the source file** — the brand renders as the words "Ant Design" in type wherever a mark would go.
（**來源檔中沒有 logo 素材**——圖示集裡的 AntDesign 字形只是圖示，不是品牌標誌；需要放品牌處一律以「Ant Design」文字呈現。）

## Content fundamentals（文案基礎）

- Copy is **plain, instructional UI English**: sentence case everywhere ("Show description", "Submit", "Cancel"), title case only for product nouns.
- Labels are short imperatives ("Upload", "Delete", "OK"); helper/caption text is a full sentence with no period on single lines.
- Neutral, functional tone — no exclamation, no humor, no first person.
- **No emoji** anywhere in the UI. Status is communicated with icon + semantic color, never emoji.
- Numbers and data are king: content favors tables, statistics, tags and badges over prose.

> **中文說明：** 文案是**平實、指令式的 UI 用語**：一律 sentence case（僅句首大寫），只有產品名詞用 Title Case。按鈕標籤是簡短祈使句（Upload、Delete、OK）；輔助說明為完整句子、單行不加句號。語氣中性、功能導向——不用驚嘆號、幽默或第一人稱。**全介面不使用 emoji**，狀態一律以圖示＋語意色表達。內容以數字與資料為主：偏好表格、統計數字、標籤與徽章，而非長文。

## Visual foundations（視覺基礎）

- **Color:** brand primary Daybreak Blue **#1677FF** (primary-6). 13 preset hue ramps × 10 steps (dust red, volcano, sunset orange, calendula gold, sunrise yellow, lime, polar green, cyan, daybreak blue, geek blue, golden purple, magenta, neutral gray), each with a full **dark-theme** counterpart (scoped \`[data-theme="dark"]\` / \`.dark\`). Semantic: success #52C41A, warning #FAAD14, error #F5222D/#FF4D4F, info = primary.
  **顏色：**品牌主色為「拂曉藍」**#1677FF**（primary-6）。13 組預設色階 × 10 階（薄暮紅、火山、日暮橙、金盞花金、日出黃、青檸、極光綠、明青、拂曉藍、極客藍、醬紫、法式洋紅、中性灰），每組都有完整**深色主題**版本（作用於 \`[data-theme="dark"]\` / \`.dark\`）。語意色：成功 #52C41A、警告 #FAAD14、錯誤 #F5222D/#FF4D4F、資訊＝主色。
- **Text color is black at opacity**, not gray hexes: 88% default, 65% secondary, 45% tertiary, 25% disabled.
  **文字顏色用黑色加透明度**而非灰色色碼：88% 主文、65% 次要、45% 第三層、25% 停用。
- **Type:** SF Pro Text (system stack) — base 14/22 regular; headings Semibold 38/30/24/20/16; code SF Mono 12.
  **字體：** SF Pro Text（系統字體堆疊）——內文 14/22 Regular；標題 Semibold 38/30/24/20/16（H1–H5）；程式碼 SF Mono 12。
- **Spacing:** 4px unit. Paddings 4/8/12/16/20/24/32/48. Control heights 24 (sm) / 32 (default) / 40 (lg).
  **間距：**以 4px 為基準單位。內距 4/8/12/16/20/24/32/48。控制項高度 24（小）/ 32（預設）/ 40（大）。
- **Radii:** XS 2 (tags, checkboxes), SM 4 (small controls), base 6 (buttons, inputs), LG 8 (cards, modals).
  **圓角：** XS 2（標籤、核取方塊）、SM 4（小型控制項）、基準 6（按鈕、輸入框）、LG 8（卡片、彈窗）。除圓形按鈕/頭像外不做全圓角。
- **Borders:** 1px solid #D9D9D9 for controls; rgba(5,5,5,0.06) hairlines for containers.
  **邊框：**控制項用 1px #D9D9D9 實線；容器用 rgba(5,5,5,0.06) 細線。
- **Shadows:** one layered elevation recipe — \`0 6px 16px 0 rgba(0,0,0,0.08), 0 3px 6px -4px rgba(0,0,0,0.12), 0 9px 28px 8px rgba(0,0,0,0.05)\` for overlays; a faint tertiary shadow for cards. No inner shadows.
  **陰影：**懸浮層（下拉、氣泡、彈窗）共用一組三層陰影；卡片用更淡的第三級陰影。不使用內陰影。
- **Backgrounds / 背景：** flat white surfaces on #F5F5F5 page gray; dark navy #001529 for dark navigation/siders. No gradients, no textures.（頁面灰 #F5F5F5 上放平面白色表面；深色導航/側欄用深藍 #001529。無漸層、無材質、無背景圖。）
- **States / 狀態：** hover 亮一階（primary-5 #4096FF）、按下暗一階（primary-7 #0958D9）；停用＝25% 文字＋#F5F5F5 底；聚焦＝主色 20% 透明度的 2px 外框。
- **Motion / 動效：**快速、功能性的淡入淡出與滑動（約 0.2s ease-in-out）；懸浮層從 0.8 縮放淡入；不使用彈跳。
- **Imagery / 影像：**系統本身不含影像——空狀態使用內建的兩款插圖（Empty、Empty simple）。

## Iconography（圖示）

- The system ships its **own icon set: 787 glyphs in three themes** — Outlined, Filled, and Two-tone. Naming follows the Figma layers: base name / \`2\` / \`3\` suffixes distinguish themes per glyph — check \`assets/icons/Icon.d.ts\` for the exact name.
- Render with the \`Icon\` component: \`<Icon name="Search" size={16} />\`. Single-color glyphs paint with \`currentColor\`.

> **中文說明：**系統內建 **787 個圖示，分三種主題**——線框（Outlined）、實心（Filled）、雙色（Two-tone，藍 #1677FF 點綴）。命名沿用 Figma 圖層：同一個圖示的三種主題以「無後綴 / 2 / 3」區分（例如 \`Home3\` 是線框版的 Home）——請以 \`assets/icons/Icon.d.ts\` 的名稱索引為準。使用方式：\`<Icon name="Search" size={16} />\`，單色圖示會跟隨 \`currentColor\` 上色。圖示為 1024 單位網格的正方形，內文旁通常 14–16px，裝飾用時取 45% 黑。不使用圖示字型、emoji 或 Unicode 字元充當圖示。

## Index（檔案索引）

- \`styles.css\` — global entry: fonts + all tokens.（全域 CSS 入口：字體＋全部設計代幣。取用本系統只需連結這一個檔案。）
- \`tokens/fig-tokens.css\` — 350 variables.（350 個變數：13 組色階 ×10 的亮/暗雙主題、種子代幣 colorPrimary 等、間距刻度、元件代幣。）
- \`tokens/fonts.css\` — font stacks + Google Fonts (Inter, Roboto) + user-licensed SF Pro Display Regular wired to 'SF Pro Text'/'SF Pro Display'.（字體堆疊；已接上用戶授權的 SF Pro Display Regular，非 Apple 平台也以 SF 渲染；Semibold 暫以合成粗體呈現。）
- \`assets/icons/\` — icon-data.js (787 glyphs), Icon.jsx wrapper, Icon.d.ts name index.（圖示資料、渲染元件與名稱索引。）
- \`components/\` — general, layout, navigation, data-entry, data-display, feedback.（六大類元件目錄，涵蓋 Figma 檔全部 123 個元件族及其內部零件。）
- \`guidelines/\` — foundation specimen cards.（基礎樣式示例卡：顏色、字體、間距、圓角、陰影。）
- \`ui_kits/console/\` — a sample admin-console screen.（用元件組出的後台控制台示例畫面。）
- \`ui_kits/theme-editor/\` — theme generator.（**主題產生器**：改 seed 色即依 ant-design 梯度演算法重生 1–10 色階並即時套用到全部元件；支援亮/暗雙主題、圓角與字級、控制高度與 Button 元件代幣，可匯出 CSS 變數覆寫。）
- \`SKILL.md\` — agent skill entry point.（AI 代理技能入口。）

### Intentional additions（刻意新增項）
- \`Icon\` wrapper (assets/icons/Icon.jsx) — render helper for the glyph set; the set itself is 1:1 from the file.（圖示渲染輔助元件；圖示本身與來源檔 1:1。）

## Components（元件清單，188 exports）

### components/general（通用）
`Badge`, `Button`, `FileText3`, `FloatButton`, `FloatButtonGroup`, `FloatButtonMenu`, `FloatbuttonItem`, `Link`, `Search`, `Text`, `Title`

### components/layout（佈局）
`DividerHorizontal`, `DividerVertical`, `Grid`, `Layout`, `MenuFold`, `SlotComponent`, `Space`

### components/navigation（導航）
`Anchor`, `AnchorLink`, `Breadcrumb`, `BreadcrumbLink`, `BreadcrumbSeparator`, `Check`, `Close`, `DoubleLeft`, `DoubleRight`, `Down`, `Dropdown`, `DropdownDivider`, `DropdownGroup`, `DropdownItem`, `DropdownMenu`, `DropdownTrigger`, `Ellipsis`, `Home3`, `Left`, `Mail3`, `Menu`, `MenuGroup`, `MenuItem`, `MenuSubmenu`, `MenuSubmenuList`, `MenuSubmenuPopover`, `MenuTopNavigation`, `MenuTopnavigationItem`, `Pagination`, `PaginationArrow`, `PaginationMore`, `PaginationNumber`, `Right`, `Steps`, `StepsItemHorizontal`, `StepsItemProgress`, `StepsItemTail`, `StepsItemVertical`, `User`

### components/data-entry（資料輸入）
`Audio3`, `AutoComplete`, `Calendar3`, `Cascader`, `CascaderDropdown`, `CascaderItem`, `CascaderMenu`, `Checkbox`, `ClockCircle3`, `CloseCircle2`, `ColorPicker`, `ColorPickerColorClear`, `ColorPickerColorPicker`, `ColorPickerColorPreview`, `ColorPickerColorSelect`, `ColorPickerPalette`, `ColorPickerPopup`, `ColorPickerSlider`, `ColorPickerTrigger`, `DatePicker`, `DatePickerInputBasic`, `DatePickerInputBorderless`, `DatePickerMenu`, `DatePickerMenuItem`, `ExclamationCircle2`, `Export`, `Eye3`, `EyeInvisible3`, `Header`, `Input`, `InputBorderless`, `InputCaption`, `InputLabel`, `InputNumber`, `InputNumberBorderless`, `InputPassword`, `InputPrepostTab`, `InputSearchBox`, `InputTextArea`, `Loading`, `Mention`, `QuestionCircle3`, `Radio`, `RadioButtonItem`, `RadioGroupBasic`, `RadioGroupButtons`, `Rate`, `RateStarBasic`, `RateStarCustomIcon`, `Search2`, `Segmented`, `SegmentedItem`, `Select`, `SelectGroup`, `SelectInput`, `SelectItem`, `SelectMenu`, `SelectMultipleItem`, `Setting3`, `SwapRight`, `Switch`, `TimePicker`, `TimePickerInputBasic`, `TimePickerInputBorderless`, `TimePickerMenu`, `TimePickerMenuItem`, `UnorderedList`, `Up`

### components/data-display（資料展示）
`Apple2`, `BadgeRibbon`, `BadgeStatus`, `Carousel`, `CarouselDot`, `CarouselDots`, `CheckCircle3`, `CloseCircle3`, `ComponentsEmptyImage`, `ComponentsEmptyImgGray`, `ComponentsEmptyImgSimple`, `Empty`, `ExclamationCircle3`, `Facebook`, `HierarchyPrimaryBulletFalseEditable`, `Image`, `ImageFixedRatio`, `Like3`, `Linkedin`, `MinusCircle3`, `Plus`, `Popover`, `ProgressScrubberBasic`, `ProgressScrubberSmall`, `QRCode`, `Statistic`, `Sync`, `TabItem`, `Tabs`, `TabsHeader`, `Tag`, `TagCheckable`, `TagColorful`, `TagIcon`, `TagStatus`, `Tooltip`, `TooltipColorful`, `Twitter`, `Watermark`, `Youtube`

### components/feedback（回饋）
`Alert`, `CheckCircle2`, `Drawer`, `InfoCircle2`, `Message`, `Modal`, `ModalInformation`, `ModalOverlay`, `Notification`, `Popconfirm`, `ProgressCircle`, `ProgressDashboard`, `ProgressLine`, `ProgressSteps`, `Result`, `Skeleton`, `SkeletonAvatar`, `SkeletonImage`, `SkeletonMultiline`, `SkeletonTitle`, `Smile3`, `Spin`, `Warning2`


## Caveats（注意事項）
- **此 Figma 檔未定義以下常見 antd 元件，因此本系統刻意不收錄**（來源檔即是元件清單的邊界）：Table、Form、Upload、Avatar、List、Card、Collapse、Tree / TreeSelect、Transfer、Slider、Calendar、Descriptions、Timeline、Affix、BackTop、Tour。若需要，請提供含這些元件的 Figma 檔或指示我依 antd 規格補做（會標註為「刻意新增項」）。

- **SF Pro**: user-licensed SF Pro Display Regular is embedded; SF Pro Text optical size and Semibold weight are still missing (Semibold renders as synthesized bold). SF Mono and PingFang SC still fall back to system fonts.
  （已內嵌用戶授權的 SF Pro Display Regular；仍缺 Text 光學尺寸與 Semibold 字重——標題目前為合成粗體。SF Mono 與蘋方仍回退系統字體；上傳對應 .otf 可補齊。）
- Button's 600-variant set exceeded extraction caps: the 64 most common variants carry exact deltas; rarer combos render from root-level styles only.
  （Button 有 600 個變體、超出擷取上限：最常用的 64 個變體帶有精確樣式差異；較少見的組合（停用×幽靈×危險等）僅以根層級樣式渲染。）
- Names ending in 2/3 (e.g. \`Home2\`, \`ClockCircle3\`) are theme duplicates from the Figma file's icon naming, kept verbatim.
  （名稱結尾的 2/3（如 \`Home2\`、\`ClockCircle3\`）是 Figma 檔圖示命名中的主題重複版本，原樣保留。）
