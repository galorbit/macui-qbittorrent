# AGENT.md — 项目维护指南

> 面向接手本项目的 AI Agent。**先读这份文件再动手。**
>
> 这里记录的是**实际踩过的坑**和**设计约束的成因**,不是重复 README 的功能介绍。
> 有几条规则看起来"多余",但它们都是拿真实故障换来的,删掉会重新引入 bug。

---

## 一、这个项目是什么

qBittorrent WebUI 的 **macOS 风格主题**(圆角 + 毛玻璃),自适应 PC 与移动端,
通过 qBittorrent 的 **"使用替代 WebUI"** 机制部署,面向 Docker
(`lscr.io/linuxserver/qbittorrent`)。

**完全自研**,不基于 VueTorrent,也不照搬官方 WebUI。技术栈:

| | |
|---|---|
| 框架 | Vue 3.5 + Vite 6 + TypeScript(strict) |
| 状态 | Pinia |
| 路由 | Vue Router,**hash history** |
| 国际化 | vue-i18n(英文 / 简体中文) |
| HTTP | axios |
| PWA | vite-plugin-pwa |
| 包管理 | **pnpm**(npm/yarn 会被 preflight 拒绝) |

---

## 二、三个分支 / 两条产物

| 分支 | 内容 | 用途 |
|---|---|---|
| `main` | 源码 | 开发 |
| `dist` | **仅编译产物**(孤立分支,47 文件 / ~522 KB) | 部署机直接 clone |

**部署机没有 Node.js 和 pnpm**,所以 `dist` 分支是必需的,不是可选优化。

### 自动化:提交后自动同步

**在 `main` 上提交后,`dist` 分支会自动重建**(通过 `hooks/post-commit`),
无需手动操作。push 仍然是显式动作:

```bash
git commit ...              # 触发自动重建(仅当构建输入变化)
git push origin main
git push --force origin dist   # dist 每次重建,必须强推
```

Hook 的几处刻意设计,**都不是多余的**,改动前请先读懂:

- **只在 `main` 上运行** —— 否则在 `dist` 上提交会递归触发
- **只在构建输入变化时运行** —— `src/ static/ static-public/ index.html
  vite.config.ts tsconfig.json package.json pnpm-lock.yaml` 及其子路径。
  只改文档不会白白重建
- **绝不阻断提交** —— 提交此时已经落盘,构建失败只报告、不报错,
  否则一次构建抖动就会"吃掉"一个提交
- **不自动 push** —— 静默推送是发布意外内容的好办法

临时跳过:`SKIP_DIST_SYNC=1 git commit ...`

Hooks 放在**版本化的 `hooks/` 目录**,通过 `core.hooksPath` 激活
(`pnpm install` 会自动安装)。放进 `.git/hooks` 的钩子是**未跟踪**的,
别人 clone 下来根本没有 —— 这种逻辑不该藏在那里。

### ⚠️ `publish-dist-branch.mjs` 的破坏性

它会**清空工作区**(仅保留 `.git`、`node_modules`、`.pnpm-store`、`.vite`)
再放入产物。这个操作在设计上是对的,但代价是**脚本自己也在被清空的目录里** ——
早期版本因此**把自己删了**,然后以 `MODULE_NOT_FOUND` 崩溃,
把工作区**遗留在孤立分支上**(源码和 `dist` 分支都不见了)。

现在它会在动工作区之前,**先把自身复制到临时目录再重新执行**。

由此得到的教训:**任何"清空工作区"的脚本,都必须假设自己随时会被删掉。**
另外 `finally` 块用 `checkout -f` 兜底,保证崩溃也能回到原分支。

---

## 三、⚠️ 最容易踩的坑(按危害排序)

### 1. 替代 WebUI 的路径解析规则

服务端 (`src/webui/webapplication.cpp`) 这样解析请求:

```
<root>/private/<请求路径>     有会话时
<root>/public/<请求路径>      无会话时;若有会话但 private 里没有,回退到 public
```

由此产生三条**必须遵守**的推论:

- **Files location 必须指向"包含 `public/` 和 `private/` 的那一层"**。
  指向 `private/` 会让服务端去找 `private/private/index.html`,直接报
  *"Unacceptable file type, only regular file is allowed."*
