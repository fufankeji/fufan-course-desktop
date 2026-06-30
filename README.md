# 赋范空间 · 大模型学习平台桌面版

这是从 `course-llm-wiki-demo` 拆出的新版本目录，旧项目源码保留不动。

当前版本采用标准桌面化结构：

- `frontend/`：课程平台前端页面。
- `backend/server/`：本地课程后端，包含知识库、导入、问答、模型配置、Skills/TUI 控制台接口。
- `backend/knowledge/`：课程知识库与导入后的知识页。
- `backend/runtime-packs/`：课程配套 Skills/能力包。
- `backend/runtime/bin/`：本地调试可放置赋范智能体控制台运行二进制；正式源码仓库不提交该大文件。
- `vendor/codewhale-edu/`：FuFan Agent/TUI 源码，CI 会按 macOS/Windows 平台编译对应运行时并打进安装包。
- `backend/data/`：本机 SQLite 配置目录，默认不提交密钥数据库。
- `scripts/desktop-package.mjs`：桌面打包准备脚本，负责生成 Tauri 资源目录和 Node sidecar。
- `scripts/tauri-runner.mjs`：Tauri CLI 入口解析器，支持本地安装、全局安装或 `TAURI_CLI` 指定路径。
- `scripts/release-smoke.mjs`：从 Tauri resources 复制临时运行目录并验证打包资源可独立运行。
- `src-tauri/`：Tauri/Rust 桌面壳工程，用于后续打包 `.dmg` 和 Windows 安装包。

## 本地运行

```bash
npm run dev
```

默认地址：

```text
http://127.0.0.1:5178/
```

## 验证

```bash
npm test
npm run release:smoke
cargo check --manifest-path src-tauri/Cargo.toml
```

`release:smoke` 会模拟桌面 App 首次启动后的本地数据目录：从 `src-tauri/resources` 复制一份临时 runtime，验证前端、知识库、Skill 包、FuFan Agent runtime、问答 fallback 和 SQLite 配置都能在临时目录中工作。

## 打包方向

构建安装包前会自动执行：

```bash
npm run prepare:desktop
```

该命令会：

- 将 `frontend/`、`backend/server/`、`backend/knowledge/`、`backend/runtime-packs/` 和 TUI 二进制复制到 `src-tauri/resources/`。
- 将当前 Node 运行时复制成 Tauri sidecar：`src-tauri/binaries/fufan-node-<target-triple>`。
- 明确排除 `backend/data/settings.sqlite`，避免把本机 API Key 打进学生安装包。

源码仓库不提交 `codewhale-tui` 大二进制。打包前先编译运行时：

```bash
npm run runtime:build
```

`prepare:desktop` 会优先使用 `backend/runtime/bin/codewhale-tui`，如果不存在，则使用 `vendor/codewhale-edu/target/release/codewhale-tui`。Windows 构建时对应文件名为 `codewhale-tui.exe`。

安装 Tauri CLI 后可使用：

```bash
npm run desktop:build:mac
npm run desktop:build:win
```

打包前可以先做环境自检：

```bash
npm run desktop:doctor
```

自检会确认 Rust、Tauri CLI、Tauri resources 和 Node sidecar 是否就绪。当前机器如果提示缺少 Tauri CLI，先执行 `npm install` 安装 `@tauri-apps/cli`。
如需使用临时下载的 Tauri CLI，可设置 `TAURI_CLI=/path/to/tauri.js`；若该 CLI 不在标准 `node_modules` 结构中，同时设置 `NODE_PATH` 指向其临时依赖目录。

当前 macOS 测试包产物：

```text
src-tauri/target/release/bundle/dmg/赋范空间大模型学习平台_0.1.0_aarch64.dmg
```

该 DMG 已验证可挂载，内部包含 App、Node sidecar、课程前后端资源、知识库、Skills 和 FuFan Agent/TUI runtime，且不包含 `settings.sqlite`。

桌面 App 的生产模式会在启动时把打包资源复制到用户本地数据目录，然后自动启动本地课程后端；学员无需手动安装 Node 或手动启动服务。

macOS 正式分发 DMG 需要 Apple Developer 证书与 notarization；Windows 正式分发建议做代码签名，避免 SmartScreen 警告。
Windows 构建机说明见 [docs/windows-build.md](docs/windows-build.md)。
如果没有 Windows 电脑，可以在 GitHub Actions 中手动触发 `FuFan Course Desktop Build`，由 `windows-2022` runner 生成 NSIS `.exe` artifact。

注意：`backend/data/settings.sqlite` 是本机运行时生成的配置数据库，可能包含模型密钥。该目录不会进入 Tauri 资源清单，打包前也不要手动把它复制给学员。
