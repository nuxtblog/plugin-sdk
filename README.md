# @nuxtblog/plugin-sdk

nuxtblog Goja JS 插件 TypeScript 类型定义与开发指南。

---

## 目录

- [概述](#概述)
- [安装](#安装)
- [插件结构](#插件结构)
- [清单文件 plugin.yaml](#清单文件-pluginyaml)
- [插件入口 plugin.js](#插件入口-pluginjs)
- [平台 API 参考](#平台-api-参考)
  - [ctx.db — 数据库](#ctxdb--数据库)
  - [ctx.store — 键值存储](#ctxstore--键值存储)
  - [ctx.settings — 插件配置](#ctxsettings--插件配置)
  - [ctx.log — 日志](#ctxlog--日志)
  - [ctx.http — HTTP 客户端](#ctxhttp--http-客户端)
- [Filter 拦截器](#filter-拦截器)
- [自定义路由](#自定义路由)
- [事件监听](#事件监听)
- [浏览器端 API (admin.js)](#浏览器端-api-adminjs)
- [所有事件列表](#所有事件列表)
- [所有 Filter 列表](#所有-filter-列表)
- [执行模型与限制](#执行模型与限制)
- [打包与安装](#打包与安装)

---

## 概述

插件是运行在服务器端的 JavaScript 脚本，由 [Goja](https://github.com/dop251/goja) 引擎执行（ES5.1+ 兼容）。每个插件在独立的 VM 实例中运行，通过全局 `ctx` 对象与平台交互。

**插件可以做什么：**

- 在数据写入数据库之前拦截并修改，或拒绝（abort）整个操作
- 注册自定义 HTTP 路由，构建后端 API
- 监听系统事件（文章、评论、用户、媒体等）
- 直接执行 SQL 查询和写操作
- 在独立的 KV 存储中持久化运行时状态
- 向外部服务发起 HTTP 请求
- 读取管理员配置的参数

**Goja 引擎限制：**

- 不支持 ES Modules（`import`/`export`），使用 CommonJS `module.exports`
- 单线程运行时，每次 JS 调用 5 秒超时
- 只能访问注入的 `ctx` API，无 Node.js / 浏览器全局对象
- 第三方 JS 库需用 esbuild 打包成单文件

---

## 安装

```bash
pnpm add -D @nuxtblog/plugin-sdk
# 或
npm install -D @nuxtblog/plugin-sdk
```

在 `tsconfig.json` 中引用：

```json
{
  "extends": "@nuxtblog/plugin-sdk",
  "include": ["src"]
}
```

或在入口文件顶部添加三斜线引用：

```ts
/// <reference types="@nuxtblog/plugin-sdk" />
```

---

## 插件结构

```
my-plugin/
├── plugin.yaml       ← 插件清单（必须）
├── plugin.js         ← 入口脚本（Goja 加载此文件）
├── admin.mjs         ← 浏览器端管理面板脚本（可选）
├── public.mjs        ← 浏览器端前台脚本（可选）
└── src/
    └── plugin.ts     ← TypeScript 源码（开发用，可选）
```

---

## 清单文件 (plugin.yaml)

```yaml
id: my-plugin
title: My Plugin
version: 1.0.0
icon: i-tabler-puzzle
author: your-name
description: 插件功能简介
type: js                    # "js" | "full" | "yaml" | "ui"

# 管理员可配置的参数
settings:
  - key: api_token
    label: API Token
    type: password
    required: true
    placeholder: sk-xxxxxxxx
    description: 从服务商控制台获取

  - key: enabled
    label: 启用功能
    type: boolean
    default: true

  - key: log_level
    label: 日志级别
    type: select
    default: info
    options:
      - debug
      - info
      - warn
      - error

  - key: template
    label: 消息模板
    type: textarea
    placeholder: "新文章：{{title}}"
```

### Settings 字段类型

| `type` 值    | 渲染控件       | 适用场景                     |
|-------------|--------------|---------------------------|
| `string`    | 单行文本输入    | URL、名称、任意字符串           |
| `password`  | 密码输入       | API Key、Token、Secret       |
| `number`    | 数字输入       | 超时时间、最大数量等            |
| `boolean`   | 开关          | 功能开关                     |
| `select`    | 下拉选择       | 枚举值，配合 `options` 使用     |
| `textarea`  | 多行文本       | 模板文本、JSON 配置等          |

---

## 插件入口 (plugin.js)

通过 `module.exports` 导出插件定义：

```js
module.exports = {
  // [可选] 插件激活时调用，此时 ctx 已可用
  activate: function () {
    ctx.log.info("Plugin activated!")
  },

  // [可选] 插件停用时调用
  deactivate: function () {},

  // [可选] filter 数组 — 拦截数据变更
  filters: [
    {
      event: "filter:post.create",
      handler: function (fc) {
        if (!fc.data.title) {
          fc.abort("标题不能为空")
        }
      }
    }
  ],

  // [可选] 自定义 HTTP 路由
  routes: [
    {
      method: "GET",
      path: "/hello",
      auth: "public",
      handler: function (req) {
        return { code: 0, data: { message: "Hello!" } }
      }
    }
  ],

  // [可选] 接收平台事件
  onEvent: function (event, data) {
    ctx.log.info("Event: " + event)
  }
}
```

---

## 平台 API 参考

所有 API 通过全局 `ctx` 对象访问，在 `activate()` 后可用。

### ctx.db — 数据库

```js
// 查询：返回行数组 [{col: val, ...}, ...]
var rows = ctx.db.query("SELECT id, title FROM post WHERE status = ?", 1)

// 写操作：返回受影响行数
var affected = ctx.db.execute(
  "INSERT INTO plugin_my_table (key, value) VALUES (?, ?)",
  "foo", "bar"
)
```

### ctx.store — 键值存储

每个插件独立的 KV 存储，键自动按插件 ID 命名空间隔离。

```js
// 读取
var val = ctx.store.get("counter")

// 写入（任意 JSON 可序列化值）
ctx.store.set("last_run", Date.now())
ctx.store.set("config", { retries: 3 })

// 删除
ctx.store.delete("counter")

// 原子递增（默认 +1，支持负数）
var n = ctx.store.increment("counter")
var n2 = ctx.store.increment("counter", 5)

// 按前缀批量删除，返回删除数量
var deleted = ctx.store.deletePrefix("cache:")
```

### ctx.settings — 插件配置

读取管理员在后台配置的参数值（只读，缓存 30 秒）。

```js
// 读取单个
var token = ctx.settings.get("api_token")
var maxLen = ctx.settings.get("max_length") || 160

// 读取全部
var all = ctx.settings.getAll()
// => { api_token: "sk-xxx", max_length: 200 }
```

### ctx.log — 日志

写入服务端日志，自动添加 `[plugin:<id>]` 前缀。

```js
ctx.log.info("插件初始化完成")
ctx.log.debug("收到数据：" + JSON.stringify(data))
ctx.log.warn("api_token 未配置")
ctx.log.error("请求失败：HTTP " + resp.status)
```

### ctx.http — HTTP 客户端

同步 HTTP 请求，立即返回结果。默认超时 10 秒。

```js
// 简单 GET
var resp = ctx.http.fetch("https://api.example.com/data")

// POST + JSON
var resp = ctx.http.fetch("https://api.example.com/notify", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + ctx.settings.get("token")
  },
  body: JSON.stringify({ title: "Hello" }),
  timeout: 5000
})

if (resp.status === 200) {
  var data = JSON.parse(resp.body)
  ctx.log.info("Success: " + data.id)
}
```

**参数：**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `method` | string | `"GET"` | HTTP 方法 |
| `headers` | object | — | 请求头 `{ key: value }` |
| `body` | string | — | 请求体字符串 |
| `timeout` | number | `10000` | 超时（毫秒） |

**返回值：**

| 属性 | 类型 | 说明 |
|------|------|------|
| `status` | number | HTTP 状态码 |
| `body` | string | 响应体字符串 |
| `headers` | object | 响应头 `{ key: value }`（小写键名） |

---

## Filter 拦截器

Filter 在数据**写入数据库之前**同步拦截。修改 `fc.data` 可改变最终写入的内容，调用 `fc.abort(reason)` 可取消整个操作。

```js
filters: [
  {
    event: "filter:post.create",
    handler: function (fc) {
      // fc.event  — 事件名 "filter:post.create"
      // fc.data   — 可变载荷，直接修改生效
      // fc.meta   — 插件间通信 KV
      // fc.abort(reason) — 中止操作

      // 去除标题空格
      fc.data.title = fc.data.title.trim()

      // 限制标题长度
      if (fc.data.title.length > 200) {
        fc.abort("标题不能超过 200 字")
        return
      }

      // 通过 meta 传递数据给后续插件
      fc.meta.slug_source = fc.data.title.toLowerCase()
    }
  },
  {
    event: "filter:comment.create",
    handler: function (fc) {
      var blocked = ["spam", "违禁词"]
      var content = fc.data.content.toLowerCase()
      for (var i = 0; i < blocked.length; i++) {
        if (content.indexOf(blocked[i]) !== -1) {
          fc.abort("评论包含违禁内容")
          return
        }
      }
    }
  }
]
```

---

## 自定义路由

路由自动挂载到 `/api/plugin/{plugin-id}/{path}`。

```js
routes: [
  {
    method: "GET",
    path: "/stats",
    auth: "admin",     // "public" | "user" | "admin"
    handler: function (req) {
      // req.method, req.url, req.path
      // req.query   — { key: value | [values] }
      // req.headers — { key: value }
      // req.body    — POST/PUT/PATCH 时可用（JSON 自动解析）
      // req.userId, req.userRole — auth 非 public 时可用

      var count = ctx.store.get("counter") || 0
      return { code: 0, data: { count: count } }
    }
  },
  {
    method: "POST",
    path: "/reset",
    auth: "admin",
    handler: function (req) {
      ctx.store.set("counter", 0)
      return { code: 0, message: "ok" }
    }
  }
]
```

---

## 事件监听

通过 `onEvent` 接收平台 fire-and-forget 事件：

```js
onEvent: function (event, data) {
  if (event === "post.published") {
    ctx.log.info("文章发布：" + data.title)

    // 推送通知
    var url = ctx.settings.get("webhook_url")
    if (url) {
      ctx.http.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "新文章：" + data.title
        })
      })
    }

    // 记录计数
    ctx.store.increment("publish_count")
  }
}
```

---

## 浏览器端 API (admin.js)

admin.js 在浏览器管理面板中执行，通过 `nuxtblogAdmin` 全局对象交互。

```js
// 监听字段变化
nuxtblogAdmin.watch("post.title", function (val) {
  console.log("标题变为：" + val)
})

// 建议字段值（用户可覆盖）
nuxtblogAdmin.suggest("post.slug", "auto-generated-slug")

// 注册编辑器命令
nuxtblogAdmin.commands.register("my-plugin.doSomething", function (ctx) {
  // ctx.post — 当前文章 { title, slug, content, excerpt, status }
  // ctx.selection — 选中文本
  // ctx.replace(text) — 替换选中
  // ctx.insert(text) — 光标处插入
  // ctx.setContent(html) — 替换全文
  ctx.insert("Hello from my plugin!")
})

// 注册 Webview 面板
nuxtblogAdmin.views.register("my-plugin.panel", function (webview) {
  webview.html = "<h1>My Panel</h1><button id='btn'>Click</button>"
  webview.onMessage(function (msg) {
    console.log("收到消息", msg)
  })
})

// HTTP 请求（调用本插件后端路由）
nuxtblogAdmin.http.get("/stats").then(function (res) {
  if (res.ok) {
    console.log(res.data)
  }
})

// 通知
nuxtblogAdmin.notify.success("操作成功")
nuxtblogAdmin.notify.error("操作失败")
```

---

## 所有事件列表

### fire-and-forget 事件 (onEvent)

#### 文章

| 事件 | 触发时机 | payload 字段 |
|------|---------|-------------|
| `post.created` | 文章创建后 | `id, title, slug, excerpt, post_type, author_id, status` |
| `post.updated` | 文章更新后 | `id, title, slug, excerpt, post_type, author_id, status` |
| `post.published` | 文章发布后 | `id, title, slug, excerpt, post_type, author_id` |
| `post.deleted` | 文章删除后 | `id, title, slug, post_type, author_id` |
| `post.viewed` | 文章浏览后 | `id, user_id` |

`post_type`：`0` = 文章，`1` = 页面。`status`：`0` = 草稿，`1` = 已发布，`2` = 回收站。

#### 评论

| 事件 | 触发时机 | payload 字段 |
|------|---------|-------------|
| `comment.created` | 评论提交后 | `id, status, object_type, object_id, object_title, object_slug, post_author_id, parent_id?, parent_author_id, author_id, author_name, author_email, content` |
| `comment.deleted` | 评论删除后 | `id, object_type, object_id` |
| `comment.status_changed` | 审核状态变更后 | `id, object_type, object_id, old_status, new_status, moderator_id` |
| `comment.approved` | 评论通过审核后 | `id, object_type, object_id, moderator_id` |

`status`：`0` = 待审核，`1` = 已通过，`2` = 垃圾。

#### 用户

| 事件 | 触发时机 | payload 字段 |
|------|---------|-------------|
| `user.registered` | 用户注册后 | `id, username, email, display_name, locale, role` |
| `user.updated` | 用户信息更新后 | `id, username, email, display_name, locale, role, status` |
| `user.deleted` | 用户删除后 | `id, username, email` |
| `user.followed` | 关注他人后 | `follower_id, follower_name, follower_avatar, following_id` |
| `user.login` | 用户登录后 | `id, username, email, role` |
| `user.logout` | 用户退出后 | `id` |

`role`：`0` = 订阅者，`1` = 投稿者，`2` = 编辑，`3` = 管理员。

#### 媒体

| 事件 | 触发时机 | payload 字段 |
|------|---------|-------------|
| `media.uploaded` | 文件上传后 | `id, uploader_id, filename, mime_type, file_size, url, category, width, height` |
| `media.deleted` | 文件删除后 | `id, uploader_id, filename, mime_type, category` |

#### 分类 / 标签

| 事件 | 触发时机 | payload 字段 |
|------|---------|-------------|
| `taxonomy.created` | 分类关联创建后 | `id, term_id, term_name, term_slug, taxonomy` |
| `taxonomy.deleted` | 分类关联删除后 | `id, term_name, term_slug, taxonomy` |
| `term.created` | 词条创建后 | `id, name, slug` |
| `term.deleted` | 词条删除后 | `id, name, slug` |

#### 互动

| 事件 | 触发时机 | payload 字段 |
|------|---------|-------------|
| `reaction.added` | 点赞/收藏后 | `user_id, object_type, object_id, type` |
| `reaction.removed` | 取消点赞/收藏后 | `user_id, object_type, object_id, type` |
| `checkin.done` | 用户签到后 | `user_id, streak, already_checked_in` |

`type`：`"like"` 或 `"bookmark"`。

#### 系统

| 事件 | 触发时机 | payload 字段 |
|------|---------|-------------|
| `option.updated` | 站点配置更改后 | `key, value` |
| `plugin.installed` | 插件安装后 | `id, title, version, author` |
| `plugin.uninstalled` | 插件卸载后 | `id` |

---

## 所有 Filter 列表

| 事件 | 触发时机 | `fc.data` 字段 | 备注 |
|------|---------|---------------|------|
| `filter:post.create` | 文章写入 DB 前 | `title, slug, content, excerpt, status` | |
| `filter:post.update` | 文章更新前 | 仅本次变更字段（Partial） | |
| `filter:post.delete` | 文章删除前 | `id` | abort 可取消 |
| `filter:post.publish` | 文章发布前 | `id, title, slug, content, excerpt` | abort 可阻止发布 |
| `filter:post.restore` | 文章恢复前 | `id, title, slug` | abort 可阻止恢复 |
| `filter:comment.create` | 评论写入 DB 前 | `content, author_name, author_email` | |
| `filter:comment.delete` | 评论删除前 | `id` | abort 可取消 |
| `filter:comment.update` | 评论编辑前 | `id, content` | |
| `filter:term.create` | 词条写入 DB 前 | `name, slug` | |
| `filter:user.register` | 用户注册前 | `username, email, display_name` | |
| `filter:user.update` | 用户信息更新前 | 仅本次变更字段（Partial） | |
| `filter:user.login` | 用户登录前 | `username, email` | abort 可阻止登录 |
| `filter:media.upload` | 媒体上传前 | `filename, mime_type, category, alt_text, title` | |
| `filter:content.render` | 内容渲染给读者前 | `content, type, id, slug, title` | 不影响存储 |

---

## 执行模型与限制

- 每个插件拥有独立的 Goja VM 实例和互斥锁，所有调用串行执行
- 每次 JS 函数调用有 **5 秒超时**，超时后 VM 被中断
- 多个插件按 `priority` 升序执行（数值小的先执行），同优先级按插件 ID 排序
- `filter` 的 `fc.data` 和 `fc.meta` 是 Go map 直接引用，JS 中的修改即时生效
- 错误不会传播到其他插件，仅记录日志

---

## 打包与安装

### 使用 esbuild 打包 TypeScript

```bash
npx esbuild src/plugin.ts \
  --bundle \
  --platform=neutral \
  --target=es2015 \
  --outfile=plugin.js
```

### 打包成安装包

```bash
# ZIP
zip my-plugin.zip plugin.yaml plugin.js

# tar.gz
tar -czf my-plugin.tar.gz plugin.yaml plugin.js
```

### 安装方式

1. **本地安装** — 管理后台 → 插件 → 安装插件 → 上传 ZIP
2. **GitHub 安装** — 管理后台 → 插件 → 安装插件 → 填写 `owner/repo`

---

## License

MIT
