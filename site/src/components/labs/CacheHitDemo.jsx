import { Database, Gauge, RotateCcw, StepForward } from 'lucide-react';
import { useMemo, useState } from 'react';

const cacheBlocks = [
  {
    id: 'system',
    label: 'System / Developer contract',
    text: 'identity, editing rules, safety policy, response style',
  },
  {
    id: 'tools',
    label: 'Tool schemas',
    text: 'shell, apply_patch, browser, GitHub, filesystem constraints',
  },
  {
    id: 'repo',
    label: 'Repository context',
    text: 'README, pyproject, src/agentlab, research/prompts',
  },
  {
    id: 'task',
    label: 'Current user task',
    text: 'build a docs-like interactive AgentLab prototype',
  },
];

const scenarios = [
  {
    label: '同一任务继续追问',
    prompt: '把刚才的缓存演示再加一个指标说明',
    matched: ['system', 'tools', 'repo', 'task'],
    state: 'hit',
    score: 92,
    explanation: '稳定前缀和仓库上下文都复用，只追加少量新需求，最容易命中缓存。',
  },
  {
    label: '同仓库的新栏目',
    prompt: '新增一个页面解释 Agent 的工具权限模型',
    matched: ['system', 'tools', 'repo'],
    state: 'partial',
    score: 68,
    explanation: '系统约束、工具 schema、仓库上下文可复用，但当前任务块发生变化。',
  },
  {
    label: '换项目继续写',
    prompt: '去另一个仓库实现支付回调接口',
    matched: ['system', 'tools'],
    state: 'partial',
    score: 44,
    explanation: '模型仍可复用工具和行为契约，但项目上下文与任务上下文都变了。',
  },
  {
    label: '提示词和工具都改了',
    prompt: '在新的执行环境里重写整个 agent loop',
    matched: [],
    state: 'miss',
    score: 8,
    explanation: '稳定前缀被重排或替换，缓存键无法对齐，几乎等同于冷启动。',
  },
];

function getNextIndex(index) {
  return (index + 1) % scenarios.length;
}

export default function CacheHitDemo() {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = scenarios[activeIndex];
  const matchedSet = useMemo(() => new Set(active.matched), [active]);

  return (
    <section className="agentlab-lab" aria-label="缓存命中交互演示">
      <div className="agentlab-lab__header">
        <div className="agentlab-lab__title">
          <Database size={20} aria-hidden="true" />
          <div>
            <strong>缓存命中原理</strong>
            <span>观察 prompt 前缀、工具 schema、仓库上下文、当前任务如何影响命中率。</span>
          </div>
        </div>
        <div className="agentlab-lab__actions">
          <button
            className="agentlab-icon-button"
            type="button"
            title="切换到下一个场景"
            aria-label="切换到下一个场景"
            onClick={() => setActiveIndex(getNextIndex(activeIndex))}
          >
            <StepForward size={16} aria-hidden="true" />
          </button>
          <button
            className="agentlab-icon-button"
            type="button"
            title="重置场景"
            aria-label="重置场景"
            onClick={() => setActiveIndex(0)}
          >
            <RotateCcw size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="agentlab-lab__body">
        <div className="agentlab-cache-grid">
          <div className="agentlab-query-list" role="list" aria-label="缓存场景">
            {scenarios.map((scenario, index) => (
              <button
                className="agentlab-query"
                data-active={index === activeIndex}
                key={scenario.label}
                type="button"
                onClick={() => setActiveIndex(index)}
              >
                <strong>{scenario.label}</strong>
                <code>{scenario.prompt}</code>
                <span>{scenario.explanation}</span>
              </button>
            ))}
          </div>

          <div className="agentlab-result" aria-live="polite">
            <span className="agentlab-result__badge">
              <Gauge size={14} aria-hidden="true" />
              {active.state === 'hit' ? '高命中' : active.state === 'partial' ? '部分命中' : '未命中'}
            </span>

            <div className="agentlab-meter">
              <div className="agentlab-meter__bar" aria-hidden="true">
                <div
                  className="agentlab-meter__fill"
                  data-state={active.state}
                  style={{ width: `${active.score}%` }}
                />
              </div>
              <strong>{active.score}% estimated cache reuse</strong>
            </div>

            <div className="agentlab-cache-stack">
              {cacheBlocks.map((block) => (
                <div className="agentlab-cache-block" data-matched={matchedSet.has(block.id)} key={block.id}>
                  <strong>{matchedSet.has(block.id) ? '命中' : '失效'} · {block.label}</strong>
                  <code>{block.text}</code>
                </div>
              ))}
            </div>

            <p className="agentlab-note">
              这个组件不是精确模拟某个厂商实现，而是把开发 Agent 时经常遇到的缓存心智模型可视化。
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
