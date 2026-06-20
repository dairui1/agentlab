# Claude Code 公开架构与源码泄露分析综述 Research State

- Slug: `claude-code-public-architecture`
- Created: 2026-06-20
- Status: drafted
- Summary: 整合官方文档、公开逆向研究和源码泄露事件分析，梳理 Claude Code 的架构、工具、上下文、权限与安全边界。

## Research Question

从官方文档、当前公开 npm 包、公开逆向研究、以及 2026 年 3-4 月源码 source map 泄露事件后的分析中，可以稳定提炼出 Claude Code 哪些架构知识？哪些内容只能作为第三方主张，不能当作可复查事实？

## Scope

- In scope:
  - Anthropic / Claude Code 官方文档、产品页和 changelog。
  - 当前 `@anthropic-ai/claude-code` npm 包元数据和 AgentLab 本地缓存。
  - 公开文章、论文和安全报道对 Claude Code 架构、上下文、工具、hooks、subagents、泄露事件的分析。
  - 对“泄露源码分析”做二级综述：记录别人声称看到什么，以及这些主张对 agent 设计有什么启发。
- Out of scope:
  - 下载、镜像、复刻或引用未授权泄露源码、source map、私有仓库、私有 prompt。
  - 将泄露源码中的具体实现细节写成本站直接事实。
  - 对 Anthropic 内部未发布 roadmap 做确定性判断。

## Decisions

- 2026-06-20: Skeleton created.
- 2026-06-20: 采用三层证据：官方文档/当前包为一手事实；新闻和安全报道用于泄露事件事实；第三方逆向和泄露分析只作为“公开分析主张”。
- 2026-06-20: 继续沿用 `data/source_targets.json` 中对 Claude Code npm 包 `*.map` 的排除策略，不把 source map 或泄露源码纳入仓库。
- 2026-06-20: 本页先做综述和架构地图，后续可拆成 prompt 构造、hooks 权限、subagent/context 三个更深专题。

## Current Next Step

Run generated files, validation, tests, and site build.
