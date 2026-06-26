# MOCKS — mock 登记表（开发者交接清单）

每个被 mock 的数据/接口/凭证都：(a) 隔离在一个接口之后；(b) 在此登记 **名称、代码位置、契约/形状、应替换为何种真实来源**。这是未来开发者把 v0 接到真实数据/服务的对照清单。

---

## 1. 网络数据源（`DataFetcher`）

由 `DATA_SOURCE` 切换（`mock` 默认 / `real`），工厂在 `src/lib/data/fetchers/index.ts` 的 `createFetcher()`，所有运行时调用点（调度器、脚本、`services/advisor`、`/api/admin/refresh`）均经此工厂。评测/单测刻意直接用 Mock/Stub 以保证确定性。

`RealFetcher`（`src/lib/data/fetchers/realSource.ts`）：从 `DATA_SOURCE_DIR`（默认 `data/sources/`）读取下载好的官方文件。v0 已实现**一个示例**——`provincial-lines.csv → ProvincialScoreLine`（含 CSV 解析器）；其余四个集合为 TODO 桩（返回 `[]`），按同一模式逐个补齐。

| 项目 | 代码位置 | 形状/契约 | 应替换为 |
| --- | --- | --- | --- |
| **MockFetcher（默认）** | `src/lib/data/fetchers/mockSource.ts` | 实现 `DataFetcher`（`src/lib/data/fetchers/types.ts`），五个 `fetch*` 方法返回带 `lastUpdatedAt`（采集时间戳）的记录数组 | 真实爬虫 / 官方接口客户端，**实现同一 `DataFetcher` 接口** 即可，流水线/调度/存储零改动 |
| **RealFetcher（脚手架，已就绪）** | `src/lib/data/fetchers/realSource.ts` | 读取 `data/sources/*` 官方文件并映射为领域记录；已含 `provincial-lines.csv` 示例与 CSV 解析器 | 按 TODO 补齐 `fetchRankTables/Universities/Majors/AdmissionLines`（Excel 用 `xlsx`、PDF 用 `pdf-parse`、HTML 用 `cheerio`） |
| 各省批次线 `fetchProvincialLines` | 同上 `buildProvincialLines` | `ProvincialScoreLine{province,year,track,batch,minScore,...}` | 各省教育考试院公布的批次/控制线 |
| 一分一段表 `fetchRankTables` | 同上 `buildRankTables` | `RankTable{province,year,track,buckets:[{score,cumulativeRank}]}`（**粗桶**，仅供位次换算演示） | 各省官方一分一段表（逐分） |
| 院校信息 `fetchUniversities` | 同上 `UNIVERSITIES` | `University{...faculty,environment,transfer,tags,cityTier,region}` | 阳光高考平台 / 院校官网 / 学科评估数据 |
| 专业信息 `fetchMajors` | 同上 `MAJORS` | `Major{name,category,facultyStrength,employmentOutlook,requiredSubjects}` | 院校招生章程 + 就业质量报告 + 行业数据 |
| 院校投档线 `fetchAdmissionLines` | 同上 `buildAdmissionLines` | `AdmissionLine{universityId,province,year,track,minScore,minRank?}` | 各省投档线/录取数据（按考生省份 × 年份 × 科类） |

> ⚠️ **所有分数、位次、师资/环境/就业文案均为启发式构造**（基线分 + 跨省偏移 `PROVINCE_OFFSET` + 年度趋势），并非真实数据。覆盖省份：河北(物理)、山东(综合)、四川(理科)；其余省份返回空（UI 优雅降级并提示数据缺口）。

---

## 2. 存储驱动（`DataStore`）

| 项目 | 代码位置 | 形状/契约 | 应替换为 |
| --- | --- | --- | --- |
| **`sqlite` 驱动（占位，未实现）** | `src/lib/data/stores.ts` `createDataStore()` | 选择 `DB_DRIVER=sqlite` 时显式 `throw`（未实现） | 实现 `DataStore{read,write}`（如 `PostgresStore`/`SqliteStore`），并在 `createDataStore` 注册一行；其余代码经 `Repository` 接口无感知 |
| JsonStore（默认，非 mock 但仅适合 v0） | 同文件 `JsonStore` | 读写 `data/store.json`（原子写） | 生产应换为真实数据库（见 ROADMAP） |

`DB_DRIVER` 由 `.env` 控制：`json`(默认) / `memory`(测试) / `sqlite`(占位)。

---

## 3. AI / LLM（`AiClient`）

| 项目 | 代码位置 | 形状/契约 | 应替换为 |
| --- | --- | --- | --- |
| **MockAiClient（默认）** | `src/lib/ai/mock.ts` | 实现 `AiClient`（`src/lib/ai/types.ts`）：`generatePlans` 由匹配结果确定性重组三套方案；`chat` 返回上下文相关的规则化回复 | 真实 LLM（已提供 `AnthropicAiClient`） |
| **Anthropic 凭证/配置** | `src/lib/config.ts`（`ANTHROPIC_API_KEY`,`ANTHROPIC_MODEL`,`AI_PROVIDER`）+ 工厂 `src/lib/ai/index.ts` | key 经环境注入，藏在 `AiClient` 接口后；缺 key 自动回退 mock | 在 `.env` 配置真实 key：`AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` |
| AnthropicAiClient（真实，待启用） | `src/lib/ai/anthropic.ts` | 官方 `@anthropic-ai/sdk`，模型默认 `claude-opus-4-8`，adaptive thinking，JSON 容错解析 | 已就绪——配置 key 即生效，无需改代码 |

---

## 4. 其它演示用约定

| 项目 | 代码位置 | 说明 / 替换 |
| --- | --- | --- |
| 自动种子化 | `src/lib/services/advisor.ts` `ensureData()` | 首次访问且存储为空时用 `MockFetcher` 跑一次流水线。接真实源后仍可保留（或改为部署时预填充）。 |
| 学生档案持久化 | `src/app/page.tsx`（localStorage `gaokao-profile-v1`） | v0 仅浏览器本地存储。多设备/账号体系见 ROADMAP（需用户系统 + 服务端持久化）。 |
| 当前年份 / 陈旧阈值 | `.env`：`CURRENT_YEAR`,`DATA_STALE_AFTER_DAYS` | 新鲜度判定参数；接真实数据后按实际投档年份设置 `CURRENT_YEAR`。 |

---

## 替换顺序建议

1. 实现真实 `DataFetcher`（先批次线/投档线/一分一段，再院校/专业静态信息）——爬虫合规见 `docs/ROADMAP.md`。
2. 实现真实 `DataStore`（Postgres/SQLite），切 `DB_DRIVER`。
3. 配置 `ANTHROPIC_API_KEY` 启用真实 AI（代码已就绪）。
4. 把 localStorage 档案迁移到带账号的服务端存储。