- **无会话时 `public/index.html` 就是唯一入口**。所以它**必须是一个真正的登录表单**,
  不能是跳转页 —— 无会话时任何路径都落到 `public/`,跳转页会跳到自己,形成死循环。
- **`manifest.start_url` 不能是目录**。写成 `"./"` 会解析到目录 `/private/`,
  触发上面那条报错。必须是 `"./index.html"`。

**`pnpm verify:dist` 会把上述规则对着构建产物重跑一遍**,改动产物结构后务必执行。

### 2. 登录接口的响应形态不止一种

`POST /api/v2/auth/login` 的成功响应**因构建版本而异**:

| 响应 | 含义 |
|---|---|
| `200` + body `"Ok."` | 成功(文档行为) |
| `204` + **空 body** | 成功(**实际遇到的就是这种**) |
| `200` + body `"Fails."` | **失败** —— 是 2xx,所以 body 仍要看 |
| `403` | 封禁,或拒绝 |

**判断成功必须以 HTTP 状态码为准,body 只用来否决。**
曾经的 bug:代码要求 body 严格等于 `"Ok."`,导致 204 的成功登录被报成
"用户名或密码错误",而 Ctrl+F5 却能直接进主界面(因为 Cookie 其实已经下发)。

`pnpm verify:entry` 覆盖了全部五种响应形态。

> **教训**:这个 bug 之所以躲过了测试,是因为我当初**假设**服务端返回
> `200 + "Ok."` 去写测试 —— 测试全绿,真实环境却挂。**测接口时不要把猜测当契约**,
> 要么查源码,要么把多种形态都测上。

### 3. 设置项的"往返恒等"是硬要求

设置页通过 `toApi(fromApi(服务端值))` 的往返结果来判断字段是否被修改。
**这个往返必须严格恒等**,否则字段一打开就显示"已修改"。

曾经同时存在三个成因,全都会导致"打开设置页就显示 28 项待保存":

- **数字枚举丢失类型** —— `fromApi` 为渲染 `<select>` 转成字符串,`toApi` 没转回来,
  服务端看到 `"0" !== 0`
- **字节单位粒度错误** —— 用 MiB 会把 10240 字节取整成 0(读成"已修改",保存时
  **真的写回 0**,静默改坏配置)。现在是 **KiB**
- **列表值类型错误** —— 服务端收发都是换行分隔的**字符串**,提交数组永远不相等

另外:**服务端未发送的键必须在 diff 时跳过**,不能被"改成我们的默认值"再写回去。

### 4. 设置项必须是真实可用的

按官方 WebUI 的做法是"能写就列出来",但那样会暴露大量**改了没有任何效果**的选项:

- `performance_warning`、`status_bar_external_ip`、`file_log_*`
  —— 只影响**桌面端 Qt GUI**,纯 WebUI 部署下改了等于没改
- `web_ui_port`、`web_ui_address`、`use_https`、`web_ui_host_header_validation_enabled`
  —— 改错了会**断开正在编辑的这个会话**,恢复需要进容器改配置文件

**加设置项前先确认它在 WebUI-only 部署下真的可见生效。**
`pnpm test` 里的 `settings-roundtrip.spec.ts` 会校验"不暴露服务端不可写的键"。

### 5. 符号链接与 10 MiB 上限

服务端**直接拒绝符号链接**,且单文件上限 10 MiB (`MAX_ALLOWED_FILESIZE`)。
`scripts/postbuild.mjs` 会校验这两条以及相对路径、favicon、`public/` 非空等,
**构建失败总比部署后报错好**。

### 6. `pnpm-workspace.yaml` 不能存在

它的**存在本身**就会让 pnpm 把项目当 workspace 根,报
`ERROR packages field missing or empty`。这个文件一旦被加进来,`pnpm install` 就废了。

### 7. Service Worker 缓存

应用注册了 Service Worker。**换产物后浏览器可能仍在用旧版本**,
表现为"改了没生效"。部署后必须 **Ctrl+F5**,移动端需要**清除站点数据**。
排查"代码明明改了却没变化"时,先怀疑这一条。

### 8. 全局统计:`server_state` 就是 `transfer/info` 的超集

**先纠正一个曾经写在这里的错误结论。** 早期版本声称"累计下载/上传/分享率
只存在于 `server_state`",并据此把侧栏显示 0 归因于读错了接口。**这是错的。**

看源码就清楚了 —— `sync/maindata` 的 `server_state` 是这么来的:

