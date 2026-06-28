# 高考志愿填报顾问 (Gaokao Advisor)

> English version: [README.md](README.md)。

一个就业导向、风险分层的高考志愿填报助手。产品理念参考张雪峰式建议与主流志愿填报服务（夸克高考、掌上高考、优志愿）：务实、强调就业与行业趋势、用 **冲 / 稳 / 保** 三档控制录取风险，并结合 AI 生成多套完整志愿方案。

> ⚠️ **预测有风险,仅供参考,不可轻信。** 本工具为辅助参考，不替代官方指导。可验证与不可验证的边界见下文「数据校验」。

---

## 状态与数据覆盖

项目最初是一个全部 mock 的 v0 演示版，之后已发展出**真实、端到端的数据管线**（官方文件 → 解析器 → CSV → 存储 → 匹配），并对照 `sdzk.cn` 锚点校验。当前真实覆盖：

| 省份·科类 | 数据 |
| --- | --- |
| **山东 · 综合**（2025） | ✅ **真实**——官方一分一段 + 投档线 + 分数线 + 985/211/双一流 标签 + 21283 个专业级记录 |
| 河北 · 物理 / 历史 | 示例数据（仅演示） |
| 四川 · 理科 / 文科 | 示例数据（仅演示） |
| 其它省份 | 暂无——UI 优雅降级并提示数据缺口 |

每条记录带 `year` + `lastUpdatedAt`；UI 全程展示新鲜度徽章并对往年/陈旧数据告警。

---

## 快速开始（本地运行）

要求：Node.js ≥ 18.18，`pnpm` ≥ 9。

```bash
pnpm install        # 安装依赖
pnpm dev            # 启动应用 → http://localhost:3999
```

首次访问任意页面时，应用会自动种子化本地存储（`data/store.json`），无需额外步骤。**零配置即可运行**：默认 AI 用本地 mock，DB 用 JSON 文件。

配置见 [`.env.example`](.env.example)（复制为 `.env` 后可改 AI 提供方、数据库驱动、当前年份、陈旧阈值）。

### 其它命令

| 命令 | 作用 |
| --- | --- |
| `pnpm seed` | 用数据源初始化 / 重建本地存储（幂等，按自然键 upsert） |
| `pnpm download [省份]` | 按 `data/sources/sources.json` 下载官方文件 → `data/sources/raw/`（含溯源 manifest） |
| `pnpm parse` | 解析已下载的官方文件 → `data/sources/*.csv`（山东：一分一段 + 投档线 + 分数线 + 985/211 标签） |
| `pnpm refresh` | 手动跑一次数据采集流水线（去重 + 新鲜度标记）。加 `DATA_SOURCE=real` 用真实 CSV |
| `pnpm scheduler` | 启动每日定时采集任务（node-cron，默认 03:00） |
| `pnpm test` | 单元测试（匹配引擎 + 数据流水线 + 各省解析器，**7 个文件 40 例**） |
| `pnpm eval` | **引擎逻辑**评测（mock 确定性数据，**24 例**：推荐属性 + 检索 grounding + 黑马） |
| `pnpm verify` | **真实数据校验**（山东，对照 sdzk.cn 官方锚点 + 完整性 + 引擎合理性）—— 见下「数据校验」 |
| `pnpm build` | 生产构建（含完整类型检查） |
| `pnpm lint` / `pnpm format` | ESLint / Prettier |

---

## 功能

1. **数据采集模块**——各省批次线、院校投档线（含历史）、一分一段表（位次换算）、师资、校园/教学/宿舍环境、转专业政策。每条记录带 `year` + `lastUpdatedAt`；定时任务、去重、新鲜度标记均为真实逻辑，仅「网络抓取」被收敛到一个可替换接口后。
2. **学生信息填写**——省份、选科模式与分数、兴趣、意向院校/专业、地域偏好（城市层级/地区/气候）、自由文本想法。所有字段随时可改，浏览器本地持久化（localStorage）。
3. **联动筛选（实时匹配）**——任意修改即时重算冲/稳/保排名；每张结果卡展示预测线 vs 分数、位次、录取概率、师资/环境、转专业难度、数据新鲜度徽章。
4. **AI 聊天**——顶部「黑马预测」横幅（含醒目免责声明）；对话探询兴趣/方向/风险偏好；一键生成稳妥型/均衡型/冲刺型三套完整方案（含理由与风险）。LLM 调用走可替换接口（见下）。
5. **评测数据集**——`pnpm eval` 运行 24 个 RAG 风格用例（不同省份、分数段、风险偏好、压线/缺数据等边界），报告通过率与质量指标。

---

## 架构

清晰分层：**数据采集 → 存储 → 领域/匹配 → API → UI**。核心设计取舍是**把每个外部依赖都收敛到一个可替换接口后**，使 mock→真实仅需一处改动。

