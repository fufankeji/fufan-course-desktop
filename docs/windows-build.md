# Windows 打包说明

Windows 安装包目标是 NSIS `.exe`。建议在 Windows 构建机上构建，不建议在 macOS 上交叉打包正式包。

推荐交付方式是使用仓库内置的 GitHub Actions 工作流：

```text
.github/workflows/desktop-build.yml
```

在 GitHub 页面进入 **Actions → FuFan Course Desktop Build → Run workflow** 后，Windows job 会在 `windows-2022` runner 上构建 `codewhale-tui.exe`、`fufan-pty-bridge.exe`、Windows Node sidecar，并上传 NSIS `.exe` artifact。你不需要自己准备 Windows 电脑；但最终 Windows 安装包仍必须在 Windows runner 或 Windows 构建机上生成并验证。

## 前置条件

- Windows 10/11 构建机
- Rust stable toolchain
- Node.js 20+
- `npm install` 安装 `@tauri-apps/cli`
- 可选：代码签名证书，用于正式分发

## 构建命令

```powershell
npm ci
npm run desktop:doctor
npm run desktop:build:win
```

`npm run desktop:build:win` 会自动执行 `npm run prepare:desktop`，并生成：

- `src-tauri/resources/`：课程前端、后端、知识库、Skills 和 FuFan Agent runtime
- `src-tauri/binaries/fufan-node-x86_64-pc-windows-msvc.exe`：Windows Node sidecar

当前仓库工作区已用官方 Node.js v24.16.0 Windows x64 分发包生成过该 sidecar。它是构建产物，受 `.gitignore` 忽略；在新的 Windows 构建机上仍建议按下面命令重新生成一次。

## Windows Node Sidecar

Tauri 的 `externalBin` 要求 sidecar 文件名带目标 triple。Windows 构建必须使用 Windows 的 `node.exe`，不能把 macOS/Linux 的 Node 二进制复制后改名为 `.exe`。

脚本会主动阻止这种误用：

```powershell
$env:TAURI_TARGET_TRIPLE = "x86_64-pc-windows-msvc"
$env:NODE_BIN = "C:\Program Files\nodejs\node.exe"
npm run prepare:sidecars
```

如果 `NODE_BIN` 不是 `node.exe`，脚本会失败并提示提供 Windows Node executable。

在 macOS/Linux 上提前准备 Windows x64 sidecar 时，可以先下载官方 Windows Node zip，解压后执行：

```bash
TAURI_TARGET_TRIPLE=x86_64-pc-windows-msvc \
NODE_BIN=/path/to/node.exe \
npm run prepare:sidecars
```

## 验证清单

- `npm run desktop:doctor` 全部显示 `ok`
- `npm run desktop:build:win` 成功生成 NSIS 安装包
- `npm run runtime:build` 已在 Windows 构建机生成 `vendor/codewhale-edu/target/release/codewhale-tui.exe`
- 在干净 Windows 机器安装
- 打开 App 后能进入 `赋范空间 · 大模型学习平台`
- 能配置模型 API Key
- 能导入课件目录
- 能搜索知识库并向模型问答
- 能打开 FuFan Agent 控制台并创建当前课件 session
- 安装包内不包含老师本机的 `settings.sqlite`

## 正式分发

正式分发前建议对 Windows 安装包做代码签名，否则可能触发 SmartScreen 提醒。

## CI 构建

仓库已提供手动触发的 GitHub Actions 工作流：

```text
.github/workflows/desktop-build.yml
```

其中 Windows job 会在 `windows-2022` runner 上执行 `npm run desktop:build:win`，并上传 NSIS `.exe` artifact。

CI 会先执行：

```powershell
cargo build --manifest-path vendor/codewhale-edu/Cargo.toml --package codewhale-tui --bin codewhale-tui --release
```

然后运行 `npm run prepare:desktop` 和 `npm run desktop:doctor`，确认安装包里的前端、后端、课程资源、Windows TUI runtime、PTY bridge、Node sidecar 都已就绪。学员端不需要安装 Rust、Node 或任何开发环境。

如果 Windows job 成功，下载 artifact：

```text
fufan-course-desktop-windows-nsis
```

其中包含 `src-tauri/target/release/bundle/nsis/*.exe` 生成的安装包。

## macOS 交叉构建边界

已在 macOS 上尝试执行：

```bash
node scripts/tauri-runner.mjs build --target x86_64-pc-windows-msvc --bundles nsis --verbose
```

当前失败点为：

```text
Target x86_64-pc-windows-msvc is not installed
```

即使补装 Rust target，Windows NSIS 正式包仍需要 Windows 侧 linker、NSIS 和签名环境配合。课程交付建议采用 Windows 构建机做最终构建与安装验证。
