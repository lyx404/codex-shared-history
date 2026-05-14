# Codex Shared History Launcher

[中文](#中文) | [English](#english)

## 中文

在多个 Codex 账号模式或 model provider 之间共享同一份本地历史对话。

当你在个人 OpenAI 账号、公司 API、自定义 provider 之间切换时，Codex Desktop 可能会按 provider 元数据过滤左侧历史记录，导致旧对话看起来“消失”。这个启动器会在 Codex 启动前自动判断当前账号/provider 模式并同步本地历史元数据，让同一批本地对话显示在当前模式下。

### 功能

启动 Codex 前，启动器会：

- 更新 `~/.codex/state_5.sqlite`，让所有本地线程使用自动判断出的 provider
- 更新每个 rollout JSONL 文件第一行的 `session_meta.model_provider`，避免 Codex 启动时把 SQLite 索引重建回旧 provider
- 恢复左侧历史所需的 workspace root hints
- 展开被折叠的侧栏项目组
- 将 SQLite WAL 数据 checkpoint 到磁盘
- 打开 `/Applications/Codex.app`

备份会写入：

```text
~/.codex/history-share-backups/
```

### 安装

```bash
git clone <your-fork-url>
cd codex-shared-history
./install.sh
```

安装后的应用位置：

```text
~/Applications/Codex Shared History.app
```

### 使用

1. 使用 `Cmd+Q` 完整退出 Codex。
2. 打开 `Codex Shared History.app`。
3. 启动器会自动判断当前 provider 并同步历史。
4. 同步完成后，Codex 会自动打开。

在切换账号/provider 时，不建议直接打开原始 Codex app。请使用这个启动器，让同步发生在 Codex 读取侧栏状态之前。

### Provider 判断与手动覆盖

默认情况下，启动器会自动判断目标 provider：

- 优先使用 `~/.codex/config.toml` 当前的 `model_provider`
- 如果当前 provider 是 `openai`，则同步到 OpenAI 账号模式
- 如果配置缺失，才回退到 `openai`

如果自动判断不符合你的环境，可以手动覆盖。

启动器可识别的 provider 来源包括：

- `~/.codex/config.toml` 当前的 `model_provider`
- `[model_providers.*]` 中声明的 provider
- `openai`

你也可以手动补充 provider 名称：

```bash
CODEX_HISTORY_PROVIDERS="openai,my-company-api,custom" open "$HOME/Applications/Codex Shared History.app"
```

provider 名称需要与 Codex 在 `~/.codex/config.toml` 或 rollout 元数据里使用的 `model_provider` 值一致。

### 命令行用法

同步到 `config.toml` 当前 provider：

```bash
./scripts/open-codex-shared-history.sh --sync-only
```

同步到指定 provider：

```bash
./scripts/open-codex-shared-history.sh --provider openai --sync-only
./scripts/open-codex-shared-history.sh --provider my-company-api --sync-only
```

同步后打开 Codex：

```bash
./scripts/open-codex-shared-history.sh --provider openai
```

### 配置

环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `CODEX_HOME` | `~/.codex` | Codex home 目录 |
| `CODEX_CONFIG` | `$CODEX_HOME/config.toml` | Codex 配置文件 |
| `CODEX_STATE_DB` | `$CODEX_HOME/state_5.sqlite` | Codex 状态数据库 |
| `CODEX_GLOBAL_STATE` | `$CODEX_HOME/.codex-global-state.json` | Codex Electron 全局状态 |
| `CODEX_APP` | `/Applications/Codex.app` | Codex Desktop 应用路径 |
| `CODEX_HISTORY_PROVIDER` | 空 | 跳过自动判断，直接同步到指定 provider |
| `CODEX_HISTORY_PROVIDERS` | 空 | 逗号分隔的 provider 名称，用于补充手动选择列表 |
| `NODE_BIN` | 自动检测 | Node.js 可执行文件 |

### 注意事项

- 同步前必须完整退出 Codex。如果 Codex 已经在运行，启动器会跳过同步。
- 这个工具只修改本地 Codex 元数据，不会上传对话或 token。
- 这个工具不会合并云端账号历史；它只会让本地历史在当前或指定的本地 provider 下可见。
- 如果目标 provider 名称比 rollout 元数据里的原 provider 字符串更长，对应 rollout 会显示为 `provider-name-too-long`，不会被修改。必要时可在 `config.toml` 中使用更短的 provider alias。

### 卸载

删除启动器：

```bash
rm -rf "$HOME/Applications/Codex Shared History.app"
```

确认侧栏工作正常后，可以手动删除备份：

```bash
rm -rf "$HOME/.codex/history-share-backups"
```

## English

Share the same local Codex conversation history across multiple account modes or model providers.

When switching between a personal OpenAI account, a company API, or a custom provider, Codex Desktop may filter the left sidebar history by provider metadata. This can make previous conversations appear to disappear. This launcher detects the current account/provider mode and syncs local history metadata before Codex starts, so the same local conversations appear in the current mode.

### What It Does

Before opening Codex, the launcher:

- updates `~/.codex/state_5.sqlite` so all local threads use the detected provider
- updates the first `session_meta.model_provider` line of each rollout JSONL file, so Codex does not rebuild the SQLite index back to the old provider on startup
- restores workspace root hints used by the left sidebar
- expands collapsed sidebar project groups
- checkpoints SQLite WAL data to disk
- opens `/Applications/Codex.app`

Backups are written to:

```text
~/.codex/history-share-backups/
```

### Install

```bash
git clone <your-fork-url>
cd codex-shared-history
./install.sh
```

The app is installed to:

```text
~/Applications/Codex Shared History.app
```

### Usage

1. Quit Codex completely with `Cmd+Q`.
2. Open `Codex Shared History.app`.
3. The launcher detects the current provider and syncs history.
4. Codex opens after the sync finishes.

When switching account/provider modes, avoid opening the original Codex app directly. Use this launcher so the sync happens before Codex reads its sidebar state.

### Provider Detection And Manual Override

By default, the launcher detects the target provider automatically:

- it first uses the current `model_provider` from `~/.codex/config.toml`
- if the current provider is `openai`, it syncs to the OpenAI account mode
- if the config is missing, it falls back to `openai`

If auto-detection does not match your setup, you can override it manually.

Recognized provider names come from:

- the current `model_provider` from `~/.codex/config.toml`
- providers declared in `[model_providers.*]`
- `openai`

You can add your own provider names:

```bash
CODEX_HISTORY_PROVIDERS="openai,my-company-api,custom" open "$HOME/Applications/Codex Shared History.app"
```

Provider names must match the `model_provider` values Codex uses in `~/.codex/config.toml` or rollout metadata.

### CLI

Sync to the current provider from `config.toml`:

```bash
./scripts/open-codex-shared-history.sh --sync-only
```

Sync to a specific provider:

```bash
./scripts/open-codex-shared-history.sh --provider openai --sync-only
./scripts/open-codex-shared-history.sh --provider my-company-api --sync-only
```

Open Codex after syncing:

```bash
./scripts/open-codex-shared-history.sh --provider openai
```

### Configuration

Environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `CODEX_HOME` | `~/.codex` | Codex home directory |
| `CODEX_CONFIG` | `$CODEX_HOME/config.toml` | Codex config file |
| `CODEX_STATE_DB` | `$CODEX_HOME/state_5.sqlite` | Codex state database |
| `CODEX_GLOBAL_STATE` | `$CODEX_HOME/.codex-global-state.json` | Codex global Electron state |
| `CODEX_APP` | `/Applications/Codex.app` | Codex Desktop app path |
| `CODEX_HISTORY_PROVIDER` | empty | Skip auto-detection and sync to this provider |
| `CODEX_HISTORY_PROVIDERS` | empty | Comma-separated provider names to show in the manual chooser |
| `NODE_BIN` | auto-detected | Node.js binary |

### Notes

- Codex must be fully quit before syncing. The launcher skips sync if Codex is already running.
- The tool only edits local Codex metadata. It does not upload conversations or tokens.
- It does not merge cloud-side account history. It makes local history visible under the current or specified local provider.
- If a provider name is longer than the existing provider string in rollout metadata, that rollout is reported as `provider-name-too-long` and is not edited. Use a shorter provider alias in `config.toml` when possible.

### Uninstall

Remove the launcher app:

```bash
rm -rf "$HOME/Applications/Codex Shared History.app"
```

Backups can be removed manually after you are confident the sidebar is working:

```bash
rm -rf "$HOME/.codex/history-share-backups"
```
