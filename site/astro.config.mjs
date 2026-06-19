import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://dairui1.github.io',
  base: '/agentlab',
  integrations: [
    react(),
    starlight({
      title: 'AgentLab',
      description: '开发 Agent 过程中学到的工程知识、研究记录和交互实验。',
      logo: {
        src: './src/assets/logo.svg',
        alt: 'AgentLab',
      },
      customCss: ['./src/styles/custom.css'],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/dairui1/agentlab' }],
      sidebar: [
        {
          label: '开始',
          items: [{ autogenerate: { directory: 'start' } }],
        },
        {
          label: '书籍目录',
          items: [
            { label: 'Agent 工程手册', link: '/book/' },
            { label: '阅读路线', link: '/book/reading-guide/' },
            { label: '来源索引', link: '/book/sources/' },
          ],
        },
        {
          label: '基础篇',
          items: [
            { label: 'Agent 工程地图', link: '/foundations/agent-engineering-map/' },
            { label: 'Agent Loop', link: '/foundations/agent-loop/' },
          ],
        },
        {
          label: '工程知识',
          items: [
            { label: '工具', link: '/tools/' },
            { label: '环境', link: '/environments/' },
            { label: '提示词', link: '/prompts/' },
            { label: '上下文', link: '/context/' },
            { label: '缓存', link: '/caching/' },
          ],
        },
        {
          label: '机制篇',
          items: [
            { label: '工具协议', link: '/mechanisms/tool-protocol/' },
            { label: '权限与沙箱', link: '/mechanisms/permissions-sandbox/' },
            { label: '上下文与记忆', link: '/mechanisms/context-memory/' },
            { label: '提示词版本化', link: '/mechanisms/prompt-versioning/' },
            { label: '评测与回归', link: '/mechanisms/evaluation-regression/' },
          ],
        },
        {
          label: '四个 Agent',
          items: [
            {
              label: 'Claude Code',
              items: [
                { label: '总览', link: '/agents/claude-code/' },
                { label: '扩展层', link: '/agents/claude-code/extension-layer/' },
                { label: '权限与 Auto Mode', link: '/agents/claude-code/permissions-auto-mode/' },
                { label: '记忆与项目规则', link: '/agents/claude-code/memory-project-rules/' },
                { label: '提示词与工具契约', link: '/agents/claude-code/prompt-tool-contract/' },
                { label: '云端与本地边界', link: '/agents/claude-code/cloud-local-boundary/' },
              ],
            },
            {
              label: 'Codex',
              items: [
                { label: '总览', link: '/agents/codex/' },
                { label: '沙箱与审批', link: '/agents/codex/sandbox-approvals/' },
                { label: 'AGENTS.md 与定制层', link: '/agents/codex/customization-stack/' },
                { label: 'MCP 与自动化', link: '/agents/codex/mcp-automation/' },
                { label: '提示词表面', link: '/agents/codex/prompt-surfaces/' },
                { label: '审查与 CI 工作流', link: '/agents/codex/review-ci-workflows/' },
              ],
            },
            {
              label: 'Pi',
              items: [
                { label: '总览', link: '/agents/pi/' },
                { label: '关系型上下文', link: '/agents/pi/relational-context/' },
                { label: '人格与安全边界', link: '/agents/pi/persona-safety/' },
                { label: '数据与隐私', link: '/agents/pi/data-privacy/' },
                { label: '工具调用设计', link: '/agents/pi/tool-calling-design/' },
              ],
            },
            {
              label: 'OpenCode',
              items: [
                { label: '总览', link: '/agents/opencode/' },
                { label: 'Agents 与权限', link: '/agents/opencode/agents-permissions/' },
                { label: 'Provider 与模型抽象', link: '/agents/opencode/providers-models/' },
                { label: 'Server、LSP 与 SDK', link: '/agents/opencode/server-lsp-sdk/' },
                { label: '配置与项目规则', link: '/agents/opencode/config-project-rules/' },
                { label: '会话、分享与审计', link: '/agents/opencode/sessions-sharing-audit/' },
              ],
            },
          ],
        },
        {
          label: '实践篇',
          items: [
            { label: '建立 Agent 研究笔记', link: '/practices/research-notebook/' },
            { label: '设计一个编码 Agent', link: '/practices/build-coding-agent/' },
            { label: 'Prompt Diff 工作流', link: '/practices/prompt-diff-workflow/' },
            { label: '权限评审清单', link: '/practices/permission-review-checklist/' },
          ],
        },
        {
          label: '实战手册',
          items: [
            { label: '威胁建模', link: '/playbooks/threat-model/' },
            { label: 'MCP Server 设计', link: '/playbooks/mcp-server-design/' },
            { label: '上下文预算', link: '/playbooks/context-budget/' },
            { label: '缓存策略', link: '/playbooks/cache-strategy/' },
            { label: '评测数据集', link: '/playbooks/evaluation-dataset/' },
            { label: '多 Agent 协作', link: '/playbooks/multi-agent-handoff/' },
            { label: '来源保鲜', link: '/playbooks/source-freshness/' },
            { label: '文档发布', link: '/playbooks/docs-publishing/' },
          ],
        },
        {
          label: '附录',
          items: [
            { label: '术语表', link: '/appendix/glossary/' },
            { label: '提示词分类', link: '/appendix/prompt-taxonomy/' },
            { label: '工具风险分类', link: '/appendix/tool-risk-taxonomy/' },
            { label: '研究问题库', link: '/appendix/research-questions/' },
            { label: '路线图', link: '/appendix/roadmap/' },
          ],
        },
        {
          label: '对比篇',
          items: [
            { label: '能力矩阵', link: '/comparison/matrix/' },
            { label: '设计模式', link: '/comparison/patterns/' },
          ],
        },
        {
          label: '运营',
          items: [
            { label: '内容生产流水线', link: '/operations/content-pipeline/' },
            { label: '源码同步机制', link: '/operations/source-sync/' },
          ],
        },
        {
          label: '实验室',
          items: [
            { label: '缓存命中演示', link: '/labs/cache-hit-demo/' },
            { label: '提示词 Diff', link: '/labs/prompt-diff-viewer/' },
          ],
        },
      ],
    }),
  ],
});
