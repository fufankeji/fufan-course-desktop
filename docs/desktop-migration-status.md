# 桌面版迁移状态

## 当前版本目标

保留旧版 `course-llm-wiki-demo` 源码不动，新建 `fufan-course-desktop`，作为后续交付给学员的一键安装版本基础。

## 已迁移能力

- 课程前端：`frontend/`
- 本地后端 API：`backend/server/`
- 课程知识库：`backend/knowledge/`
- 课程导入：`/api/import/*`
- 知识库检索与问答：`/api/search`、`/api/chat`
- DeepSeek 模型配置：`/api/settings/model`
- DeepSeek 连通测试：`/api/settings/model/test`
- SQLite 本地配置库：`backend/data/settings.sqlite`
- Skills 运行包：`backend/runtime-packs/`
- 赋范智能体控制台/TUI：`backend/runtime/bin/codewhale-tui`
- 课节工具栏：问 AI、参考资料、常见问题、我的笔记
- Tauri/Rust 桌面壳：`src-tauri/`
- 桌面打包资源准备：`scripts/desktop-package.mjs`
- Tauri CLI 入口解析：`scripts/tauri-runner.mjs`
- 打包资源运行态自检：`scripts/release-smoke.mjs`
- 生产模式 Node sidecar 启动：`src-tauri/src/main.rs`
- 桌面打包环境自检：`npm run desktop:doctor`
- Windows 构建说明：`docs/windows-build.md`
- 桌面安装包 CI 草案：`.github/workflows/desktop-build.yml`

## 已验证

- `npm test`：41 个测试通过
- 前端页面可由新版本服务返回
- `/api/health` 可用
- `/api/skill-packs` 可读取能力包
- `/api/terminal/status` 可找到新目录下的 TUI 二进制
- `/api/settings/model/test` 可真实调用 DeepSeek
- `/api/chat` 可真实调用 DeepSeek，返回 `mode: deepseek`
- `npm run prepare:desktop` 可生成 Tauri resources 与 Node sidecar
- `src-tauri/resources/` 不包含 `backend/data` 或 `settings.sqlite`
- `cargo check` 可通过 Rust/Tauri 编译检查
- `npm run desktop:doctor` 可识别 Rust、Tauri CLI、resources 和 Node sidecar 状态
- 已真实生成 macOS DMG：`src-tauri/target/release/bundle/dmg/赋范空间大模型学习平台_0.1.0_aarch64.dmg`
- 已挂载 DMG 验证：App 内包含主程序、Node sidecar、课程前后端资源、知识库、Skills 和 FuFan Agent/TUI runtime，且不包含 `settings.sqlite`
- 已验证项目脚本 `npm run desktop:build:mac` 可完成 macOS DMG 构建
- 已增加 Windows sidecar 防误用校验：Windows 目标必须显式提供 `node.exe`，不能把 macOS/Linux Node 改名为 `.exe`
- 已用官方 Node.js v24.16.0 Windows x64 分发包生成 `fufan-node-x86_64-pc-windows-msvc.exe`，并验证 `file` 识别为 Windows PE32+ 可执行文件
- 已验证 `TAURI_TARGET_TRIPLE=x86_64-pc-windows-msvc npm run desktop:doctor` 在 Windows sidecar 维度为全绿
- 已尝试在 macOS 上触发 Windows NSIS 构建入口，当前失败点为缺少 `x86_64-pc-windows-msvc` Rust target；正式 Windows 包仍建议在 Windows 构建机完成构建和安装验证
- 已验证 `npm run release:smoke`：从 `src-tauri/resources` 复制临时 runtime 后，前端、知识库、Skill 包、FuFan Agent runtime、问答 fallback 和 SQLite 配置均可在临时目录工作
- 已新增手动触发的 GitHub Actions workflow，用 macOS runner 构建 DMG、Windows runner 构建 NSIS artifact

## 当前架构

第一阶段采用 Tauri 桌面壳 + Node 后端兼容层：

```text
Tauri/Rust Shell
  -> 首次启动复制打包资源到用户本地数据目录
  -> 启动内置 Node sidecar
  -> 打开 http://127.0.0.1:5178

Node Backend
  -> 课程导入
  -> 知识库索引
  -> SQLite 配置
  -> DeepSeek 问答
  -> Skills/TUI 会话
```

这样可以先保证现有课程平台功能不丢，再逐步把稳定的后端能力迁移为 Rust command 或 Rust service。

## 打包注意事项

- `backend/data/settings.sqlite` 可能包含模型密钥，不能进入学生安装包。
- Tauri 资源来自 `src-tauri/resources/`，由 `npm run prepare:desktop` 生成；该目录包含服务代码、知识库、Skills、TUI 二进制和前端，不包含 `backend/data/`。
- Node sidecar 来自 `src-tauri/binaries/fufan-node-<target-triple>`，由 `npm run prepare:desktop` 生成，不提交到源码。
- macOS DMG 正式分发需要 Apple Developer 证书和 notarization。
- Windows NSIS 安装包正式分发建议做代码签名，否则可能出现 SmartScreen 提醒。
- TUI 二进制约 148MB，是安装包体积的主要来源。
- Windows 安装包需要在 Windows 构建机上提供对应 Node `.exe`，或通过 `NODE_BIN` 与 `TAURI_TARGET_TRIPLE` 指定交叉构建 sidecar。
- Windows 构建机操作说明见 `docs/windows-build.md`。
- 当前机器已通过临时 Tauri CLI 完成 macOS DMG 测试构建；常规开发环境仍建议执行 `npm install` 安装 `@tauri-apps/cli`，以便直接使用 `npm run desktop:*`。

## 下一步

1. 安装 Tauri CLI 到项目开发环境，执行 `npm run desktop:doctor` 确认环境完整。
2. 执行 `npm run desktop:dev` 做桌面开发模式验证。
3. 在干净 macOS 机器安装 DMG，验证导入课件、配置模型、问答、打开 Skills/TUI 控制台。
4. 在 Windows 构建机执行 `npm run desktop:build:win` 生成 NSIS 测试包。
5. 正式分发前补齐 macOS notarization 与 Windows 代码签名。