```cpp
// synccontroller.cpp
QVariantMap serverState = getTransferInfo();
serverState[KEY_TRANSFER_FREESPACEONDISK] = m_freeDiskSpace;
serverState[KEY_SYNC_MAINDATA_QUEUEING] = session->isQueueingSystemEnabled();
serverState[KEY_SYNC_MAINDATA_REFRESH_INTERVAL] = session->refreshInterval();
```

而 `getTransferInfo()` **自己就写入了** `alltime_dl`、`alltime_ul`、
`global_ratio`、`total_peer_connections`、`dht_nodes`、`connection_status`、
`dl_info_speed`、`last_external_address_v4/v6`。

所以:

- **两个接口都能拿到累计数据**,`server_state` 只是额外多了
  `free_space_on_disk`、`queueing`、`refresh_interval`。
- 从 `transfer/info` 读累计数据**是对的**,不会得到 `undefined`。

那当初侧栏为什么显示 0?**真正的原因是 `refresh_interval` 单位搞错了**
(见下一节),导致第一次快照之后就再也没刷新过,所以那些字段永远停在初始值。
把原因错误地归到"接口读错了",是**在没有对着源码验证的情况下**根据现象猜的结论。

`stat()` 仍然**先查 `server_state` 再回退 `transfer`**,这是稳妥的写法
(两者有交集,谁先都行),但**不要**再声称某一个接口独占某些字段。

**教训:字段属于哪个接口,去看 `synccontroller.cpp` 的 `getTransferInfo()`,
不要靠"哪个界面显示了什么"去反推。**

### 8.1 `refresh_interval` 的单位是毫秒(踩过,严重)

`server_state.refresh_interval` **是毫秒,不是秒**。

- 服务端:`syncData[...] = session->refreshInterval()`,默认 **1500**。
- 官方 WebUI:`serverSyncMainDataInterval = Math.max(serverState.refresh_interval, 500)`,
  然后直接交给 `setTimeout`,默认值就是 `1500`。

早期代码写了 `refresh_interval * 1000`。对着默认值 1500,轮询间隔就变成
**1,500,000 毫秒 = 25 分钟** —— 界面加载出第一帧快照后**再也不更新**:
进度条不动、速度不变、在别处删掉的种子仍然列在那里。

**为什么测试没发现:** 当时的测试夹具用的是 `refresh_interval: 1` 和 `3`,
乘 1000 之后是 1000 和 3000 毫秒,看起来完全正常。
**用不真实的数值做夹具,等于没测。** 现在的测试用 1500(真实默认值)
和 60000(边界值)。

**教训:凡是涉及单位的字段,夹具必须用真实默认值。**

### 9. RSS 的树形结构

`/api/v2/rss/items` 返回的是**嵌套对象而不是数组**,而且**文件夹和订阅源都是对象** ——
唯一的区分方式是**订阅源带 `url` 字段**
(对照源码 `Folder::toJsonValue` 与 `Feed::toJsonValue`)。

解析器 `parseRssItems()` 依赖这一点,并在遍历时**推导 `path`** ——
因为所有写操作接口都用 `path` 寻址,而不是 `uid`。
判断错了会把每个文件夹都当成一个假订阅源,在界面上看起来像是数据错乱。

另外 **`withData=false` 时服务端不返回 `title` 和 `articles`**,
所以解析器统一归一化成空数组,调用方不必判空。

### 10. 搜索依赖 Python,且默认没有插件
- `search/start` 在宿主机**没有 Python** 时返回 **409**("Python must be installed…")。
  这是环境问题不是 bug,界面上要单独说明,不要当成普通错误。
- **全新安装没有任何搜索插件**(`search/plugins` 返回 `[]`),此时搜索必然 0 结果。
  界面必须把"没有插件"和"没有结果"**区分开**,否则用户以为是搜索坏了。

`isPythonMissing()` 负责识别第一种情况。

### 11. qBittorrent 5.x 改过一批接口名(踩过)

**5.0 是一次破坏性改名**,而且**没有保留别名** ——
`APIController` 按名字直接解析 `<action>Action`,旧名字一律返回 404:

| 4.6 及以前 | 5.0 及以后 |
|---|---|
| `torrents/pause` | **`torrents/stop`** |
| `torrents/resume` | **`torrents/start`** |
| `torrents/add` 的 `paused` 参数 | **`stopped` 参数** |

