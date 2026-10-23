/**
 * Client dictionaries for the shell settings row.
 *
 * ONE TABLE per locale, and both must carry the same keys: `en` is the complete
 * set (a key missing from `zh` falls through to it), and the host re-renders the
 * row when the language changes, so a key present in one and absent in the other
 * shows as English inside a Chinese page.
 *
 * `shell.current` is the FAILURE sentence's sibling: it names the resolved kind
 * without the path. The path is deliberately not shown in the row — it is detail
 * the user did not ask for, and a machine path reads like a warning.
 */
export const en = {
  'shell.title': 'Default shell',
  'shell.hint': 'Which interpreter runs shell commands.',
  'shell.mode': 'Shell mode',
  'shell.mode.auto': 'Automatic',
  // The user's own wording for the option. Which BUILD ran (7 vs 5.1) is a
  // detail the row does not show; the tool result names it per call.
  'shell.mode.pwsh': 'Windows PowerShell',
  'shell.mode.gitbash': 'Git Bash',
  'shell.current': '{kind} · {path}',
  'shell.notFound': 'No shell resolved',
  'shell.kind.gitbash': 'Git Bash',
  'shell.kind.posix-bash': 'bash',
  'shell.kind.pwsh': 'PowerShell 7',
  'shell.kind.windows-powershell': 'Windows PowerShell 5.1',
  'shell.reason.gitbash-not-found': 'Git Bash not found. Install Git for Windows, or set DSH_GIT_BASH.',
  'shell.reason.pwsh-not-found': 'PowerShell not found. Install PowerShell 7 or Windows PowerShell.',
  'shell.reason.no-shell-for-platform': 'Windows PowerShell is only available on Windows.',
  'shell.reason.no-shell-found': 'No usable shell was found. Install Git for Windows, or set DSH_GIT_BASH.',
  // The tool card's header: the reference names the action, not the tool.
  'run.done': 'Ran a command',
  'run.running': 'Running a command',
  'run.stopped': 'Stopped running the command',
  'run.copy': 'Copy command',
  // The trajectory entrance in the command box's corner. Named for what the
  // user gets, not for the mechanism ("inspect" reads like a developer verb).
  'run.inspect': 'View in trajectory',
}

export const zh = {
  'shell.title': '默认 shell',
  'shell.hint': '用哪个解释器执行 shell 命令。',
  'shell.mode': 'Shell 模式',
  'shell.mode.auto': '自动',
  'shell.mode.pwsh': 'Windows PowerShell',
  'shell.mode.gitbash': 'Git Bash',
  'shell.current': '{kind} · {path}',
  'shell.notFound': '没有解析到 shell',
  'shell.kind.gitbash': 'Git Bash',
  'shell.kind.posix-bash': 'bash',
  'shell.kind.pwsh': 'PowerShell 7',
  'shell.kind.windows-powershell': 'Windows PowerShell 5.1',
  'shell.reason.gitbash-not-found': '没找到 Git Bash。请安装 Git for Windows，或设置 DSH_GIT_BASH。',
  'shell.reason.pwsh-not-found': '没找到 PowerShell。请安装 PowerShell 7 或 Windows PowerShell。',
  'shell.reason.no-shell-for-platform': 'Windows PowerShell 只在 Windows 上可用。',
  'shell.reason.no-shell-found': '没有可用的 shell。请安装 Git for Windows，或设置 DSH_GIT_BASH。',
  'run.done': '已运行命令',
  'run.running': '正在运行命令',
  'run.stopped': '已停止运行命令',
  'run.copy': '复制命令',
  'run.inspect': '在轨迹中查看',
}
