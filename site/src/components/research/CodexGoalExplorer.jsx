import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleDot,
  Database,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  TimerReset,
  UserRound,
  Waypoints,
  Wrench,
} from 'lucide-react';
import { useMemo, useState } from 'react';

const states = [
  { id: 'active', label: 'active', text: '自动续跑' },
  { id: 'paused', label: 'paused', text: '用户暂停' },
  { id: 'blocked', label: 'blocked', text: '无法推进' },
  { id: 'usage_limited', label: 'usage_limited', text: '额度限制' },
  { id: 'budget_limited', label: 'budget_limited', text: '目标预算耗尽' },
  { id: 'complete', label: 'complete', text: '已完成' },
];

const modelTools = [
  {
    id: 'get_goal',
    label: 'get_goal',
    control: '模型可调用',
    effect: '只读当前 ThreadGoal、预算和累计用量',
  },
  {
    id: 'create_goal',
    label: 'create_goal',
    control: '模型可调用',
    effect: '明确要求时创建 active goal',
  },
  {
    id: 'update_goal',
    label: 'update_goal',
    control: '模型可调用',
    effect: '只能写 complete 或 blocked',
  },
];

const scenarios = [
  {
    id: 'create',
    label: '创建目标',
    icon: Play,
    actor: '模型工具',
    tool: 'create_goal',
    from: 'none / complete',
    to: 'active',
    activeStates: ['active'],
    activeTools: ['create_goal'],
    call: 'insert_thread_goal(thread_id, objective, active, token_budget)',
    guard: '只能在用户或 system/developer 明确要求时创建；objective 非空且最多 4,000 字符。',
    runtime: '写入 thread_goals，标记当前 turn goal active，发出 ThreadGoalUpdatedEvent。',
    steering: '下一轮可通过 continuation steering 继续追这个 objective。',
  },
  {
    id: 'read',
    label: '查看目标',
    icon: CircleDot,
    actor: '模型工具',
    tool: 'get_goal',
    from: 'any',
    to: 'same',
    activeStates: [],
    activeTools: ['get_goal'],
    call: 'get_thread_goal(thread_id)',
    guard: '无状态迁移，只返回 objective、status、token_budget、tokens_used、time_used_seconds。',
    runtime: '不会启动新 turn，也不会改变预算。',
    steering: '模型用它做当前状态核对，而不是凭聊天记忆判断完成。',
  },
  {
    id: 'continue',
    label: '空闲续跑',
    icon: RefreshCw,
    actor: 'runtime hook',
    tool: 'continue_if_idle',
    from: 'active',
    to: 'active',
    activeStates: ['active'],
    activeTools: [],
    call: 'thread.try_start_turn_if_idle([continuation_steering])',
    guard: '只有工具可见、thread 存在、当前 goal 仍是 active 才启动。',
    runtime: 'thread resume / idle 读取 thread_goals，注入 InternalModelContextFragment。',
    steering: 'completion audit 和 blocked audit 随目标一起注入，防止过早结束。',
  },
  {
    id: 'complete',
    label: '标记完成',
    icon: CheckCircle2,
    actor: '模型工具',
    tool: 'update_goal',
    from: 'active / budget_limited',
    to: 'complete',
    activeStates: ['complete'],
    activeTools: ['update_goal'],
    call: 'account_thread_goal_usage(...); update_thread_goal(status=complete)',
    guard: '必须证明所有要求、文件、测试、门槛和交付物都已满足。',
    runtime: '先累计当前 turn 的用量，再清除 current turn goal，发出 ThreadGoalUpdatedEvent。',
    steering: '如果 goal 有 token budget，工具返回会要求报告最终 token 使用量。',
  },
  {
    id: 'blocked',
    label: '标记阻塞',
    icon: AlertTriangle,
    actor: '模型工具',
    tool: 'update_goal',
    from: 'active',
    to: 'blocked',
    activeStates: ['blocked'],
    activeTools: ['update_goal'],
    call: 'account_thread_goal_usage(...); update_thread_goal(status=blocked)',
    guard: '同一阻塞需连续至少 3 个 goal turn 重复出现，并且没有可继续推进的路径。',
    runtime: '停止 active goal，避免自动续跑在同一错误上循环消耗 token。',
    steering: '困难、慢、不确定、想问问题，都不足以标记 blocked。',
  },
  {
    id: 'pause',
    label: '暂停/恢复',
    icon: Pause,
    actor: '用户或宿主',
    tool: 'GoalService.set_thread_goal',
    from: 'active / paused',
    to: 'paused / active',
    activeStates: ['active', 'paused'],
    activeTools: [],
    call: '/goal pause 或 /goal resume',
    guard: '模型工具不能 pause、resume 或 clear；这些状态由用户和宿主控制。',
    runtime: '恢复为 active 时会重新标记 idle goal，并尝试 continue_if_idle。',
    steering: '如果 objective 被编辑，会注入 objective_updated steering，要求转向新目标。',
  },
  {
    id: 'budget',
    label: '预算触顶',
    icon: TimerReset,
    actor: '系统记账',
    tool: 'account_thread_goal_usage',
    from: 'active',
    to: 'budget_limited',
    activeStates: ['budget_limited'],
    activeTools: [],
    call: 'tokens_used + token_delta >= token_budget',
    guard: '预算状态由存储层计算，不由模型主动声明。',
    runtime: 'tool finish hook 发现 budget_limited 后，向当前 turn 注入 budget limit steering。',
    steering: '要求模型停止新增实质工作，收尾总结进展、剩余工作和下一步。',
  },
  {
    id: 'usage',
    label: '额度限制',
    icon: AlertTriangle,
    actor: '系统错误',
    tool: 'stop_active_goal_for_turn',
    from: 'active / budget_limited',
    to: 'usage_limited',
    activeStates: ['usage_limited'],
    activeTools: [],
    call: 'CodexErrorInfo::UsageLimitExceeded',
    guard: 'usage limit 和普通任务完成无关，是运行环境限制。',
    runtime: '记录进度后把 active goal 停到 usage_limited。',
    steering: '等待用户或宿主恢复，而不是模型继续自动消耗。',
  },
];