`src/api/torrents.ts` 里的 `pauseTorrents` / `resumeTorrents` 函数名保留
(界面文案也是"暂停/恢复"),但**发出去的路径是 `stop` / `start`**。

**怎么确认一个接口名在当前版本是否存在:** 去
`src/webui/api/*controller.cpp` 找 `void XxxController::yyyAction()`,
`yyy` 就是路径。**不要**靠官方 WebUI 的界面文案反推接口名。

### 12. 轮询调度只能有一个入口(踩过)

`session.ts` 的 `schedule()` 是**唯一**设置 `timer` 的地方,并且**每次都会先
`clearTimeout`**;另有 `generation` 计数器,保证跨 `stop()`/`start()` 的
在途请求回来时**不能**再排下一次。

以前 `start()`、定时器回调、`refresh()` 各自调用 `schedule()`。
当 `refresh()` 撞上一个正在跑的定时器轮询时,**两条链会同时存在**:
后一个覆盖 `timer` 句柄,前一个成了孤儿 ——
`stop()` 只能取消其中一个,而且轮询频率会 2 倍、3 倍地叠加。

**写这类调度器时的通用规则:** 只允许一个函数拥有定时器句柄,
且它必须先清除旧句柄;用代号(generation)而不是布尔标志来作废在途请求。

### 13. 计算属性里不要写状态(踩过)

`useTorrentFilter.ts` 的 `counts` 曾经这样统计各筛选项的数量:
临时把 `filter.value` 改成候选值、算完再改回来。

**computed 的 getter 里写响应式状态是危险的。** 在 Vue 3.5 上,如果这个
computed 在渲染之外被读取(测试、watcher、devtools),会沿着
`notify → trigger → runIfDirty → refreshComputed → set value` 递归,
最后**栈溢出报 RangeError**;即使在渲染内,排队中的渲染也可能读到
中间态(`filter` 短暂变成 `'downloading'`)。

现在 `matchesFilter(torrent, candidate)` 接收候选值作为参数,是**纯函数**,
`counts` 不再碰 `filter.value`。**统计类计算一律走"把条件当参数传进去"。**

### 14. 在途请求必须校验身份(踩过)

两类都必须做,否则会显示**错误的数据**(比不显示更糟):

- **轮询**(SearchView):响应回来后要先比对
  `searchId.value !== id` 就丢弃。否则上一次搜索的迟到响应会覆盖新搜索的
  结果,而且如果它说 `Stopped`,还会**把新搜索的轮询也停掉**。
- **详情页切换**(TorrentDetailView):`loadTab` 用了自增的 `loadToken`。
  切换到另一个种子时组件被复用,旧请求的响应会落到新种子的
  「文件」页上,显示**上一个种子的文件列表**。

**规则:任何 await 之后要写状态的地方,先确认"我拿到的还是当前这份请求吗"。**

### 15. `v-for` 的 key 要真的唯一(踩过)

- `tracker.url` 不唯一 —— 同一个 tracker 可以合法地出现在多个 tier 里。
  用 `` `${tracker.url}:${tracker.tier}` ``。
- 搜索结果用 `fileUrl` 也不唯一 —— 两个引擎可能返回同一个磁力链接,
  而且 `:loading="downloading === row.fileUrl"` 会让**所有**同链接的行
  一起转圈。用 `engineName + fileUrl`。

### 16. 手机端的多选曾经完全进不去(踩过)

勾选框 `v-if="selectionMode"`,而能打开 `selectionMode` 的工具栏又是
`v-if="selectionMode && selected.size > 0"` —— **互相依赖,谁都进不去**。
桌面端因为表头有全选框所以没暴露,手机端则**所有批量操作都不可达**。

现在有两个入口,缺一不可:
- 仪表盘上手机端常显的「选择」按钮(可发现);
- 长按卡片 500ms 进入选择模式(触屏习惯)。

**加开关时检查一遍:打开它的控件本身是否也需要它是开的。**

---

## 四、目录结构

