# 舟曲锦带数字文化平台

六页可交互网站现已接入本地 Node.js + SQLite 服务。旧版 `prototype/` 保留不变。

## 启动

需要 Node.js 24.11.1 或更新的 24.x 版本。进入本目录后执行：

```powershell
npm start
```

打开 <http://127.0.0.1:8766/>。服务默认只监听本机，不向局域网或互联网开放；数据库自动建立在 `data/jindai.sqlite`。无需 `npm install`。如端口被占用，可先停止旧静态服务器，或设置 `$env:PORT='8767'` 再运行。不要继续用 `python -m http.server` 启动，否则新接口不会生效。

Node 内置 SQLite 在本项目使用的版本仍会显示 `ExperimentalWarning`；这是运行时提示，测试通过不代表 API 将来不会变化。建议固定 Node 版本，并在升级前备份数据库、重跑测试。

## 已接通的数据与交互

- 档案、35 张纹样索引、六个展厅章节和六段织造工序在首次启动时写入 SQLite，网页从 `/api/bootstrap` 读取。已有档案和原型视觉仍标记为演示/待核验。
- 档案支持关键词和类别查询；纹样支持关键词与配色类别查询，均提供单条详情接口。
- 九宫格作品可以保存多份、载入、更新、删除。同一浏览器通过匿名访客 Cookie 访问自己的作品；同时保留浏览器本地存储作为离线备份。
- 经纬工坊的当前步骤、线组数、颜色及织造轮次保存并可恢复。
- 管理员可通过接口录入/更新/删除档案，或补充纹样名称、描述、寓意与授权/核验状态。
- 服务器同时提供前端静态文件和 API，同源访问，不开放跨域写入。请求有字段校验与 1 MB JSON 上限。

主要接口：`GET /api/health`、`GET /api/bootstrap`、`GET /api/motifs`、`GET /api/archives`、`GET /api/chapters`、`GET /api/craft-steps`、`GET|POST /api/designs`、`GET|PUT|DELETE /api/designs/:id`、`GET|PUT /api/weave-progress`。

管理员接口默认关闭。需要录入资料时，启动前设置一个足够长的随机令牌：

```powershell
$env:JINDAI_ADMIN_TOKEN='请换成足够长的随机字符串'
npm start
```

请求头使用 `X-Admin-Token`。例如录入一条尚待核验的纹样资料：

```powershell
$body = @{ kind='纹样'; title='示例纹样'; image='archivePattern'; summary='待补充的实地采集说明'; source='采访记录编号待填'; isDemo=$true } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://127.0.0.1:8766/api/admin/archives' -Method Post -Headers @{ 'X-Admin-Token'=$env:JINDAI_ADMIN_TOKEN } -ContentType 'application/json' -Body $body
```

允许的档案图像标识目前只包含页面中已有的概念图（`archive-photo`、`archivePattern`、`archiveTool`、`archiveMaker`、`cultureMain`、`weave`）。正式素材入库、图片上传、出处与授权审查仍需在真实资料到位后设计，不能仅凭切换 `rightsStatus` 字段视为法律授权。管理员令牌只适合本机开发环境；若公开部署，需要正式账号、权限、审计、HTTPS 和备份方案。

## 原型边界与隐私

试戴仍是本地图层合成，并非生成式 AI；用户上传的试戴照片只留在浏览器，不上传服务器。数字展厅是场景图片与章节交互，非可自由行走的 3D 空间；工坊是第一视角教学演示，非真实物理仿真。文献所述工序依据杨路色《白龙江流域织锦带工艺的传承与保护研究》（《中国服饰》86–87 页）梳理，具体工具摆位、线序、整圈推进和收边仍需传承人核对。

`assets/*-reference.png` 是用户提供的原型参考；`archive-brocade.png`、`system-model.png`、`weave-first-person.png`、`virtual-gallery.png` 是概念视觉，不应作为真实文物或实拍资料引用。35 张纹样图来自团队旧仓库；源路径列在 `assets/motifs/source.json`，正式名称、寓意及公开使用权仍待核对。

匿名访客身份依赖 Cookie。清除 Cookie 后，旧作品仍在数据库，但网页无法自动找回；不要把它当作正式账号系统。网站端口默认本机可访问，数据库和访客作品不应直接对外公开。请定期备份 `data/jindai.sqlite`；备份运行中的 SQLite 时应先停止服务，或使用 SQLite 在线备份方法，不能只复制主文件而忽略 WAL。

## 验证

```powershell
npm test
```

该命令使用临时数据库验证资料接口、访客作品隔离、字段校验、工坊进度、管理员权限和静态文件保护。`smoke-test.cjs` 还可用 Playwright/Edge 测试六页、九宫格、织造、展厅、试戴与移动端；本机运行时需设置 `NODE_PATH`、`BROWSER_EXECUTABLE`，可选 `BASE_URL`。
