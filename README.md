# JEV · 地主牌局实验室

一个可部署为 Node.js 服务或 Docker 容器的三人斗地主完整牌局回放，用来展示 E-FlowCode Jev 结构化决策 API。项目仍可作为纯静态演示页面运行。

页面会发出一副 54 张牌，先进入三人轮流叫地主，再由最高叫分者拿到底牌，之后按正常出牌和过牌流程推进。叫分阶段会校验更高叫分；三家都不叫时自动重新发牌。三位玩家全部明牌，牌面会铺在各自座位旁；每位玩家头顶都有独立 Jev 判断卡，右侧日志会记录发牌、出牌、每回合三人判断、耗时与错误。

当前桌面端采用和风牌桌布局：左右玩家的明牌在各自侧边分栏展示，地主手牌在底部重叠铺开，中央保留牌权和底牌区域，Jev 判断与调用日志位于右侧玻璃面板。

出牌演示包含单张、对子、三张、三带一、三带二、顺子、连对、飞机、四带二、炸弹和王炸；跟牌时会校验牌型和长度，炸弹可以压制普通牌型，王炸最大。页面的“规则”面板可展开查看牌型和春天/反春条件。积分面板支持设置 1-100 的底分，叫分作为基础倍数，炸弹和王炸每次令倍率翻倍，春天或反春再翻倍；每位玩家座位上会显示本局得分和跨局累计分，重新发牌时累计分会保留。没有 API Key 时使用本地演示 Jev，但牌型选择仍按斗地主规则生成，方便完整回放一局。

## 本地运行

无需安装依赖。Windows 用户可以双击 `start.bat`，或在 PowerShell 中运行 `./start.ps1`；Linux、macOS 和 WSL 用户运行 `./start.sh`。脚本会检查 Node.js 版本、启动本地服务，并默认打开浏览器：

```powershell
./start.ps1
```

```bash
chmod +x start.sh  # 首次运行需要
./start.sh
```

不想自动打开浏览器时，PowerShell 使用 `./start.ps1 -NoBrowser`，Shell 使用 `NO_BROWSER=1 ./start.sh`。PowerShell 的 `-Restart` 会停止旧的 `server.mjs` 进程后重新启动，通常不需要手动查找并结束 PID。也可以直接使用 Node.js 内置模块启动本地服务和 API 代理：

```bash
node server.mjs
```

打开 <http://127.0.0.1:4173>。推荐把 Key 配置在服务端环境变量中；也可以在“连接设置”中临时填写 Key。没有 Key 时使用本地模拟响应，仍可完整播放；点击“自动播放”即可连续推进。

## API 配置

默认配置对应 E-FlowCode 文档：

- Endpoint：`https://www.e-flowcode.cc/v1/systemone`
- Model：`jev-1.13`
- 请求类型：同步 `POST JSON`
- 本地代理：`/api/jev`

服务端推荐使用 `JEV_API_KEY`。每回合页面只通过本地 `/api/jev` 路由提交当前玩家的一个独立请求；当前玩家完成叫分或出牌、牌局状态更新后，下一回合才请求下一位。请求只包含当前玩家的完整手牌，其他玩家只以姓名、角色和手牌数量等公开信息出现，不会把其他玩家的牌面发给当前 Jev。页面中的 API Key 输入只作为临时覆盖，不会写入仓库或 `localStorage`。

连接设置面板中的“保存设置”会把 Endpoint、Model、底分、玩家名称和代理地址保存到当前浏览器；API Key 始终只保留在当前页面内。

右侧 MODE 显示 `DEMO` 表示本地模拟、`PAGE` 表示当前页面带有临时 Key、`LIVE` 表示服务端环境变量已配置并通过本地代理调用。请求等待远程响应时，判断面板会显示“正在调用 Jev”。

页面中的 Jev 卡展示三方建议的“打什么、打法、风险与置信度”。真实 API 返回的建议用于展示和日志；牌局推进会再次对建议做本地合法性校验，避免出现不符合当前牌权的出牌。

## 前端结构

前端入口是 `src/main.js`，页面逻辑按职责拆分：

- `src/core/`：常量、共享牌局状态和 DOM 工具。
- `src/game/`：牌堆、牌型识别、出牌候选和牌局引擎。
- `src/api/jev.js`：Jev 请求、响应归一化和本地演示模式。
- `src/ui/render.js`：牌桌、Jev 卡、日志和积分面板渲染。
- `styles/`：基础、牌桌、面板、响应式和桌面覆盖样式；根目录的 `styles.css` 只是导入入口。

旧的单文件 `app.js` 已移除，浏览器直接加载 ES Module 入口。

### CORS 代理

浏览器直连远程 API 会遇到 CORS 预检限制。`server.mjs` 提供 `/api/jev` 同源服务端路由，服务端直接发起 HTTP 请求并转发 JSON 响应，不记录 Key。

复制 `.env.example` 为 `.env` 后填写 `JEV_API_KEY`，或者设置环境变量：

```powershell
$env:JEV_API_KEY = "your-key"
$env:JEV_TARGET = "https://your-endpoint.example.com/jev"
node server.mjs
```

## Docker 部署

```bash
docker build -t jev-landlords-lab .
docker run --rm -p 4173:4173 \
  -e JEV_API_KEY=your-key \
  jev-landlords-lab
```

服务默认监听 `0.0.0.0:4173`，也可以通过 `PORT`、`HOST`、`JEV_TARGET` 和 `JEV_MODEL` 覆盖。

## 云平台部署

Render、Railway、Fly.io 等支持 Node.js 或 Docker 的平台都可以直接部署本项目。启动命令使用 `node server.mjs`，把 `JEV_API_KEY` 配置为平台 Secret，并将服务端口设置为平台提供的 `PORT`。

## GitHub Pages

1. 新建 GitHub 仓库并推送项目文件。
2. 打开 **Settings → Pages**。
3. Source 选择 **Deploy from a branch**，选择 `main` 和 `/ (root)`。
4. GitHub Pages 适合发布纯静态演示；要启用真实 Jev 调用，请把 Node/Docker 服务部署到支持后端运行的平台。

本次会话中的真实 Key 没有写入文件；演示后建议在控制台轮换该 Key。

## 参考

- [Jev 决策 API 文档](https://e-flowcode.cc/docs/setup/jev-api)