```
├── index.html                  # Vite 入口(成为 private/index.html)
├── static-public/index.html    # 无会话入口(成为 public/index.html)—— 真正的登录表单
├── static/icons/               # PWA 图标 / favicon
├── scripts/
│   ├── check-env.mjs           # preflight:拒绝旧 Node / 非 pnpm
│   ├── postbuild.mjs           # 重排为 public/ + private/ 并校验
│   ├── verify-public-entry.mjs # 用 jsdom 跑构建后的登录页(22 项检查)
│   ├── verify-dist-tree.mjs    # 重放服务端路径解析规则
│   ├── publish-dist-branch.mjs # 发布到 dist 分支
│   ├── read-schema-keys.mjs    # 从 schema 提取字段 key(见下)
│   ├── sync-settings-locales.mjs  # 同步设置项标签
│   └── snapshot-writable-keys.mjs # 快照服务端可写键
└── src/
    ├── api/            # WebAPI v2 封装
    ├── components/     # base/(通用组件) torrent/(业务组件)
    ├── composables/    # useBreakpoint、useTheme、useTorrentFilter、useToast
    ├── config/         # settings-schema.ts(150 项 / 8 组)、settings-sections.ts、writable-keys.json
    ├── i18n/           # locales/{en,zh-CN,settings}.ts
    ├── layouts/        # AppLayout.vue(导航壳)
    ├── stores/         # session(RD 增量同步)、auth
    ├── styles/         # tokens.css(设计令牌)、base.css、glass.css
    ├── types/          # api.ts
    └── views/          # Dashboard / TorrentDetail / Search / Rss / Settings / Login / About
```

---

## 四之二、README 截图(踩过两次)

截图由 `pnpm docs:shots`(`scripts/capture-docs-shots.mjs`)生成,
mock 数据由 `scripts/gen-prefs-fixture.mjs` 从 **schema 自动生成**。

### ⚠️ 曾经连续两次把**空白图**发到了 README

**第一次:`mobile-dashboard.png` 全白。**
原因是先设成桌面尺寸、加载页面,再**只改设备尺寸**到手机 —— 布局正在切换时截了图。

**第二次:`settings.png` 全白。**
原因是 mock 的 `app/preferences` **只有 4 个字段**。设置页加载成功,
但没有内容可渲染,于是画出一张空页面。

### 为什么两次都没被发现:验证是假的

当时的校验只问"页面上有没有文字"。**侧栏永远有文字**,所以两张空白图都通过了。
这是个**假阳性校验**,比没有校验更糟 —— 它让人以为检查过了。

### 现在怎么做的

1. **先设尺寸,再整页重载**(`about:blank` → 目标页)。
   hash 路由的 SPA 不会因为 hash 变化而重载文档,只改尺寸会截到旧帧。
2. **每张图单独声明必须出现什么**,并且在 `main` **作用域内**检查 ——
   侧栏和标签栏一直都在,不能算数:
   ```js
   { name: 'settings', expect: 'document.querySelectorAll("main .settings__tab").length >= 6' }
   ```
3. **轮询等待条件成立**(最多 6 秒),而不是固定 sleep 后直接截图。
   固定等待本质上是竞态,输的那次就写出一张空图。
4. **选择器必须从真实渲染中取得**,不能猜。
   第一版校验断言 `.settings__section`,而这个 class **根本不存在** ——
   设置页用的是 `.settings__tab` + `.sf`。

### mock 数据必须来自 schema

`gen-prefs-fixture.mjs` 解析 `settings-schema.ts`,**产出全部 150 个字段**。

手写 mock 时踩的坑,值得记住:

- 最初只写了 4 个字段 → 空白页。
- 改成"所有布尔都填 false" → 截图里开关全关、底部显示「有 52 项待保存」,
  把设置页展示成了一个**误导性的样子**。
- 解析 schema 时用 `[a-z0-9_]+` 匹配 key,**漏掉了 `banned_IPs`**
  (大写 IP),于是只得到 149/150 —— **又是同一类"夹具不完整"的 bug**。

**教训:凡是"用假数据渲染界面"的地方,夹具的完整性和真实性本身就是被测对象。
用 schema、类型或真实接口生成夹具,不要手写。**

**验证脚本反过来要能失败。** 加完校验后,我把它跑在**已知会失败的场景**上,
确认它真的报 FAIL —— 否则只是又一个假阳性。

### 阈值必须标定,不能凭空想

最后一道校验 `pnpm verify:shots`(`scripts/verify-docs-shots.mjs`)会**解码 PNG 像素**,
用颜色数 / 亮度判定图是不是空白。它检查的是**已经写盘的文件**,
和上面那个"在页面里查 DOM"的检查是**两套独立代码**。

