"""Normalize product terminology in user-facing AgentLab changelogs."""

from __future__ import annotations

import re
from typing import Any, Mapping


TERMINOLOGY_GUIDE = """术语统一使用英文产品写法：Edit Tool、Subagent、Multi-Agent、System Prompt、Runtime Prompt、Static Prompt、Prompt、Tool Call、Tool Definition、Tool Schema、Skill、Plugin、Hook、Sandbox、Workspace、Context、Slash Command、Function Calling、Structured Output、Checkpoint、Plan Mode、Code Mode、Terminal 和 Memory。AI 执行主体写 Agent，网络代理写 Proxy；持久对话任务写 Thread，运行、终端或授权会话写 Session。不要把这些固定术语翻译成中文。"""


_REPLACEMENTS = (
    # Resolve semantic exceptions before replacing the generic Agent term.
    ("网络代理服务器", "Network Proxy Server"),
    ("代理服务器", "Proxy Server"),
    ("网络代理绕过", "Network Proxy Bypass"),
    ("代理绕过", "Proxy Bypass"),
    ("网络代理", "Network Proxy"),
    ("系统代理", "System Proxy"),
    ("代理网络", "Proxy Network"),
    # Runtime sessions stay Session; persisted conversations and tasks use Thread.
    ("PTY 执行会话", "PTY Session"),
    ("PTY 会话", "PTY Session"),
    ("Bash 会话", "Bash Session"),
    ("Shell 会话", "Shell Session"),
    ("终端会话", "Terminal Session"),
    ("登录会话", "Login Session"),
    ("浏览器会话", "Browser Session"),
    ("无头会话", "Headless Session"),
    ("后台会话", "Background Session"),
    ("会话生命周期", "Session Lifecycle"),
    ("会话授权", "Session 授权"),
    ("会话内存态", "Session 内存态"),
    ("会话级", "Session 级"),
    ("会话内", "Session 内"),
    ("会话分叉", "Thread 分叉"),
    ("会话历史", "Thread 历史"),
    ("会话标题", "Thread 标题"),
    ("会话列表", "Thread 列表"),
    ("会话检索", "Thread 检索"),
    ("会话管理", "Thread 管理"),
    ("会话编排", "Thread 编排"),
    ("会话组织", "Thread 组织"),
    ("会话切换", "Thread 切换"),
    ("会话状态", "Thread 状态"),
    ("会话上下文", "Thread Context"),
    ("会话转录", "Thread Transcript"),
    ("会话目录", "Thread 目录"),
    ("会话对话框", "Thread 对话框"),
    ("会话体验", "Thread 体验"),
    ("会话恢复", "Thread 恢复"),
    ("恢复会话", "恢复 Thread"),
    ("新会话", "新 Thread"),
    ("父会话", "父 Thread"),
    ("主会话", "主 Thread"),
    ("子会话", "子 Thread"),
    ("跨会话", "跨 Thread"),
    ("多会话", "Multi-Thread"),
    ("远程会话", "Remote Thread"),
    ("多线程", "Multi-Thread"),
    ("主线程", "Main Thread"),
    ("父线程", "Parent Thread"),
    ("子线程", "Child Thread"),
    ("临时线程", "Temporary Thread"),
    ("远程线程", "Remote Thread"),
    ("实时线程", "Realtime Thread"),
    # Longest fixed product phrases come before their component terms.
    ("网络编辑工具", "Web Edit Tool"),
    ("编辑工具", "Edit Tool"),
    ("Edit 工具", "Edit Tool"),
    ("工具调用", "Tool Call"),
    ("工具定义", "Tool Definition"),
    ("工具架构", "Tool Schema"),
    ("工具Schema", "Tool Schema"),
    ("工具schema", "Tool Schema"),
    ("工具 Schema", "Tool Schema"),
    ("工具 schema", "Tool Schema"),
    ("系统提示词", "System Prompt"),
    ("系统提示", "System Prompt"),
    ("系统 prompt", "System Prompt"),
    ("系统 Prompt", "System Prompt"),
    ("运行时 System Prompt", "Runtime Prompt"),
    ("运行时 Prompt", "Runtime Prompt"),
    ("运行时主提示词", "Runtime Prompt"),
    ("运行时提示词", "Runtime Prompt"),
    ("运行时提示", "Runtime Prompt"),
    ("运行时 prompt", "Runtime Prompt"),
    ("静态提示词", "Static Prompt"),
    ("静态提示", "Static Prompt"),
    ("静态 prompt", "Static Prompt"),
    ("静态 Prompt", "Static Prompt"),
    ("提示词", "Prompt"),
    ("多智能体", "Multi-Agent"),
    ("多代理", "Multi-Agent"),
    ("子 agent", "Subagent"),
    ("子 Agent", "Subagent"),
    ("子代理", "Subagent"),
    ("斜杠命令", "Slash Command"),
    ("函数调用", "Function Calling"),
    ("结构化输出", "Structured Output"),
    ("检查点", "Checkpoint"),
    ("计划模式", "Plan Mode"),
    ("代码模式", "Code Mode"),
    ("技能", "Skill"),
    ("插件", "Plugin"),
    ("钩子", "Hook"),
    ("沙箱", "Sandbox"),
    ("工作区", "Workspace"),
    ("上下文", "Context"),
    ("终端", "Terminal"),
    ("记忆", "Memory"),
    ("推理强度", "Reasoning Effort"),
    ("推理 effort", "Reasoning Effort"),
    ("推理 token", "Reasoning Token"),
    ("IDE 扩展", "IDE Extension"),
    ("VSCode 扩展", "VS Code Extension"),
    ("VS Code 扩展", "VS Code Extension"),
    ("浏览器扩展", "Browser Extension"),
    ("命令行工具", "CLI Tool"),
    ("coding agent", "Coding Agent"),
    ("自研 agent", "自研 Agent"),
    ("线程", "Thread"),
    ("智能体", "Agent"),
    ("代理", "Agent"),
    ("会话", "Session"),
)

_CHANGELOG_TEXT_FIELDS = ("title", "summary", "highlights", "categories", "implications")
_SINGLE_TOKEN_TERMS = (
    "Subagent",
    "Checkpoint",
    "Workspace",
    "Terminal",
    "Sandbox",
    "Context",
    "Session",
    "Plugin",
    "Prompt",
    "Memory",
    "Thread",
    "Proxy",
    "Agent",
    "Skill",
    "Hook",
)
_ADJACENT_TERM_RE = re.compile(
    "(" + "|".join(_SINGLE_TOKEN_TERMS) + ")(?=" + "|".join(_SINGLE_TOKEN_TERMS) + ")"
)


def normalize_terminology(text: str) -> str:
    normalized = text
    for source, target in _REPLACEMENTS:
        normalized = normalized.replace(source, target)
    normalized = re.sub(r"(?<=[A-Za-z0-9])(?=[\u3400-\u9fff])", " ", normalized)
    normalized = re.sub(r"(?<=[\u3400-\u9fff])(?=[A-Za-z0-9])", " ", normalized)
    normalized = _ADJACENT_TERM_RE.sub(r"\1 ", normalized)
    return normalized


def normalize_changelog_record(value: Mapping[str, Any]) -> dict[str, Any]:
    normalized = dict(value)
    for field in _CHANGELOG_TEXT_FIELDS:
        item = normalized.get(field)
        if isinstance(item, str):
            normalized[field] = normalize_terminology(item)
        elif isinstance(item, list):
            normalized[field] = [
                normalize_terminology(entry) if isinstance(entry, str) else entry
                for entry in item
            ]
    return normalized
