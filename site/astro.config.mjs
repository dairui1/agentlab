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
            { label: 'Claude Code', link: '/agents/claude-code/' },
            { label: 'Codex', link: '/agents/codex/' },
            { label: 'Pi', link: '/agents/pi/' },
            { label: 'OpenCode', link: '/agents/opencode/' },
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
          items: [{ label: '内容生产流水线', link: '/operations/content-pipeline/' }],
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