阈值是**实测标定**出来的,不是拍脑袋定的:

| | 空白图 | 正常图 |
|---|---|---|
| 颜色数 | **132** | 750 – 1063 |
| 亮像素占比 | **0.0%** | 1.1% – 3.8% |
| 亮度跨度 | **17** | ~233 |

第一版我随手写了「颜色数 > 3000」,结果**把 7 张正常图全判成空白** ——
深色主题本来就用不到那么多颜色。

**教训:凡是设阈值,先量一个已知的好样本和一个已知的坏样本,用两者的差距定线。**
并且把「坏样本必须仍然被拒绝」也当成测试的一部分跑一遍。

---

## 五、关键约定

### 响应式断点 —— 唯一真相来源是 `useBreakpoint()`

| | |
|---|---|
| mobile | `< 600px` —— 单列、底部标签栏、卡片列表 |
| tablet | `600–1023px` —— 可折叠侧栏、紧凑表格 |
| desktop | `>= 1024px` —— 常驻侧栏、完整表格 |

**不要在组件里自己写 `@media` 判断断点做逻辑分支**,只用 `useBreakpoint()`。
CSS 里写 `@media` 是正常的,但**断点数值要与 `BREAKPOINT_MOBILE` / `BREAKPOINT_DESKTOP` 一致**。

### 路由必须用 hash history

替代 WebUI 是纯静态托管,**没有 SPA fallback**。用 history 模式刷新子路由会 404。

### 毛玻璃只用在"外壳"上

侧栏 / 顶栏 / 抽屉用 `backdrop-filter`,**列表行刻意不用** ——
几百行滚动区域加模糊在手机上是真实的 GPU 开销。

### 设置项改动流程

```bash
# 1. 改 src/config/settings-schema.ts
# 2. 同步标签(会自动补缺失、删多余的)
node scripts/sync-settings-locales.mjs
# 3. 新增标签若提示"回退为英文",去 ZH_LABELS 补中文
# 4. 校验
pnpm typecheck && pnpm test
```

### 枚举选项要写成真正的下拉框

枚举类设置(`encryption`、`proxy_type` 等)必须用 `select` +
完整的 `options` 列表,不能让用户自由输入 —— 否则能填出服务端不接受的值。

### 设置页的分组结构(重要)

设置项分两层:**group**(顶部标签页)与 **section**(页内的分组标题)。

**`groups[].fields` 是唯一真相来源**,负责加载、比对、保存。
`src/config/settings-sections.ts` 只用 **字段 key** 描述怎么分组,
`resolveSections()` 按 group 自己的 `fields` 顺序切分。

**为什么用"key 列表"而不是把字段直接嵌进 section**:

- 嵌入意味着**每加一个设置要改两处**,漏改的字段会**从界面上消失**
- key 列表漏写的字段**不会消失**,而是落到 "Other" 分组里 ——
  最坏情况是分组难看,而不是设置项凭空不见
- 顺序以 `fields` 为准,所以**调整 `fields` 顺序就能调整界面顺序**

**加设置项的完整流程**:

```bash
# 1. 在 groups[].fields 里加字段
# 2. 在 settings-sections.ts 里把它归入某个 section(漏了会落到 "Other")
# 3. 同步标签
node scripts/sync-settings-locales.mjs
# 4. 新增标签若提示"回退为英文",补 ZH_LABELS
# 5. 校验(其中一条测试会断言「没有字段落到 Other」)
pnpm typecheck && pnpm test
```

**布局约束**:每个设置占**一行**,标签在左、控件在右,标签列定宽 15rem。
不要改回多列网格 —— 多列会让标签与其控件在视觉上等距,
用户根本分不清哪个标签属于哪个控件(这正是重做这版 UI 的原因)。
窄屏(≤767px)自动改为上下堆叠。

---

## 六、测试

```bash
pnpm test          # 139 项单元测试
pnpm typecheck     # 必须 0 错误
pnpm verify:entry  # 22 项登录流程检查(jsdom 跑构建产物)
pnpm verify:dist   # 服务端路径解析规则
```

### 写测试的规矩

**修 bug 时,先写一个"没有这个修复就会失败"的测试,再修。**

