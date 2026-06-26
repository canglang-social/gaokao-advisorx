# TODO — 接入真实数据 / Wiring up real data

把 v0 从"示例数据"推进到"真实可用"的清单。`[x]` 已完成，`[ ]` 待办。
Checklist to move from sample data to real, usable data. `[x]` done, `[ ]` to do.

> **分工 Ownership**: 🧑 = 你来做（下载/核验/提供文件） · 🤖 = 我来做（写解析器/代码）。
> 🧑 = you (download / verify / provide files) · 🤖 = me (write parsers / code).

---

## 数据存储 Data store

- **现在用 / Currently**: JSON 文件 `data/store.json`（`DB_DRIVER=json`，默认）。本地自用足够。
  JSON file — fine for personal/local use.
- `[ ]` 🤖 (可选 optional) 数据变大后实现真实 `DataStore`（SQLite 或 Postgres），切 `DB_DRIVER`。接口已就位，只需加一个文件。

---

## AI 分析所用模型 LLM for analysis

- **现在用 / Currently**: **mock 本地生成器**（`AI_PROVIDER=mock`，默认）。聊天与“志愿方案”由规则从匹配结果重组，**不是真正的语言推理**。
  The chat + “application plans” are rule-based recombination, NOT real LLM reasoning, by default.
- `[x]` 🤖 已支持 **DeepSeek**（OpenAI 兼容，`DeepSeekAiClient`）。启用：`.env` 设
  `AI_PROVIDER=deepseek` + `DEEPSEEK_API_KEY`（模型默认 `deepseek-chat`，深推理用 `deepseek-reasoner`）。
- `[x]` 🤖 也支持 **Anthropic**（`AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`，默认 `claude-opus-4-8`）。
- `[ ]` 🧑 配好上面任一 key 即启用真实分析；缺 key 自动回退 mock，不会硬失败。
- `[ ]` 🤖 (启用后) 为方案生成加结构化输出 + LLM 质量评测（把 AI 分析也纳入可回归的评测）。
- 注：分档（冲/稳/保）**不依赖 LLM**——那是确定性引擎；LLM 只用于对话探询与生成“完整志愿方案/理由/风险”。
  Tiering does NOT use the LLM (deterministic engine); the LLM only powers chat + plan narration.

---

## 已完成 Done

- `[x]` 🤖 可替换数据源接口 `DataFetcher` + 工厂 `createFetcher()`（`DATA_SOURCE=mock|real`）
- `[x]` 🤖 `RealFetcher`：读 `data/sources/*.csv`（批次线/院校/投档线/专业/一分一段 全部已实现）
- `[x]` 🤖 下载脚本 `pnpm download`（配置驱动 + 自动发现 + 溯源 manifest）
- `[x]` 🧑→🤖 已下载真实文件：河北 2025 一分一段(PDF)、山东 2025 一分一段(XLS)、山东 2025 分数线(PDF)
- `[x]` 🤖 山东 一分一段 `.xls` 解析器 `pnpm parse` → 真实 543 段位次写入 `rank-tables.csv`（已含单测）

---

## 待办 — 需要你 To do — needs you 🧑

> 通用流程：去官网下载官方文件 → 把 URL 填进 `data/sources/sources.json` → `pnpm download` → 对照官网核验文件 → 告诉我格式，我写解析器。
> Download official file → add its URL to `sources.json` → `pnpm download` → verify against the source → tell me the format, I write the parser.

### 河北 Hebei
- `[ ]` 🧑 河北 2025 **本科批/特殊类型 批次线**（hebeea.edu.cn 录取控制分数线公告页）
- `[ ]` 🧑 河北 2025 **院校投档线**（物理/历史，本科批，hebeea.edu.cn 投档线公告，录取期间发布）
- `[x]` 河北 一分一段(PDF) 已下载（待解析，见下）

### 山东 Shandong — ✅ 学生可用 STUDENT-READY (real, end-to-end)
- `[x]` 山东 一分一段 → 真实位次（543 段）✓
- `[x]` 山东 2025 普通类常规批第1次投档线 → 真实院校投档线（1140 所，位次→分数经真实一分一段换算）✓
- `[x]` 山东 2025 分数线（PDF 解析）→ 真实 特殊521/一段441/二段150 ✓
- `[x]` 985/211/双一流 标签（157 所真实院校已标记）✓
- `[x]` 每档上限 40、缺口提示清理（真实规模下可用）✓
- `[x]` 院校 **城市/省份/地区/城市层级** 元数据（985/211 共 111 所，`universityMeta.ts` 精确匹配）→
  卡片显示地理位置、支持地域偏好排序、"性价比/一线"理由正确触发 ✓
