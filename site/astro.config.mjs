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
