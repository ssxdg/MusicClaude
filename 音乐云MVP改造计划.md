# 音乐云 MVP 改造计划

## Summary

可以做。推荐方案是：以 [Cohenjikan/shiyun](https://github.com/Cohenjikan/shiyun) 的 React + Three.js 星系外壳为基础，参考 [qier222/YesPlayMusic](https://github.com/qier222/YesPlayMusic) 的网易云 API 调用方式，但不直接混入它的 Vue 2 代码。

第一版目标锁定为：**扫码登录网易云账号、本地开发环境播放音乐、歌手=主星、歌曲=行星**。暂不做完整 YesPlayMusic 克隆。

## Key Changes

- 将项目品牌与文案从“诗云”改为“音乐云”，保留三维漫游、星系、选中面板、搜索面板等核心体验。
- 新增网易云音乐服务层：
  - 环境变量：`VITE_NETEASE_API_BASE=/api`
  - 本地 Vite proxy：`/api -> http://localhost:3000`
  - 使用 NeteaseCloudMusicApi 兼容接口：`/login/qr/key`、`/login/qr/create`、`/login/qr/check`、`/user/account`、`/user/playlist`、`/playlist/detail`、`/song/detail`、`/song/url`、`/lyric`
- 新增音乐数据模型：
  - `MusicArtist`: 歌手主星，按 artist id 稳定生成空间坐标
  - `MusicTrack`: 歌曲行星，围绕主歌手排列
  - `PlaybackState`: 当前歌曲、队列、播放/暂停、进度、音量、歌词
- 播放器使用浏览器原生 `HTMLAudioElement`，MVP 不引入 Howler/Electron/UnblockNeteaseMusic。
- 登录只支持二维码扫码；登录成功后保存 cookie 字符串到本地浏览器存储，并在请求中附带，退出登录时清除。
- 登录后默认加载用户歌单列表；用户选择一个歌单后拉取歌曲详情，构建音乐星系。搜索面板支持歌曲/歌手搜索并可直接播放。
- 移除或隐藏诗歌专属能力：造诗、编号反查、格律、赠诗网络、诗句搜索、诗歌数据加载。

## Test Plan

- 本地启动 NeteaseCloudMusicApi，再启动音乐云前端，确认 `/api` 代理可用。
- 扫码登录：二维码生成、轮询状态、成功登录、过期重试、退出登录。
- 歌单加载：能显示用户歌单，选择歌单后生成歌手星系和歌曲行星。
- 播放流程：点歌曲播放、暂停、继续、上一首/下一首、进度条、音量、播放结束自动下一首。
- 歌词流程：有歌词时显示并随进度高亮；无歌词时显示空状态。
- 视觉 QA：桌面和移动端检查星系、面板、播放器栏不遮挡，文本不溢出。
- 构建检查：`npm run typecheck`、`npm run build`。

## Assumptions

- 第一版范围采用 **MVP 播放版**。
- 星系语义采用 **歌手=星系/主星，歌曲=行星**。
- 部署策略采用 **先本地开发**，生产部署后续再设计。
- 登录方式采用 **扫码登录**，不处理手机号/邮箱密码。
- YesPlayMusic 只作为接口和播放器行为参考，不直接复制 Vue 组件结构。
- 该项目适合个人学习和自用；公开部署时需要额外处理网易云 API、Cookie 安全、版权和服务条款风险。