- `[x]` 院校 **专业列表**（从投档表解析专业级数据，21283 个）→ 卡片显示专业、**意向专业匹配生效** ✓
- `[x]` **意向专业大类匹配**（财会类→会计学/财务管理，`majorMatch.ts`）✓
- `[x]` **专业级投档线**：每个专业带自己的投档线（位次→分数）。填了意向专业后，
  按"你想读的那个专业自己的线"判定冲/稳/保，而非全校最低线（修复"宁夏大学按园艺538推荐财会"的问题）✓
- `[x]` **中外合作/高收费专业过滤**：`isHighCostMajor` 识别（中外合作/校企合作/较高收费），
  表单复选框"包含中外合作/高收费专业"（默认排除）。排除时不计入院校最低线与意向专业匹配，
  避免"虚假保底"（如北理工会计学中外合作628 vs 平价最低661）✓
- `[x]` **城市/兴趣** 表单优化：城市标注"仅供 AI 参考"并接入 AI 上下文；兴趣支持自定义输入 ✓
- `[ ]` 🧑 (可选) 山东 第2/3次征集志愿投档表 → 更全覆盖（同一解析器，追加即可）
- `[ ]` 🧑 (可选) 院校 **师资/宿舍/转专业** → 需逐校手工或从阳光高考导入（不影响分档/专业匹配）。
- `[ ]` 🤖 (可选) 双非院校的城市/地区（当前仅 985/211 有；双非需更大参考表或阳光高考导入）。

### 院校 / 专业 Universities / Majors
- `[ ]` 🧑 从**阳光高考院校库**（gaokao.chsi.com.cn/sch）整理目标院校的：标签(985/211/双一流)、城市、学科评估等级、转专业政策、校园/宿舍信息 → 填入 `data/sources/universities.csv`
- `[ ]` 🧑 各校"毕业生就业质量年度报告"里的专业就业信息 → 填入 `data/sources/majors.csv`
  （这两类没有统一可下载表格，通常需手工整理；目前是 8 校示例数据。）

### 四川（如需 if needed）
- `[ ]` 🧑 四川 2025 批次线 / 一分一段 / 投档线（sceea.cn）

---

## 待办 — 我来做 To do — me 🤖（你提供文件后 once you provide files）

- `[x]` 🤖 山东 一分一段 `.xls` 解析器（`pnpm parse`）✓
- `[x]` 🤖 山东 投档线 `.xls` 解析器（聚合到院校级、位次→分数换算、生成院校条目）✓
- `[x]` 🤖 山东 分数线 **PDF 解析器**（`pdf-parse`，普通类 一段/二段/特殊类型）✓
- `[x]` 🤖 985/211/双一流 标签参考表 + 自动标记（`universityTags.ts`）✓
- `[ ]` 🤖 河北 一分一段 **PDF 解析器**（加在 `pnpm parse`，`raw/hebei/2025/*.pdf` → `rank-tables.csv`）
- `[ ]` 🤖 河北 **投档线** 解析器（需你先下载河北投档线文件）→ 河北真实分档
- `[ ]` 🤖 （可选）院校城市/地区/师资 元数据 导入助手

---

## 收尾 Finish

- `[ ]` 🧑 抽查每个解析结果对照官方文件（`pnpm verify` 末尾会打印院校线供对照）
- `[ ]` 🧑 满意后在 `.env` 设 `DATA_SOURCE=real`，运行 `pnpm refresh` 正式切换
- `[ ]` 🤖 把 eval/verify 扩到覆盖真实省份/年份，作为回归门禁

---

## 常见疑问 FAQ

**Q：山东 第2/3次征集志愿投档表，为什么没做？是什么意思？**
A：第1次投档后，部分院校仍有剩余计划，会面向**尚未被录取**的考生再次开放填报，即“征集志愿”。第2/3次就是这些补录轮次的投档表。
- **第1次** 覆盖了绝大多数本科录取（我们已用），是主数据。
- **第2/3次** 主要是**剩余名额/较冷门专业/分数更低的考生**，分数线通常更低。
- 标记为可选：对高分/常规考生影响很小；若要服务**压线/低分**考生的补录场景，再用**同一个解析器**追加即可（把对应 URL 加进 `sources.json` → `pnpm download` → `pnpm parse`）。