function nextIndex(index) {
  return (index + 1) % scenarios.length;
}

function stateRole(stateId, active) {
  if (active.to === stateId) return 'to';
  if (active.from.includes(stateId)) return 'from';
  if (active.activeStates.includes(stateId)) return 'related';
  return 'idle';
}

export default function CodexGoalExplorer() {
  const [activeId, setActiveId] = useState(scenarios[0].id);
  const activeIndex = scenarios.findIndex((scenario) => scenario.id === activeId);
  const active = scenarios[activeIndex] ?? scenarios[0];
  const activeToolSet = useMemo(() => new Set(active.activeTools), [active]);
  const ActiveIcon = active.icon;

  return (
    <section className="agentlab-lab agentlab-goal" aria-label="Codex goal 状态机和工具解释器">
      <div className="agentlab-lab__header">
        <div className="agentlab-lab__title">
          <Waypoints size={20} aria-hidden="true" />
          <div>
            <strong>/goal 内部路径</strong>
            <span>选择一个事件，观察谁能触发、调用哪层接口、状态如何变化。</span>
          </div>
        </div>
        <div className="agentlab-lab__actions">
          <button
            className="agentlab-icon-button"
            type="button"
            title="切换到下一个事件"
            aria-label="切换到下一个事件"
            onClick={() => setActiveId(scenarios[nextIndex(activeIndex)].id)}
          >
            <RefreshCw size={16} aria-hidden="true" />
          </button>
          <button
            className="agentlab-icon-button"
            type="button"
            title="重置"
            aria-label="重置"
            onClick={() => setActiveId(scenarios[0].id)}
          >
            <RotateCcw size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="agentlab-lab__body">
        <div className="agentlab-goal__layout">
          <div className="agentlab-goal__events" aria-label="选择 goal 事件">
            {scenarios.map((scenario) => {
              const Icon = scenario.icon;
              return (
                <button
                  className="agentlab-goal-event"
                  data-active={scenario.id === active.id}
                  key={scenario.id}
                  type="button"
                  onClick={() => setActiveId(scenario.id)}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{scenario.label}</span>
                  <code>{scenario.tool}</code>
                </button>
              );
            })}
          </div>

          <div className="agentlab-goal__main">
            <div className="agentlab-goal-states" aria-label="ThreadGoalStatus 状态">
              {states.map((state) => (
                <div className="agentlab-goal-state" data-role={stateRole(state.id, active)} key={state.id}>
                  <strong>{state.label}</strong>
                  <span>{state.text}</span>
                </div>
              ))}
            </div>

            <div className="agentlab-goal-trace" aria-live="polite">
              <div className="agentlab-goal-trace__headline">
                <span>
                  <ActiveIcon size={18} aria-hidden="true" />
                  {active.label}
                </span>
                <code>{active.from} → {active.to}</code>
              </div>

              <div className="agentlab-goal-pipeline" aria-label="执行链路">
                <TraceStep icon={active.actor === '模型工具' ? Bot : UserRound} label="触发者" value={active.actor} />
                <TraceStep icon={Wrench} label="工具/API" value={active.tool} />
                <TraceStep icon={Database} label="状态写入" value={active.call} />
                <TraceStep icon={Waypoints} label="运行时效果" value={active.runtime} />
              </div>

              <div className="agentlab-goal-detail">
                <div>
                  <strong>约束</strong>
                  <p>{active.guard}</p>
                </div>
                <div>
                  <strong>模型看到什么</strong>
                  <p>{active.steering}</p>
                </div>
              </div>
            </div>

            <div className="agentlab-goal-tools" aria-label="模型可见 goal 工具">
              {modelTools.map((tool) => (
                <div className="agentlab-goal-tool" data-active={activeToolSet.has(tool.id)} key={tool.id}>
                  <strong>{tool.label}</strong>
                  <span>{tool.control}</span>
                  <p>{tool.effect}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TraceStep({ icon: Icon, label, value }) {
  return (
    <div className="agentlab-goal-step">
      <span>
        <Icon size={15} aria-hidden="true" />
        {label}
      </span>
      <code>{value}</code>
    </div>
  );
}
