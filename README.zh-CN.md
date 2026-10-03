# MacUI —— 为 qBittorrent 打造的 macOS 风格 WebUI

[English](README.md) · **简体中文**

> ### ⚠️ 本项目 100% 由 AI 构建
>
> 本仓库中的每一行代码、文档和配置,都由 AI 编程代理编写,而提出需求的维护者
> **本人不会编程**。请把这当作对你所获得之物的一份说明:
>
> - **它已被维护者用于日常生产环境**,并且是针对真实的 qBittorrent 版本开发的,
>   而非纸上谈兵。
> - **它没有经过人类程序员的审查。** 因此可能存在人类审查者本会发现的问题。
> - **它不提供任何担保**(MIT 协议,见[许可](#许可))。
>
> 非常欢迎提交问题报告、纠正和 PR。如果你发现了问题,你不是在添麻烦 ——
> 你就是这个项目一直缺少的那位审查者。

一个完整的 qBittorrent 替代 WebUI,采用 macOS 的视觉语言:毛玻璃、圆角、
真实的层次感,以及从手机到桌面都能**真正自适应**的布局 —— 而不是简单地等比缩小。

它**不是 CSS 皮肤**。qBittorrent 的「替代 WebUI」机制会提供一个完全独立的前端,
因此界面得以从头设计,而不必靠 `!important` 与原有样式搏斗。

| 主界面 | 搜索 | RSS |
| --- | --- | --- |
| ![主界面](docs/screenshots/dashboard.png) | ![搜索](docs/screenshots/search.png) | ![RSS](docs/screenshots/rss.png) |

<p align="center">
  <img src="docs/screenshots/mobile-dashboard.png" alt="手机端主界面" height="420">
  <img src="docs/screenshots/mobile-torrents.png" alt="手机端种子列表" height="420">
</p>

![主界面](docs/screenshots/dashboard.png)

---

## 目录

- [功能特性](#功能特性)
- [环境要求](#环境要求)
- [安装](#安装)
- [配置](#配置)
- [更新](#更新)
- [卸载](#卸载)
- [常见问题](#常见问题)
- [开发](#开发)
- [架构说明](#架构说明)
- [项目结构](#项目结构)
- [参与贡献](#参与贡献)
- [许可](#许可)

---

## 功能特性

### 界面

- **macOS 视觉语言** —— 通过 `backdrop-filter` 实现毛玻璃面板、连续圆角、
  分层阴影,以及完整的深色/浅色两套配色。
- **自适应布局** —— 三个断点(`<600px`、`600–1023px`、`≥1024px`)。
  桌面端是侧边栏,平板是折叠图标栏,手机是底部标签栏 + 卡片式列表。
  不是把桌面界面缩小。
- **中英双语** —— 简体中文与英文,可运行时切换。
- **可安装为应用** —— 带有 Web App Manifest 和 Service Worker,
  在桌面和手机上都能像原生应用一样运行。

### 种子管理

- 实时列表,支持排序、筛选、多选,由 `sync/maindata` 增量更新驱动。
- 单种子详情页:概览、文件(含单文件优先级)、连接、Tracker。
- 支持磁力链接、`.torrent` 链接与文件上传三种添加方式。
- 暂停、开始、强制校验、强制汇报、重命名、设置分类、标签、设置位置、
  队列位置、顺序下载、首尾分块优先。
- 删除种子,可选是否同时删除已下载数据,并带二次确认。

### RSS

- 完整的订阅源树,支持任意层级的文件夹嵌套。
- 每个文件夹汇总未读数;**上次抓取失败**的订阅源会显示错误标记。
- 文章列表支持一键下载与标记已读。
- 自动下载规则,支持启用开关与匹配文章预览。

### 搜索

- 基于插件的搜索,覆盖所有已启用插件,可按插件选择分类。
- 结果表格支持排序,显示大小、做种、下载、发布时间,并可一键下载。
- 插件管理:从网址安装、启用/停用、检查更新。

### 设置

- **8 个分组、共 150 项偏好设置**,调用与官方 WebUI 相同的接口。
- 所有可选设置均经过**无损往返**校验 —— 详见[架构说明](#无损的设置往返)。
- 独立的凭据面板,用于修改 WebUI 用户名与密码。

### 值得一提的正确性细节

- **每一项设置都经过可逆性校验。** 任何无法在一次「保存 → 重新加载」后保持
  不变的值,都会被当作 bug 处理,而不是当成显示层面的小事。
- **服务端给出的单位按原样使用。** 刷新间隔的单位是毫秒;
  当成秒会让实时更新冻结 25 分钟。详见[架构说明](#架构说明)。

---

## 环境要求

### 运行本主题

- **qBittorrent 4.5 或更高版本。** 开发与测试基于 5.2.2。
  明确不支持更早的版本。
- **任意现代浏览器。** 受 `backdrop-filter` 限制,最低为
  Safari 16+、Firefox 103+、Chrome 76+、Edge 79+。

### 自行编译

- **Node.js ≥ 20.19** —— Vite 6 的要求。
- **pnpm ≥ 9** —— 不支持 `npm` 和 `yarn`;安装钩子与 lockfile 均基于 pnpm。

**部署时并不需要 Node.js**:预编译的静态文件发布在 `dist` 分支上。
详见[安装](#安装)。

---

## 安装

两种方式,任选其一。

### 方式 A —— 使用预编译文件(无需 Node.js)

推荐大多数人使用。如果你的 qBittorrent 主机上没有 JavaScript 工具链,
这是唯一可行的方式。

**1. 把预编译文件下载到运行 qBittorrent 的机器上。**

```bash
git clone --branch dist --single-branch \
  https://github.com/OWNER/macui-qbittorrent.git macui-qbittorrent
```

`dist` 是一个每次发布都重建的**孤儿分支**,所以**绝对不要 `git pull`** ——
必须用 reset(见[更新](#更新))。

**2. 记下该文件夹的绝对路径。**

你在 qBittorrent 中填写的路径,必须是**包含** `public/` 和 `private/`
的那一层文件夹 —— 而不是这两个目录本身。

```
macui-qbittorrent/
├── private/     <- 真正的界面
├── public/      <- 未登录时的入口页
└── README.md
```

**3. 让 qBittorrent 使用它。**

不要手动编辑 `qBittorrent.conf`,请通过 WebUI 操作:

1. 打开 qBittorrent 自带的 WebUI,进入 **选项 → WebUI**。
2. 勾选 **使用替代 WebUI(Use alternative WebUI)**。
3. 把 **文件路径(Files location)** 设为第 2 步的路径。
4. 保存,然后刷新页面。

如果你用 Docker 运行 qBittorrent,第 3 步填的是**容器内**的路径,
因此该文件夹必须被挂载进容器。见[配置](#配置)。

### 方式 B —— 从源码编译

**1. 安装工具链。**

```bash
# 需要 Node 20.19+
node --version

# 通过 corepack 启用 pnpm(Node 自带,无需 root)
corepack enable
corepack prepare pnpm@latest --activate
```

如果 corepack 不可用,改用官方安装脚本:

```bash
curl -fsSL https://get.pnpm.io/install.sh | sh -
exec $SHELL -l
```

在 Debian/Ubuntu 上,原生模块可能还需要 `build-essential`。

**2. 编译。**

```bash
git clone https://github.com/OWNER/macui-qbittorrent.git
cd macui-qbittorrent
pnpm install
pnpm build
```

`pnpm install` 会同时安装一个 git 钩子(见[开发](#开发))。

**3. 部署 `dist/`。**

编译产物 `dist/public/` 和 `dist/private/` 正是 qBittorrent 要求的布局。
把 `dist/` 复制到 qBittorrent 进程可读的任意位置,并把
**文件路径** 指向包含 `public/` 与 `private/` 的那层文件夹。

---

## 配置

### Docker(LinuxServer.io 镜像)

本项目的开发环境就是 LinuxServer 镜像。唯一要紧的是:该文件夹必须在容器内
有一个确定的可见路径。

```yaml
services:
  qbittorrent:
    image: lscr.io/linuxserver/qbittorrent:latest
    container_name: qbittorrent
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Etc/UTC
      - WEBUI_PORT=8080
    volumes:
      - /path/to/config:/config
      - /path/to/downloads:/downloads
      # 把主题挂在配置目录旁边,容器重建后不会丢失
      - /path/to/macui-qbittorrent:/config/macui-qbittorrent
    ports:
      - 8080:8080
      - 6881:6881
      - 6881:6881/udp
    restart: unless-stopped
```

然后把 **文件路径** 填为**容器内**路径:

```
/config/macui-qbittorrent
```

并写入配置文件,使该设置可复现:

```ini
[Preferences]
WebUI\AlternativeUIEnabled=true
WebUI\RootFolder=/config/macui-qbittorrent
```

> **切换后不需要重启容器。** qBittorrent 会在该偏好变更时立即重新读取,
> 新界面在下次刷新页面时就会出现。如果替换了磁盘上的文件,而浏览器缓存了
> 旧版本,则强制刷新(`Ctrl+Shift+R`)通常就够了。

### 反向代理

本主题是纯静态文件,任何代理都能用。两点提醒:

- **子路径部署需谨慎。** 资源路径是相对路径,所以 `https://host/qbt/` 可用,
  但代理必须原样转发路径。
- **`backdrop-filter` 不需要特殊响应头**;但如果你过滤了 CSP,
  请保留 `style-src 'unsafe-inline'` —— Vue 会在运行时注入组件样式。

---

## 更新

### 预编译(`dist` 分支)

`dist` 分支是一个**每次发布都从头重建的孤儿分支**。它的历史与上一版故意没有
关联,所以 `git pull` 会报告分支分叉并失败。请始终用 reset:

```bash
cd /path/to/macui-qbittorrent
git fetch origin dist
git reset --hard origin/dist
```

然后强制刷新页面。只有当你的环境存在刷新也清不掉的缓存时,才需要重启容器。

### 从源码更新

```bash
cd macui-qbittorrent
git pull
pnpm install
pnpm build
# 把 dist/ 覆盖到部署目录
```

**更新后一定要强制刷新。** 应用注册了 Service Worker,浏览器可能仍在提供
旧版本。手机端可能还需要清除站点数据。

---

## 卸载

1. 在 qBittorrent 中进入 **选项 → WebUI**,取消勾选 **使用替代 WebUI**。
2. 保存并刷新,官方 WebUI 会立即恢复。
3. 如果不再需要,删除主题文件夹即可。

**不需要重启容器**,你的设置、种子和会话都不受影响 ——
本主题只替换了前端文件。

> 如果你因为界面损坏而无法进入 WebUI 取消勾选,请编辑 `qBittorrent.conf`,
> 把 `WebUI\AlternativeUIEnabled` 设为 `false`,然后重启容器。

---

## 常见问题

### 页面空白,或返回 404

几乎总是 **文件路径**填错了。它必须是**包含** `public/` 和 `private/`
的那层文件夹。填成 `private/` 本身,或填成主题文件夹的上一级,都会导致这个现象。

在运行 qBittorrent 的机器上确认布局:

```bash
ls /path/to/macui-qbittorrent
# 必须能看到:public  private
```

### 卡在登录页,回不到官方 WebUI

本主题只替换了 `private/index.html`,官方 WebUI 依然存在:
在 选项 → WebUI 中取消勾选 **使用替代 WebUI** 即可;
或把 `qBittorrent.conf` 里的 `WebUI\AlternativeUIEnabled` 设为 `false` 后重启。

### 密码明明正确,却提示「用户名或密码错误」

先试一次强制刷新(`Ctrl+Shift+R`)。如果这样就好了,说明浏览器之前在用缓存的旧版本。

如果仍然不行,那多半是另一个原因:检查你的 qBittorrent 是否启用了 **IP 封禁**,
以及你的地址是否因为多次失败而被临时封禁。临时封禁返回的是 HTTP 403,
而不是凭据错误 —— 本主题会明确区分并提示这种情况。

### 改了主题却看不到变化

Service Worker 仍在提供旧版本。请强制刷新,手机端请清除站点数据。
这是最常见的「没效果」反馈,而且几乎从来都不是本主题的 bug。

### 搜索没有结果

有两种截然不同的原因,本主题会把它们区分开:

- **没有安装任何插件。** qBittorrent 默认**不带任何**搜索插件。
  请打开 **搜索 → 管理插件**,从
  [官方插件列表](https://github.com/qbittorrent/search-plugins/wiki/Unofficial-search-plugins)
  中安装。
- **没有 Python。** 搜索引擎通过 Python 运行插件。缺少时 `search/start`
  会返回 HTTP 409,本主题会明确说明。在 LinuxServer 镜像中,请在容器内安装
  Python 并重启。

### 累计下载/上传显示为 0

该问题已在 0.2.0 修复。如果你仍然看到 0,说明你运行的是旧版本,请更新。

### 毛玻璃效果不对或完全没有

`backdrop-filter` 需要较新的浏览器;在某些 Linux 环境下还需要合成器。
Firefox 103 之前、Safari 16 之前的版本会渲染成平面的面板。

---

## 开发

```bash
pnpm install     # 安装依赖并激活 git 钩子
pnpm dev         # 开发服务器 http://localhost:5173
pnpm build       # 类型检查 → 编译 → 整理为 dist/public + dist/private
pnpm test        # 单元测试
pnpm lint        # ESLint
pnpm typecheck   # 仅运行 vue-tsc
```

### 可用脚本

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | Vite 开发服务器,带 HMR。 |
| `pnpm build` | 类型检查 → 编译 → 整理产物 → 校验布局。 |
| `pnpm test` | Vitest 单元测试。 |
| `pnpm lint` / `pnpm lint:fix` | ESLint。 |
| `pnpm format` | Prettier。 |
| `pnpm verify:dist` | 用编译产物回放 qBittorrent 的路径解析规则。 |
| `pnpm verify:entry` | 在 jsdom 中驱动未登录入口页。 |
| `pnpm verify:settings` | 断言设置页布局没有回归。 |
| `pnpm publish:dist` | 重建并推送 `dist` 分支。 |

### 让开发服务器指向 qBittorrent

Vite 会代理 `/api`,因此可以直接对接真实实例开发:

```ts
// vite.config.ts
server: {
  proxy: {
    '/api': {
      target: 'http://YOUR_QBITTORRENT:8080',
      changeOrigin: true,
    },
  },
},
```

用 `--webui-port=8080` 启动 qBittorrent(或用 Docker 端口映射),运行
`pnpm dev`,通过被代理的接口登录即可。浏览器只与开发服务器通信,
因此不存在 CORS 问题。

### 关于 git 钩子

`pnpm install` 会运行 `scripts/install-hooks.mjs`,把 `core.hooksPath` 指向
`hooks/`。在 `main` 分支上,当一次提交改动了编译输入时,它会在本地重建
`dist` 分支,使预编译文件不会落后于源码。它从不阻止提交,也从不推送。
如需跳过某一次:

```bash
SKIP_DIST_SYNC=1 git commit ...
```

---

## 架构说明

### 为什么用替代 WebUI

qBittorrent 的**替代 WebUI** 机制会提供一个完整独立的前端。这意味着结构可以
被设计,而不是被覆盖 —— 这正是「看起来有意为之的主题」与「靠 `!important`
勉强拼凑的主题」之间的区别。代价是:它只在使用经典 WebUI 时生效,
因为它**就是**那个界面被替换掉了。

### 目录布局契约

这是最容易踩坑的地方,值得精确说明。根据 qBittorrent 的 `webapplication.cpp`,
一个请求会被解析为:

```
<root>/<session ? "private" : "public">/<requested path>
```

由此产生三个结论:

1. **入口文档位于 `private/index.html`。** 已登录用户请求 `/` 时,
   得到的就是 `private/index.html`。
2. **`public/` 必须存在**,它存放未登录页面。没有会话的访问者只可能被从
   `public/` 提供服务,因此登录表单必须放在那里 —— 它不能是一个跳转到
   `private/` 的重定向。
3. **`private/index.html` 不能通过 `/private/index.html` 访问。**
   服务器自己会加上 `private/` 前缀,于是该路径会解析为
   `private/private/index.html`,并不存在。

编译过程还会强制其他约束:不允许符号链接、单文件不超过 10 MiB、
资源只能使用相对路径。

`pnpm verify:dist` 会针对编译产物回放上述解析规则,任一环节不符即构建失败。

### 数据流

```
sync/maindata (增量,rid 游标)
        │
        ▼
  session store (Pinia)
        │
        ├── torrents Map、categories、tags
        └── server_state、transfer/info
```

轮询使用 qBittorrent 的 `rid` 游标:首次请求发送 `rid=0` 并获得完整快照,
之后的每次请求都发送上一次的 `rid`,只收到增量。store 负责合并这些增量,
这正是需要显式处理 `torrents_removed` / `categories_removed` /
`tags_removed` 的原因 —— 增量永远不会提到它没有改变的东西。

**`start()` 时游标总是重置为 0。** 在一次「停止 → 启动」之后复用旧游标,
服务器会以增量回应,而增量不会报告客户端离线期间被删除的种子,
于是列表中会残留过期条目。

### 轮询间隔用的是服务端给的值,单位是毫秒

`server_state.refresh_interval` 的**单位是毫秒**(默认 1500)。服务端由
`session->refreshInterval()` 赋值,官方 WebUI 直接把它交给 `setTimeout`。
若把它当成秒,轮询间隔会变成 25 分钟 —— 第一帧快照出来之后,
界面就会悄无声息地不再更新。

### 累计数据在两个接口里都有

`server_state` 就是 `getTransferInfo()` 再加上几个字段,因此累计数据从
`sync/maindata` 和 `transfer/info` **都能拿到**。store 里的 `stat()` 先查
`server_state`、再回退 `transfer`,两种布局都安全。

(本项目早期版本曾声称这些字段只存在于其中一个接口。那是错的 ——
当时显示 0 的真正原因是上面那个单位 bug。把这段错误结论保留在这里,
是因为它是个很容易被再次想到的解释。)

### 暂停/恢复在协议层叫 `stop`/`start`

`torrents/pause` 和 `torrents/resume` 在 qBittorrent 5.0 中被移除,
换成了 `torrents/stop` 和 `torrents/start`,没有保留别名。
API 按名字解析 `<action>Action`,找不到就返回 404。
界面上仍然叫「暂停/恢复」,因为对用户来说状态就叫这个名字。

同样的改名也适用于添加种子:5.x 读的是 `stopped`,不是 `paused`。

### 无损的设置往返

设置页由一份包含 150 个字段的 schema 生成。有两条规则保证了它的安全:

1. **取值必须逐字节可逆。** 每个字段都通过
   `fromApi(toApi(v)) === v` 的往返来校验。这抓到了一个真实的 bug:
   某个 `bytesPerSec` 字段在显示时除以 1024、保存时再乘回去,
   悄悄把 `10` 变成了 `0` —— 对 99.9% 的输入都不可逆。
2. **未知键会被保留。** 设置表单只提交它认识的项,但绝不会丢弃它不理解的
   偏好设置,因此打开设置页不会降级你的配置。

`pnpm verify:settings` 会守护布局,防止回归。

### 响应式策略

三个断点:`<600px`、`600–1023px`、`≥1024px`,且只在唯一一处
(`useBreakpoint`)解析。组件读取该结果,而不是各自去判断媒体查询 ——
这正是桌面、平板与手机三套布局不会逐渐走样的原因。

---

## 项目结构

```
├── index.html                  # Vite 入口,最终成为 private/index.html
├── static-public/              # 未登录页面,最终成为 public/index.html
├── public/                     # 图标、manifest 源文件
├── src/
│   ├── api/                    # 按 qBittorrent 接口分区,一个模块一块
│   ├── components/             # base/ 基础组件,torrent/ 业务组件
│   ├── composables/            # useBreakpoint、useToast、useTheme、useTorrentFilter
│   ├── config/                 # 设置 schema、分区布局、可写键清单
│   ├── i18n/                   # en 与 zh-CN 语言包
│   ├── layouts/                # AppLayout:侧边栏、图标栏、底部标签栏
│   ├── router/                 # hash 路由与登录守卫
│   ├── stores/                 # session store(同步、轮询、派生状态)
│   ├── types/                  # 接口类型
│   ├── utils/                  # 格式化工具
│   ├── views/                  # 主界面、种子详情、搜索、RSS、设置…
│   └── __tests__/              # Vitest 测试
├── scripts/                    # 构建、校验与工具脚本
├── hooks/                      # 纳入版本管理的 git 钩子(经 core.hooksPath 激活)
└── deploy/                     # 随 dist 分支一起发布的部署说明
```

### 设计令牌

所有颜色、间距、圆角与阴影值都是 CSS 自定义属性,集中定义在一处。
浅色与深色主题只交换这些令牌的值,没有任何组件知道当前是哪个主题。
这正是毛玻璃表面能在两种主题下都正常、而无需逐组件覆盖的原因。

---

## 参与贡献

非常欢迎贡献,尤其是**纠错**。由于本项目由 AI 构建,
由人类来审查其中的逻辑,是你所能提供的最有价值的东西。

### 提交 PR 之前

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify:dist
```

五项必须全部通过。

### 测试理念

修 bug 时,请添加一个**在没有该修复时会失败**的测试。然后重新注入该 bug,
确认测试确实失败,以验证它不是空转的。本仓库中有若干守护性测试,
直到做了这一步检查才发现它们其实毫无作用 ——
其中一个甚至断言的调度次数,却从未真正制造出会导致失败的那个竞态。

### 报告问题

请附上:

- qBittorrent 版本,以及你的运行方式(Docker 镜像、原生安装等)
- 浏览器及其版本
- 你期望的结果、实际发生的事情,以及确切的操作步骤
- 浏览器控制台输出

### 范围

以下内容按设计不在范围内:支持 4.5 之前的 qBittorrent 版本,
以及任何需要修改 qBittorrent 本身的功能。

---

## 许可

[MIT](LICENSE)。

qBittorrent 本身以 GPL-2.0-or-later 单独授权。本项目是一个通过 HTTP 调用其
WebAPI 的独立前端,不包含任何 qBittorrent 源代码。侧边栏中的品牌标识复刻了
官方 qBittorrent 图标的字形轮廓,以便主题具有辨识度;
该图形作品的版权仍归 qBittorrent 项目所有。

### 致谢

- qBittorrent 项目,提供了 API,以及本主题所沿用的图标字形。
- macOS 人机界面指南,提供了本主题所模仿的视觉语言。