**Q：意向专业（如大类「财会类」）能匹配吗？** —— ✅ 已支持。
A：山东真实院校已解析出**专业列表**（21283 个），且加了**大类→专业**匹配（`majorMatch.ts`）：
财会类 → 会计学/财务管理/财政学… 命中即 +10 排序加权并在卡片给出理由。具体专业（如「会计学」）走子串匹配。

**Q：院校/专业元数据为什么不补全？重要吗？不补能出结果吗？**
A：**能出结果，且分档正确**——冲/稳/保只依赖 **投档线 + 一分一段**（都已是真实数据）。院校的师资/宿舍等，**只影响卡片的丰富度与决策辅助**，不影响排名是否正确。（城市/标签/专业列表现已补上。）
- 现状：真实山东院校有 **名称 + 真实投档线 + 985/211 标签**；缺 城市/师资/宿舍/转专业/专业列表。
- 影响：卡片较“素”（学生看得到学校和分数线，但看不到“有哪些专业、城市如何、就业怎样”）；黑马（需多年数据）也不触发。
- 重要性：对“给出正确的可报院校梯队”——不必需；对“帮学生**做决定**（选哪个专业/城市/就业）”——重要，属增强项。
- 专业数据无统一可下载表（需手工整理或从阳光高考逐校导入），故留作增强。**注：投档表里其实含专业级位次**，将来可解析为“专业级投档线”，比院校级更精细。

**Q：样本数据会不会影响山东学生的真实使用？（majors.csv 还是示例）**
A：**不会影响匹配结果**。匹配按 `省份 + 科类` 过滤——8 所示例院校（清华等 slug）只有**河北**示例投档线，山东匹配时被直接跳过（已修复为不再产生噪音缺口，`pnpm verify` 中 dataGaps=0 可证）。
- 示例 16 条专业属于那 8 所示例院校，**不会出现在山东结果里**（山东真实院校的专业列表目前为空，而非示例污染）。
- 唯一“混入”：`/data` 页会同时显示河北/四川示例批次线（仅展示，不参与山东匹配）。
- `[ ]` 🤖 (可选) 若要纯山东部署：提供一个“只保留真实数据、剔除示例行”的清理脚本/开关。

---

## 命令速查 Commands

```bash
pnpm download            # 下载 sources.json 里的官方文件 → data/sources/raw/
pnpm download hebei      # 只下河北
pnpm parse               # 解析已下载文件 → data/sources/*.csv（山东：一分一段+投档+分数线+标签）
DATA_SOURCE=real pnpm refresh   # 把真实 CSV 载入存储
DATA_SOURCE=real pnpm dev        # 用真实数据跑应用
pnpm test                # 单测（含 山东 解析器，27 例）
pnpm eval                # 引擎逻辑评测（mock 数据，22 例）
pnpm verify              # 真实数据校验（山东，对照 sdzk.cn 官方锚点，21 例）
```

## 如何确认结果正确 How to validate results

“对不对”分三层，各有验证方式：
1. **数据忠实度 Data faithfulness** —— 存的位次/投档线是否=官方。`pnpm verify`：硬编码可在 sdzk.cn
   自查的官方锚点（如 600分→累计25061、一段线441）+ 完整性不变量（单调、无孤儿、范围、换算自洽）。
   想加新锚点：在 `src/scripts/verify.ts` 的 `ANCHOR_*` 里加你核对过的官方值。
2. **引擎合理性 Engine soundness** —— 给定正确数据，分档/概率是否算对。`pnpm eval`（mock 确定性）
   + `pnpm verify` C 段（真实数据上的单调性/分档移动）。
3. **结果真相 Outcome truth** —— 某分数最终能否被某校录取。**只有录取后追踪能证明**（见 ROADMAP），
   v0 无法验证；这也是任何志愿工具的根本局限，需多年真实录取数据闭环。

> 人工抽查：`pnpm verify` 末尾会打印北大/山大/海大等院校的“最低投档线/位次”，可直接对照官方投档表逐条核对。

数据文件契约（表头即 schema）：`data/sources/*.csv`
- `provincial-lines.csv`: province,year,track,batch,minScore,source
- `rank-tables.csv`: province,year,track,score,cumulativeRank,source
- `universities.csv`: id,name,city,province,cityTier,region,tags,facultySummary,keyDisciplines,facultyRating,envCampus,envTeaching,envDormitory,transferDifficulty,transferPolicy
- `admission-lines.csv`: universityId,province,year,track,minScore,minRank,source
- `majors.csv`: universityId,name,category,facultyStrength,employmentOutlook,requiredSubjects
