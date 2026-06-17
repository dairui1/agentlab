import { GitCompareArrows, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';

const examples = [
  {
    id: 'agent-loop',
    label: 'Agent loop',
    oldVersion: '2026-06-01',
    newVersion: '2026-06-17',
    lines: [
      ['same', 'You are an agent that helps users modify codebases.', 'You are an agent that helps users modify codebases.'],
      ['changed', 'Before editing, inspect relevant files.', 'Before editing, inspect relevant files and existing project conventions.'],
      ['added', '', 'Use a short plan when the task touches multiple modules.'],
      ['same', 'Run focused validation before final response.', 'Run focused validation before final response.'],
      ['changed', 'Summarize changed files.', 'Summarize behavior changes, validation, and remaining risk.'],
    ],
  },
  {
    id: 'tools',
    label: 'Tool policy',
    oldVersion: '2026-06-01',
    newVersion: '2026-06-17',
    lines: [
      ['same', 'Use repository search before broad file reads.', 'Use repository search before broad file reads.'],
      ['removed', 'Prefer shell commands for all file changes.', ''],
      ['added', '', 'Use patch-based edits for manual file changes.'],
      ['changed', 'Ask before destructive actions.', 'Never run destructive actions unless explicitly requested.'],
      ['same', 'Keep unrelated worktree changes intact.', 'Keep unrelated worktree changes intact.'],
    ],
  },
  {
    id: 'communication',
    label: 'Communication',
    oldVersion: '2026-06-01',
    newVersion: '2026-06-17',
    lines: [
      ['changed', 'Be concise.', 'Be concise, but report concrete validation results.'],
      ['same', 'Avoid exposing hidden reasoning.', 'Avoid exposing hidden reasoning.'],
      ['added', '', 'During long tasks, provide brief progress updates.'],
      ['same', 'Final answers should focus on outcome and next steps.', 'Final answers should focus on outcome and next steps.'],
    ],
  },
];

function countKind(lines, kind) {
  return lines.filter(([lineKind]) => lineKind === kind).length;
}

function lineKind(kind, side) {
  if (kind === 'added' && side === 'new') return 'added';
  if (kind === 'removed' && side === 'old') return 'removed';
  if (kind === 'changed') return 'changed';
  return 'same';
}

export default function PromptDiffViewer() {
  const [activeId, setActiveId] = useState(examples[0].id);
  const [filter, setFilter] = useState('all');
  const active = examples.find((example) => example.id === activeId) ?? examples[0];

  const visibleLines = useMemo(() => {
    if (filter === 'changed') {
      return active.lines.filter(([kind]) => kind !== 'same');
    }
    return active.lines;
  }, [active, filter]);

  return (
    <section className="agentlab-lab" aria-label="提示词版本左右 diff">
      <div className="agentlab-lab__header">
        <div className="agentlab-lab__title">
          <GitCompareArrows size={20} aria-hidden="true" />
          <div>
            <strong>提示词变化历史</strong>
            <span>把 prompt snapshot 转成可审查的左右 diff，方便追踪规则变化。</span>
          </div>
        </div>
        <div className="agentlab-lab__actions">
          <button
            className="agentlab-icon-button"
            type="button"
            title="重置视图"
            aria-label="重置视图"
            onClick={() => {
              setActiveId(examples[0].id);
              setFilter('all');
            }}
          >
            <RotateCcw size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="agentlab-lab__body">
        <div className="agentlab-diff-toolbar">
          <div className="agentlab-segmented" aria-label="选择提示词片段">
            {examples.map((example) => (
              <button
                key={example.id}
                type="button"
                data-active={example.id === activeId}
                onClick={() => setActiveId(example.id)}
              >
                {example.label}
              </button>
            ))}
          </div>

          <div className="agentlab-segmented" aria-label="选择 diff 过滤条件">
            <button type="button" data-active={filter === 'all'} onClick={() => setFilter('all')}>
              全部
            </button>
            <button type="button" data-active={filter === 'changed'} onClick={() => setFilter('changed')}>
              只看变化
            </button>
          </div>
        </div>

        <div className="agentlab-diff-grid">
          <DiffPane title={`旧版 · ${active.oldVersion}`} side="old" lines={visibleLines} />
          <DiffPane title={`新版 · ${active.newVersion}`} side="new" lines={visibleLines} />
        </div>

        <div className="agentlab-diff-summary">
          <span className="agentlab-chip">新增 {countKind(active.lines, 'added')}</span>
          <span className="agentlab-chip">删除 {countKind(active.lines, 'removed')}</span>
          <span className="agentlab-chip">修改 {countKind(active.lines, 'changed')}</span>
          <span className="agentlab-chip">未变 {countKind(active.lines, 'same')}</span>
        </div>
      </div>
    </section>
  );
}

function DiffPane({ title, side, lines }) {
  return (
    <div className="agentlab-diff-pane">
      <h3>{title}</h3>
      <div className="agentlab-diff-lines">
        {lines.map(([kind, oldText, newText], index) => {
          const text = side === 'old' ? oldText : newText;
          return (
            <div className="agentlab-diff-line" data-kind={lineKind(kind, side)} key={`${side}-${index}`}>
              <span>{index + 1}</span>
              <span>{text || ' '}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