并且**必须验证这个守卫不是空转的**:改完之后把 bug **重新注入一次**,
确认测试真的会红。本项目已多次发现"测试通过但其实什么都没测"的情况,例如:

- 测试挂载组件时用了 `createPinia()` 新建实例,而断言读的是**另一个** store
  —— 组件读的是空状态,测试却"通过"了
- 正则只匹配单行写法 `{ key: 'x' }`,导致**多行写法的 28 个字段完全隐形**,
  同步脚本把它们的中文标签当"废弃项"删掉,而审计脚本报告"无缺失"
  —— **两个错误互相掩盖**

### 单元测试不应依赖构建产物

`build-layout.spec.ts` 会检查 `dist/`,但**必须能在没有 `dist/` 时跳过**。
曾经有一个**嵌套的** `describe` 漏了 `skipIf` 守卫,导致 `pnpm test` 依赖
"先跑过构建" —— 而 `publish` 会消耗掉 `dist/`,于是自动同步一上线就暴露了。

**以后加依赖 `dist/` 的测试,记得也要给嵌套块加守卫。**
`pnpm test` 在有无构建时都应可运行:
`139 passed`,或 `126 passed / 13 skipped`。

### 视觉改动要真的渲染出来看

不要只读 CSS 就下结论。本项目用无头 Edge 渲染真实构建产物验证布局:

```powershell
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
  --headless --disable-gpu --hide-scrollbars `
  --window-size=1000,700 --screenshot="out.png" "file:///<绝对路径>/preview.html"
```

> **注意**:`<style scoped>` 会被编译成 `[data-v-HASH]` 选择器,
> 而且**每个组件有各自的 hash**。自己拼预览 HTML 时若不带上正确的属性,
> 组件样式**全部不生效**,看起来像是布局坏了 —— 实际是验证脚本的问题。
> 我就被这个骗过一次。构造预览时请用组件选择器反查对应 hash。

---

## 七、命令速查

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 开发服务器(带 API 代理) |
| `pnpm build` | 类型检查 + 构建 + 产物校验 |
| `pnpm test` | 单元测试 |
| `pnpm typecheck` | 仅类型检查 |
| `pnpm verify:entry` | 登录流程检查 |
| `pnpm verify:dist` | 产物结构检查 |
| `pnpm publish:dist` | 发布到 `dist` 分支(提交后已自动执行) |
| `pnpm install` | 装依赖,并自动安装 git hooks |
| `pnpm lint` / `pnpm format` | ESLint / Prettier |

环境要求:**Node >= 20.19**、**pnpm >= 9**(见 `package.json` 的 `engines`)。

新增设置项的流程见 §五「设置项改动流程」,注意其中两个自动脚本:
`sync-settings-locales.mjs`(补标签)与 `read-schema-keys.mjs`(读字段 key)。
**读 schema 必须用 `readSchemaKeys()`,不要自己写正则** —— 理由见 §六。

---

## 八、提交与发布

```bash
git push origin main              # 源码
pnpm build && pnpm publish:dist   # 产物,重建 dist 分支
```

- **仓库地址与访问令牌不要写进任何被跟踪的文件。**
  推送时用临时远程地址或凭据助手,用完即改回无凭据的 URL。
  AGENT.md 曾经在这里写着自建 Gitea 的地址和一个令牌环境变量名,
  这些内容会随着仓库公开而暴露 —— 换仓库时**记得一并清理**。
- **项目内不要添加 CI workflow** —— 构建在开发机上手动完成,
  产物通过 `dist` 分支分发。原因见第二节。

提交信息写**为什么**,不写**做了什么**(后者看 diff 就知道)。
特别要记录"这个改动修复了什么真实故障",因为下一个人很可能想"简化"掉它。

### 提交前自检

```bash
# 1) 全量校验
pnpm typecheck && pnpm lint && pnpm test
pnpm build && pnpm verify:dist && pnpm verify:entry && pnpm verify:settings

# 2) 隐私扫描（不要提交主机名、内网 IP、令牌、本地绝对路径）
git grep -n -I -E 'token|secret|password|192\.168\.|10\.0\.0\.|/home/|/Users/' \
  -- . ':!pnpm-lock.yaml' ':!*.md'
```

第 2 条是习惯问题:**在你自己的仓库地址、内网 IP、路径写进文件之前停一下**。
本仓库的历史里就曾经长期躺着维护者的内网地址和一个自建服务的域名。