```
┌─────────────────────────────────────────────────────────────────────┐
│  UI (Next.js App Router, 客户端组件)                                  │
│  /  志愿匹配(实时)   /chat  AI聊天+黑马+方案                          │
│  /search  院校查询   /data  数据与更新                                │
└───────────────┬─────────────────────────────────────────────────────┘
                │ fetch
┌───────────────▼─────────────────────────────────────────────────────┐
│  API 路由 (/api/match, /darkhorse, /plans, /chat, /data, /admin/*)    │
└───────────────┬───────────────────────────────┬─────────────────────┘
                │                                │
┌───────────────▼──────────────┐   ┌─────────────▼──────────────────────┐
│  领域层 (纯函数, 可测)         │   │  AI 层 (AiClient 接口)              │
│  matching(冲稳保) · rankConv  │   │  mock ⇄ deepseek ⇄ anthropic        │
│  darkHorse(黑马) · freshness  │   └─────────────────────────────────────┘
└───────────────┬──────────────┘
                │
┌───────────────▼──────────────────────────────────────────────────────┐
│  数据层                                                                │
│  Repository(DAO) ── DataStore 接口 ── JsonStore / MemoryStore / (SQLite)│
│  Pipeline(去重+新鲜度) ◀── DataFetcher 接口 ◀── Mock / RealFetcher     │
│  Scheduler (node-cron, 每日)                                           │
└───────────────────────────────────────────────────────────────────────┘
```

关键「接缝」（每个隔离一个外部依赖，便于替换）：

- **`DataFetcher`**（`src/lib/data/fetchers/types.ts`）——网络/数据源。`MockFetcher`（启发式样本）与 `RealFetcher`（读取下载好的官方文件；山东已端到端打通）。由 `DATA_SOURCE` 切换。
- **`DataStore`**（`src/lib/data/stores.ts`）——持久化驱动。`JsonStore`（默认）/`MemoryStore`（测试）/`sqlite`（占位，抛未实现）。由 `DB_DRIVER` 切换。
- **`AiClient`**（`src/lib/ai/types.ts`）——LLM 后端。`MockAiClient`（默认，离线）/`DeepSeekAiClient`/`AnthropicAiClient`。由 `AI_PROVIDER` 切换；缺 key 自动回退 mock。

详见 [`DECISIONS.md`](DECISIONS.md)（技术选型与权衡）、[`docs/MOCKS.md`](docs/MOCKS.md)（mock 清单与替换指引）、[`docs/competitive-reference.md`](docs/competitive-reference.md)（张雪峰/竞品分析）、[`docs/ROADMAP.md`](docs/ROADMAP.md)（v1 及以后）、[`docs/USER_GUIDE.md`](docs/USER_GUIDE.md)（用户使用手册）。

### 目录结构

```
src/
  app/                    Next.js App Router（页面 + API 路由）
    page.tsx              首页：信息表单 + 实时冲稳保
    chat/page.tsx         AI 聊天 + 黑马横幅 + 方案
    search/page.tsx       按校名查询院校
    data/page.tsx         数据采集状态 + 批次线表（新鲜度）
    api/                  match / darkhorse / plans / chat / data / admin
  lib/
    config.ts             环境配置
    domain/               types · matching(冲稳保) · rankConversion · darkHorse
    data/                 repository(DAO) · stores · pipeline · scheduler · freshness · fetchers/ · parsers/
    ai/                   types(AiClient) · mock · deepseek · anthropic · prompt · index(工厂)
    profile/              默认档案 + 归一化
    services/             advisor（装配数据+领域，供 API 调用）
  scripts/                seed · download · parse · refresh · scheduler · verify
  eval/                   cases(数据集) · run(评测 runner)
  test/                   matching · pipeline · rankConversion · 各省解析器 单测
docs/                     MOCKS · competitive-reference · ROADMAP · USER_GUIDE
```

---

## 真实 AI（可选）

AI 层与提供方无关。在 `.env` 设其一：

```bash
# DeepSeek（OpenAI 兼容，低成本）
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_MODEL=deepseek-chat          # 或 deepseek-reasoner（R1，更深但更慢）

# Anthropic
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-4-8

# （默认）本地 mock——无需 key，完全离线，确定性
AI_PROVIDER=mock
```

未配置 key 时自动回退到 mock，应用不会硬失败。真实客户端使用官方 SDK；分档引擎（冲/稳/保）是确定性逻辑，**不依赖** LLM——LLM 仅用于对话与方案叙述。

---

## 数据校验（结果如何确保正确）

「对不对」分三层，工具各异：

| 层 | 含义 | 工具 |
| --- | --- | --- |
| **数据忠实度** | 存的位次/投档线是否 = 官方数据 | `pnpm verify` |
| **引擎合理性** | 数据正确时，冲/稳/保与概率是否算对 | `pnpm eval`（mock 确定性）+ `pnpm verify`（真实数据） |
| **结果真相** | 某分数最终能否被某校录取 | ⚠️ **只有录取后追踪能证明**（见 `docs/ROADMAP.md`）——这是任何志愿工具的根本局限 |

`pnpm verify`（`src/scripts/verify.ts`）针对**真实山东管线**（官方文件 → 解析 → CSV → 存储 → 匹配）跑三类检查：

- **官方锚点**：硬编码可在 [sdzk.cn](https://www.sdzk.cn) 自查的官方值（如 一分一段 600分→累计 25061、一段线 441）。解析/数据漂移会让其变红。
- **完整性不变量**：一分一段单调、投档线无孤儿院校、分数/位次范围合法、位次↔分数换算自洽。
- **引擎合理性（真实数据上）**：线上同分→冲、+12 分→稳、+35 分→保、概率随分数单调、稳档按匹配度排序。

> 边界：`verify` 证明的是「我们的数字忠实等于官方数据，且引擎处理正确」——可验证的部分。它**不能**证明某条推荐在现实中「正确」（那需要多年真实录取结果闭环）。

---

## 再次提醒

本工具为辅助参考。真实填报请综合**官方数据、学校招生章程、老师与家长意见**，谨慎决策。**预测有风险,仅供参考,不可轻信。**
