# @nuxtblog/plugin-sdk

nuxtblog 插件 TypeScript 类型定义与完整开发指南。

[English](README.md)|[中文文档](README.zh.md)

---

## 目录

- [概述](#概述)
- [插件结构](#插件结构)
- [清单文件（package.json）](#清单文件-packagejson)
- [插件参数（settings）](#插件参数-settings)
- [能力声明（capabilities）](#能力声明-capabilities)
- [插件 API 参考](#插件-api-参考)
  - [nuxtblog.on — 事件订阅](#nuxtblogon--事件订阅)
  - [nuxtblog.filter — 数据拦截](#nuxtblogfilter--数据拦截)
  - [nuxtblog.http — HTTP 请求](#nuxtbloghttp--http-请求)
  - [nuxtblog.store — 持久化存储](#nuxtblogstore--持久化存储)
  - [nuxtblog.settings — 读取配置](#nuxtblogsettings--读取配置)
  - [nuxtblog.log — 服务端日志](#nuxtbloglog--服务端日志)
- [声明式 Webhook](#声明式-webhook)
- [声明式 Pipeline（多步流水线）](#声明式-pipeline多步流水线)
- [所有事件列表](#所有事件列表)
  - [fire-and-forget 事件（nuxtblog.on）](#fire-and-forget-事件nuxtblogon)
  - [filter 拦截事件（nuxtblog.filter）](#filter-拦截事件nuxtblogfilter)
- [执行模型与并发](#执行模型与并发)
- [超时与重试](#超时与重试)
- [可观测性](#可观测性)
- [打包与安装](#打包与安装)
- [TypeScript 支持](#typescript-支持)

---

## 概述

插件是运行在**服务器端的 JavaScript 脚本**，由 [goja](https://github.com/dop251/goja) 引擎执行（兼容 ES2015+）。每个插件在完全隔离的 VM 实例中运行，通过全局 `nuxtblog` 对象与博客系统交互。

**插件可以做什么：**

- 异步订阅系统事件（文章、评论、用户、媒体等），fire-and-forget 模式，不影响主流程
- 在数据写入数据库之前同步拦截并修改，或拒绝（abort）整个操作
- 读取管理员在后台配置的参数（API Token、Webhook URL、功能开关等）
- 向外部服务发起 HTTP 请求（通知、同步、AI 调用等）
- 在独立的 KV 存储中持久化运行时状态
- 通过清单文件声明式配置出站 Webhook 和多步异步流水线，无需编写 JS

**插件不能做什么：**

- 在 `filter` 处理器中调用 `http.fetch`（会阻塞请求处理，应改用 `nuxtblog.on` 处理异步副作用）
- 访问未在 `capabilities` 中声明的 API（未声明的 API 在 VM 内是 `undefined`，不会抛出错误）
- 与其他插件共享 VM 状态（每个插件拥有完全独立的运行时）

---

## 插件结构

```
my-plugin/
├── package.json      ← 插件清单（必须，含 "plugin" 字段）
├── index.js          ← 打包后的单文件脚本（服务端加载此文件）
└── src/
    └── index.ts      ← TypeScript 源码（开发用，可选）
```

安装包只需包含 `package.json` 和 `index.js`：

```
my-plugin.zip
├── package.json
└── index.js          (或 plugin.entry 中声明的路径)
```

---

## 清单文件 (`package.json`)

清单以标准 `package.json` 格式提供，插件专属配置嵌套在 `"plugin"` 字段下。

```json
{
  "name": "owner/my-plugin",
  "version": "1.0.0",
  "description": "插件功能简介",
  "author": "owner",
  "license": "MIT",
  "homepage": "https://github.com/owner/my-plugin",
  "keywords": ["nuxtblog-plugin"],
  "plugin": {
    "title": "My Plugin",
    "icon": "i-tabler-plug",
    "entry": "index.js",
    "priority": 10,
    "capabilities": {
      "http":  { "allow": ["hooks.slack.com"], "timeout_ms": 5000 },
      "store": { "read": true, "write": true }
    },
    "settings": [
      { "key": "webhook_url", "label": "Slack Webhook URL", "type": "string", "required": true }
    ],
    "webhooks": [],
    "pipelines": []
  }
}
```

### 顶层字段（标准 npm 字段）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `name` | string | ✅ | 插件唯一 ID，推荐格式 `owner/repo`，安装后不可更改 |
| `version` | string | ✅ | 版本号，如 `1.0.0` |
| `description` | string | | 显示在管理后台的简介 |
| `author` | string | | 作者名 |
| `license` | string | | 开源协议，如 `MIT` |
| `homepage` | string | | 插件主页或仓库 URL |
| `keywords` | string[] | | 分类标签，建议包含 `nuxtblog-plugin` |

### `"plugin"` 字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `title` | string | ✅ | 显示在管理后台的名称 |
| `icon` | string | | [Tabler Icons](https://tabler.io/icons) 图标名，如 `i-tabler-bell` |
| `entry` | string | | 入口脚本路径，默认 `index.js` |
| `priority` | number | | 插件执行顺序，数值越小越先执行，默认 `10` |
| `capabilities` | object | | API 权限声明，见[能力声明](#能力声明-capabilities) |
| `settings` | array | | 管理员可配置的参数，见[插件参数](#插件参数-settings) |
| `webhooks` | array | | 声明式出站 Webhook，见[声明式 Webhook](#声明式-webhook) |
| `pipelines` | array | | 声明式异步流水线，见[声明式 Pipeline](#声明式-pipeline多步流水线) |

---

## 插件参数 (`settings`)

`settings` 数组声明管理员在插件设置界面需要填写的参数。插件通过 `nuxtblog.settings.get(key)` 在运行时读取。

### 字段类型

| `type` 值 | 渲染控件 | 适用场景 |
|---|---|---|
| `string` | 单行文本输入 | URL、名称、任意字符串 |
| `password` | 密码输入（遮掩显示） | API Key、Token、Secret |
| `number` | 数字输入 | 超时时间、最大数量等 |
| `boolean` | 开关（Switch） | 功能开关 |
| `select` | 下拉选择 | 枚举值，配合 `options` 使用 |
| `textarea` | 多行文本 | 模板文本、JSON 配置等长文本 |

### 字段属性

```json
{
  "key":         "api_token",
  "label":       "API Token",
  "type":        "password",
  "required":    true,
  "default":     "",
  "placeholder": "sk-xxxxxxxx",
  "description": "从服务商控制台复制",
  "options":     []
}
```

| 属性 | 类型 | 说明 |
|---|---|---|
| `key` | string | 参数键名，在 `nuxtblog.settings.get(key)` 中使用 |
| `label` | string | 后台表单的字段标签 |
| `type` | string | 控件类型，见上表 |
| `required` | boolean | 是否必填（视觉标记，不强制校验） |
| `default` | any | 安装时的默认值 |
| `placeholder` | string | 输入框占位文字 |
| `description` | string | 字段说明文字，显示在输入框下方 |
| `options` | string[] | 下拉选项（仅 `type: "select"` 时使用） |

### 完整示例

```json
"settings": [
  { "key": "enabled",     "label": "启用插件功能",     "type": "boolean",  "default": true },
  { "key": "api_token",   "label": "API Token",         "type": "password", "required": true, "placeholder": "sk-xxxxxxxx", "description": "从服务商控制台获取" },
  { "key": "webhook_url", "label": "Webhook URL",       "type": "string",   "placeholder": "https://example.com/hook" },
  { "key": "timeout",     "label": "超时时间（秒）",    "type": "number",   "default": 10 },
  { "key": "log_level",   "label": "日志级别",          "type": "select",   "default": "info", "options": ["debug","info","warn","error"] },
  { "key": "template",    "label": "消息模板",          "type": "textarea", "placeholder": "新文章：{{title}}\n链接：{{url}}" }
]
```

---

## 能力声明 (`capabilities`)

能力声明遵循**白名单模型**：只有在 `capabilities` 中显式声明的 API 才会注入到 VM 中。未声明的 API 在 JS 里是 `undefined` — 访问它们不会抛出错误，功能只是不存在。

```json
"capabilities": {
  "http": {
    "allow":      ["api.openai.com", "hooks.slack.com"],
    "timeout_ms": 8000
  },
  "store": {
    "read":  true,
    "write": true
  }
}
```

### `http`

| 属性 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `allow` | string[] | `[]`（任意域名） | 允许访问的域名白名单。子域名自动匹配（如 `example.com` 同时允许 `api.example.com`）。空列表表示允许任意域名。 |
| `timeout_ms` | number | `15000` | 每次请求的超时时间（毫秒）。 |

### `store`

| 属性 | 类型 | 说明 |
|---|---|---|
| `read` | boolean | 授权访问 `nuxtblog.store.get` |
| `write` | boolean | 授权访问 `nuxtblog.store.set` 和 `nuxtblog.store.delete` |

> **注意：** `nuxtblog.on`、`nuxtblog.filter`、`nuxtblog.log`、`nuxtblog.settings` 始终可用，无需声明任何 capability。

---

## 插件 API 参考

### `nuxtblog.on` — 事件订阅

```ts
nuxtblog.on(event: string, handler: (payload: object) => void): void
```

订阅系统事件，**异步执行**（fire-and-forget）。操作完成后触发，handler 内的错误仅记录日志和错误环形缓冲区，不影响原始操作。

**关键约束：**

- Handler 超时：**3 秒**
- 允许在 `nuxtblog.on` 的 handler 中调用 `http.fetch`
- 多个插件按 `priority` 升序执行（数值小的先执行），同优先级按插件 ID 字母顺序排序

```ts
// 文章发布后推送 Slack 通知
nuxtblog.on('post.published', (data) => {
  const url = nuxtblog.settings.get('webhook_url') as string
  if (!url) return

  const res = nuxtblog.http.fetch(url, {
    method: 'POST',
    body: { text: `新文章发布：${data.title} — ${data.slug}` },
  })
  if (!res.ok) {
    nuxtblog.log.warn(`Slack 推送失败：HTTP ${res.status}`)
  }
})

// 记录累计文章数
nuxtblog.on('post.created', (_data) => {
  const count = ((nuxtblog.store.get('post_count') as number) || 0) + 1
  nuxtblog.store.set('post_count', count)
  nuxtblog.log.info(`累计推送文章数：${count}`)
})
```

---

### `nuxtblog.filter` — 数据拦截

```ts
nuxtblog.filter(event: string, handler: (ctx: PluginCtx) => void): void
```

在数据**写入数据库之前同步拦截**。handler 接收 `ctx` 对象，修改 `ctx.data` 可改变最终写入的内容，调用 `ctx.abort(reason)` 可取消整个操作。

**关键约束：**

- Handler 超时：**50 毫秒**（严格限制，保证请求延迟可预期）
- `http.fetch` 在 filter handler 中**被强制阻断**，请改用 `nuxtblog.on` 处理异步副作用
- 所有插件按 `priority` 顺序执行，`ctx.meta` 在同一事件链的所有插件间共享

**`ctx` 对象说明：**

| 属性 | 类型 | 说明 |
|---|---|---|
| `ctx.event` | string | 当前 filter 事件名，如 `"filter:post.create"` |
| `ctx.data` | object | 可变的数据载荷，对它的修改会被写入数据库 |
| `ctx.input` | object | `ctx.data` 的深拷贝快照（链开始前保存），只读，用于差异对比和审计日志 |
| `ctx.meta` | object | 跨插件 KV 共享存储，先执行的插件写入，后执行的插件可读取 |
| `ctx.next()` | function | 可选：显式表示当前 handler 已完成。即使不调用，链也会继续，除非调用了 `abort()` |
| `ctx.abort(reason)` | function | 立即中止整个操作，跳过后续所有插件，调用方收到包含 `reason` 的错误 |

```ts
// 去除首尾空格，限制标题长度
nuxtblog.filter('post.create', (ctx) => {
  ctx.data.title = (ctx.data.title as string).trim()
  if ((ctx.data.title as string).length > 200) {
    ctx.abort('标题不能超过 200 个字符')
    return
  }
  // 写入 meta，供后续插件使用
  ctx.meta.computed_slug = (ctx.data.title as string).toLowerCase().replace(/\s+/g, '-')
})

// 根据前一个插件计算的 slug 自动填充
nuxtblog.filter('post.create', (ctx) => {
  if (!ctx.data.slug && ctx.meta.computed_slug) {
    ctx.data.slug = ctx.meta.computed_slug
  }
})

// 拦截包含违禁词的评论
nuxtblog.filter('comment.create', (ctx) => {
  const blocked = ['违禁词', 'spam']
  const content = (ctx.data.content as string).toLowerCase()
  if (blocked.some(w => content.includes(w))) {
    ctx.abort('评论包含违禁内容')
  }
})

// 拦截内容渲染，对读者输出进行处理（不影响存储）
nuxtblog.filter('content.render', (ctx) => {
  // 修改 ctx.data.content 来改变读者看到的内容
  ctx.data.content = (ctx.data.content as string).replace(/foo/g, 'bar')
})
```

---

### `nuxtblog.http` — HTTP 请求

```ts
nuxtblog.http.fetch(url: string, options?: FetchOptions): FetchResult
```

同步 HTTP 请求（非 Promise），立即返回结果，默认超时 15 秒。

> 需要在 `capabilities.http` 中声明。  
> **在 `filter` handler 中被强制阻断。** 请在 `nuxtblog.on` handler 或 pipeline `js` 步骤中使用。

**options 参数：**

| 属性 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `method` | string | `"GET"` | HTTP 方法：`GET`、`POST`、`PUT`、`PATCH`、`DELETE` |
| `body` | object \| string | — | 请求体。对象自动 JSON 序列化；字符串原样发送 |
| `headers` | object | — | 自定义请求头。有 body 时自动添加 `Content-Type: application/json` |

**返回值：**

| 属性 | 类型 | 说明 |
|---|---|---|
| `ok` | boolean | HTTP 状态码 200–299 时为 `true` |
| `status` | number | HTTP 状态码 |
| `body` | any | 自动 JSON.parse，解析失败则返回原始字符串 |
| `error` | string | 请求失败时的错误信息（网络错误、超时、域名不在白名单等） |

```ts
nuxtblog.on('post.published', (data) => {
  const token = nuxtblog.settings.get('api_token') as string
  if (!token) return

  const res = nuxtblog.http.fetch('https://api.example.com/notify', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: { title: data.title, id: data.id },
  })

  if (res.ok) {
    nuxtblog.log.info(`推送成功，远端 ID：${(res.body as any).id}`)
  } else {
    nuxtblog.log.error(`推送失败：${res.error ?? `HTTP ${res.status}`}`)
  }
})
```

---

### `nuxtblog.store` — 持久化存储

```ts
nuxtblog.store.get(key: string): unknown
nuxtblog.store.set(key: string, value: unknown): void
nuxtblog.store.delete(key: string): void
```

每个插件独立的键值存储，数据持久保存在数据库 `options` 表中。键名自动按插件 ID 命名空间隔离，插件之间无法互相访问对方的数据。

值可以是任意 JSON 可序列化类型：字符串、数字、布尔值、数组、对象。

> 需要在 `capabilities.store` 中声明 `read: true` 和/或 `write: true`。

```ts
// 记录累计推送次数
nuxtblog.on('post.published', (data) => {
  const count = ((nuxtblog.store.get('push_count') as number) || 0) + 1
  nuxtblog.store.set('push_count', count)

  // 缓存最近推送的文章
  nuxtblog.store.set('last_post', {
    id: data.id,
    title: data.title,
    at: new Date().toISOString(),
  })
})

// 插件重装时清除缓存状态
nuxtblog.on('plugin.installed', (_data) => {
  nuxtblog.store.delete('push_count')
  nuxtblog.store.delete('last_post')
})
```

> **区分 store 和 settings：**  
> `nuxtblog.store` 用于**运行时状态**（计数、缓存、上次执行时间等）。  
> 管理员配置的参数（API Key、URL、开关）请用 `nuxtblog.settings`。

---

### `nuxtblog.settings` — 读取配置

```ts
nuxtblog.settings.get(key: string): unknown
```

读取管理员在后台配置的参数值。结果缓存 **30 秒**，避免高频事件时频繁查询数据库。管理员修改设置后，下一次缓存过期时自动生效，无需重启插件。

始终可用，无需声明任何 capability。

```ts
const token   = nuxtblog.settings.get('api_token')   as string  | null
const enabled = nuxtblog.settings.get('enabled')     as boolean | null
const timeout = nuxtblog.settings.get('timeout')     as number  | null

if (!token) {
  nuxtblog.log.warn('未配置 api_token，跳过执行')
  return
}
```

---

### `nuxtblog.log` — 服务端日志

```ts
nuxtblog.log.info(msg: string): void
nuxtblog.log.warn(msg: string): void
nuxtblog.log.error(msg: string): void
nuxtblog.log.debug(msg: string): void
```

写入服务端日志，每条消息自动添加 `[plugin:<id>]` 前缀，在服务端控制台和日志文件中可见。

始终可用，无需声明任何 capability。

```ts
nuxtblog.log.info('插件初始化完成')
nuxtblog.log.debug(`收到事件数据：${JSON.stringify(data)}`)
nuxtblog.log.warn('api_token 未配置，部分功能已禁用')
nuxtblog.log.error(`意外的响应状态：${res.status}`)
```

---

## 声明式 Webhook

简单的出站通知可以完全通过清单配置，无需编写 JS。事件触发时，平台将事件 payload 以 JSON 格式 POST 到配置的 URL。

Webhook 异步触发，**绝不阻塞**原始请求。失败信息写入插件的错误环形缓冲区，不自动重试。

**严禁在清单中硬编码密钥。** 在 `url` 和 header 值中使用 `{{settings.key}}` 占位符，平台在派发时从管理员配置的参数中解析（30 秒缓存）。

```json
{
  "plugin": {
    "settings": [
      { "key": "webhook_url",   "label": "Webhook URL",   "type": "string",   "required": true },
      { "key": "webhook_token", "label": "Webhook Token", "type": "password", "required": true }
    ],
    "webhooks": [
      {
        "url":    "{{settings.webhook_url}}",
        "events": ["post.published", "comment.created"],
        "headers": {
          "Authorization": "Bearer {{settings.webhook_token}}",
          "X-Source": "nuxtblog"
        }
      },
      {
        "url":    "https://example.com/static-endpoint",
        "events": ["user.registered"]
      }
    ]
  }
}
```

### `WebhookDef` 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `url` | string | POST 目标地址。支持 `{{settings.key}}` 插值 |
| `events` | string[] | 要匹配的事件名或事件模式 |
| `headers` | object | 附加 HTTP 请求头。值支持 `{{settings.key}}` 插值 |

### 事件匹配模式

| 模式 | 匹配范围 |
|---|---|
| `"post.published"` | 仅精确匹配 |
| `"post.*"` | 所有 `post.` 前缀事件：`post.created`、`post.updated` 等 |
| `"*"` | 所有事件 |

---

## 声明式 Pipeline（多步流水线）

需要条件分支、重试和多步骤协调的复杂异步工作流，可以完全通过清单声明，无需编写调度逻辑。Pipeline 异步触发，不阻塞原始事件。

Pipeline `js` 步骤调用的 JS 函数必须在脚本模块作用域导出（顶层 `function` 声明）。

```json
{
  "plugin": {
    "capabilities": {
      "http": { "allow": ["ai-api.example.com", "hooks.slack.com"] }
    },
    "pipelines": [
      {
        "name":    "文章发布流水线",
        "trigger": "post.published",
        "steps": [
          {
            "type":       "js",
            "name":       "AI 摘要生成",
            "fn":         "generateSummary",
            "timeout_ms": 8000,
            "retry":      1
          },
          {
            "type": "condition",
            "name": "按文章类型分流",
            "if":   "ctx.data.post_type === 0",
            "then": [
              { "type": "js",      "name": "推送 Slack",   "fn": "notifySlack" }
            ],
            "else": [
              { "type": "webhook", "name": "页面 Webhook", "url": "https://hooks.example.com/pages" }
            ]
          }
        ]
      }
    ]
  }
}
```

```ts
// src/index.ts — Pipeline 步骤调用的函数必须在模块顶层声明

function generateSummary(ctx: StepContext) {
  const res = nuxtblog.http.fetch<{ summary: string }>('https://ai-api.example.com/summarize', {
    method: 'POST',
    body: { content: ctx.data.content as string },
  })
  if (res.ok) {
    ctx.data.excerpt = res.body.summary  // 传递给后续步骤
  } else {
    ctx.abort(`AI API 错误：HTTP ${res.status}`)
  }
}

function notifySlack(ctx: StepContext) {
  nuxtblog.http.fetch('https://hooks.slack.com/services/xxx', {
    method: 'POST',
    body: { text: `文章已发布：${ctx.data.title}` },
  })
}
```

### 步骤类型

| `type` | 说明 |
|---|---|
| `"js"` | 按名称调用导出的 JS 函数（`fn`）。支持 `timeout_ms` 和 `retry` |
| `"webhook"` | 将 `StepContext.data` 以 JSON POST 到 `url`。支持 `timeout_ms` 和 `retry` |
| `"condition"` | 对 `if` 中的 JS 布尔表达式求值，根据结果执行 `then` 或 `else` 分支 |

### `StepContext` 对象

| 属性 | 类型 | 说明 |
|---|---|---|
| `ctx.event` | string | 触发事件名 |
| `ctx.data` | object | 在所有步骤间流动的共享可变载荷 |
| `ctx.meta` | object | 步骤间的 KV 共享存储 |
| `ctx.abort(reason)` | function | 终止流水线，后续步骤被跳过 |

### 重试退避策略

当 `retry` > 0 时，失败的步骤按指数退避重试：

| 重试次数 | 等待时间 |
|---|---|
| 第 1 次 | 200 ms |
| 第 2 次 | 400 ms |
| 第 3 次 | 800 ms |
| … | 每次翻倍，最大上限 **8 秒** |

### 步骤默认值

| 属性 | 默认值 |
|---|---|
| `timeout_ms` | `5000`（5 秒） |
| `retry` | `0`（不重试） |

---

## 所有事件列表

### fire-and-forget 事件（`nuxtblog.on`）

#### 文章（post）

| 事件 | 触发时机 | payload 字段 |
|---|---|---|
| `post.created` | 文章创建后 | `id, title, slug, excerpt, post_type, author_id, status` |
| `post.updated` | 文章更新后 | `id, title, slug, excerpt, post_type, author_id, status` |
| `post.published` | 文章 status 变为已发布后 | `id, title, slug, excerpt, post_type, author_id` |
| `post.deleted` | 文章删除/移入回收站后 | `id, title, slug, post_type, author_id` |
| `post.viewed` | 文章被浏览后 | `id, user_id` |

`post_type`：`0` = 文章，`1` = 页面  
`status`：`0` = 草稿，`1` = 已发布，`2` = 回收站

#### 评论（comment）

| 事件 | 触发时机 | payload 字段 |
|---|---|---|
| `comment.created` | 评论提交后 | `id, status, object_type, object_id, object_title, object_slug, post_author_id, parent_id?, parent_author_id, author_id, author_name, author_email, content` |
| `comment.deleted` | 评论删除后 | `id, object_type, object_id` |
| `comment.status_changed` | 评论审核状态变更后 | `id, object_type, object_id, old_status, new_status, moderator_id` |
| `comment.approved` | 评论通过审核后 | `id, object_type, object_id, moderator_id` |

`status`：`0` = 待审核，`1` = 已通过，`2` = 垃圾

#### 用户（user）

| 事件 | 触发时机 | payload 字段 |
|---|---|---|
| `user.registered` | 用户注册后 | `id, username, email, display_name, locale, role` |
| `user.updated` | 用户信息更新后 | `id, username, email, display_name, locale, role, status` |
| `user.deleted` | 用户删除后 | `id, username, email` |
| `user.followed` | 用户关注他人后 | `follower_id, follower_name, follower_avatar, following_id` |
| `user.login` | 用户登录后 | `id, username, email, role` |
| `user.logout` | 用户退出后 | `id` |

`role`：`0` = 订阅者，`1` = 投稿者，`2` = 编辑，`3` = 管理员  
`status`：`0` = 正常，`1` = 禁用

#### 媒体（media）

| 事件 | 触发时机 | payload 字段 |
|---|---|---|
| `media.uploaded` | 文件上传后 | `id, uploader_id, filename, mime_type, file_size, url, category, width, height` |
| `media.deleted` | 文件删除后 | `id, uploader_id, filename, mime_type, category` |

#### 分类 / 标签（taxonomy / term）

| 事件 | 触发时机 | payload 字段 |
|---|---|---|
| `taxonomy.created` | 分类/标签关联创建后 | `id, term_id, term_name, term_slug, taxonomy` |
| `taxonomy.deleted` | 分类/标签关联删除后 | `id, term_name, term_slug, taxonomy` |
| `term.created` | 词条创建后 | `id, name, slug` |
| `term.deleted` | 词条删除后 | `id, name, slug` |

#### 反应 / 签到

| 事件 | 触发时机 | payload 字段 |
|---|---|---|
| `reaction.added` | 点赞/收藏后 | `user_id, object_type, object_id, type` |
| `reaction.removed` | 取消点赞/收藏后 | `user_id, object_type, object_id, type` |
| `checkin.done` | 用户签到后 | `user_id, streak, already_checked_in` |

`type`：`"like"` 或 `"bookmark"`

#### 系统

| 事件 | 触发时机 | payload 字段 |
|---|---|---|
| `option.updated` | 站点配置项更改后 | `key, value` |
| `plugin.installed` | 插件安装后 | `id, title, version, author` |
| `plugin.uninstalled` | 插件卸载后 | `id` |

---

### filter 拦截事件（`nuxtblog.filter`）

| 事件 | 触发时机 | `ctx.data` 字段 | 备注 |
|---|---|---|---|
| `post.create` | 文章写入 DB 前 | `title, slug, content, excerpt, status` | |
| `post.update` | 文章更新写入 DB 前 | 仅包含本次变更的字段（Partial） | |
| `post.delete` | 文章删除前 | `id` | `abort()` 可取消删除 |
| `comment.create` | 评论写入 DB 前 | `content, author_name, author_email` | |
| `comment.delete` | 评论删除前 | `id` | `abort()` 可取消删除 |
| `term.create` | 词条写入 DB 前 | `name, slug` | |
| `user.register` | 用户注册写入 DB 前 | `username, email, display_name` | |
| `user.update` | 用户信息更新写入 DB 前 | 仅包含本次变更的字段（Partial） | |
| `media.upload` | 媒体元数据写入 DB 前 | `filename, mime_type, category, alt_text, title` | |
| `content.render` | 内容渲染给读者前 | `content` | 修改 `ctx.data.content` 改变读者看到的内容，不影响存储 |

---

## 执行模型与并发

- 每个插件拥有**独立的 goja VM** 和**独立的互斥锁（mutex）**。所有 VM 操作（RunString、函数调用、ToValue 等）均须持锁执行。
- `nuxtblog.on` 的 handler 超时通过 `vm.Interrupt` 实现（goroutine 安全，无需持锁即可调用）。
- `nuxtblog.filter` 的 handler 超时同样通过 `vm.Interrupt` 实现，50 ms 上限是故意设计的，用于保证请求延迟可预期。
- 多个插件按 `priority` 升序执行。同优先级时按插件 ID 字母顺序排序。
- `inFilter` 是一个原子标志位，在 filter 链执行期间设为 `true`。`http.fetch` 检查此标志，在 filter 中被调用时返回错误对象（不 panic/throw）。
- Pipeline goroutine 和 Webhook goroutine 均为 fire-and-forget，绝不阻塞 `fanOut`。

---

## 超时与重试

| 场景 | 默认超时 | 是否可配置 |
|---|---|---|
| `nuxtblog.on` handler | 3 秒 | 计划支持（清单配置） |
| `nuxtblog.filter` handler | 50 ms | 计划支持（清单配置） |
| Pipeline `js` 步骤 | 5 秒 | `timeout_ms` 字段 |
| Pipeline `webhook` 步骤 | 5 秒 | `timeout_ms` 字段 |
| Pipeline `condition` 步骤 | 50 ms | 不可配置 |
| `http.fetch` 单次请求 | 15 秒 | `capabilities.http.timeout_ms` |
| 声明式 Webhook POST | 10 秒 | 不可配置 |

---

## 可观测性

插件引擎通过服务端内部 API 暴露运行时指标。

### 执行统计（`GetStats`）

| 字段 | 说明 |
|---|---|
| `plugin_id` | 插件 ID |
| `invocations` | 累计执行次数（handler + filter） |
| `errors` | 累计错误次数 |
| `avg_duration_ms` | 平均执行时间（毫秒） |
| `last_error` | 最近一次错误信息 |
| `last_error_at` | 最近一次错误时间 |

### 滑动窗口历史（`GetHistory`）

60 个按分钟划分的时间桶，覆盖最近 1 小时。每个桶包含该分钟的 `invocations` 和 `errors`。无活动的时间桶返回零值，调用方始终得到精确 60 个数据点。

### 错误环形缓冲区（`GetErrors`）

保存最近 100 条错误记录，满后自动覆盖最旧的条目。每条记录包含：

| 字段 | 说明 |
|---|---|
| `at` | 错误发生时间 |
| `event` | 触发错误的事件名 |
| `message` | 错误信息 |
| `input_diff` | `ctx.data` 变更的 JSON diff（仅 filter 错误有此字段） |

diff 格式：`+key` = 新增，`-key` = 删除，`~key` = 变更（包含 `{ before, after }`）。

---

## 打包与安装

### 使用 esbuild 打包（推荐）

```bash
npm install -D esbuild

npx esbuild src/index.ts \
  --bundle \
  --platform=neutral \
  --main-fields=browser,module,main \
  --target=es2015 \
  --outfile=index.js
```

### 打包成压缩包

服务端使用 [mholt/archives](https://github.com/mholt/archives) 解包，支持以下格式：

| 格式 | 扩展名 |
|---|---|
| ZIP | `.zip` |
| Tar + Gzip | `.tar.gz` / `.tgz` |
| Tar + Bzip2 | `.tar.bz2` |
| Tar + XZ | `.tar.xz` |
| Tar + Zstd | `.tar.zst` |
| 7-Zip | `.7z` |
| RAR | `.rar` |

**ZIP（Python）：**

```python
import zipfile
with zipfile.ZipFile("my-plugin.zip", "w", zipfile.ZIP_DEFLATED) as z:
    z.write("package.json")
    z.write("index.js")
```

**tar.gz（Shell）：**

```bash
tar -czf my-plugin.tar.gz package.json index.js
```

**PowerShell：**

```powershell
Compress-Archive -Path package.json, index.js -DestinationPath my-plugin.zip
```

### 安装方式

1. **本地安装** — 管理后台 → 插件 → 安装插件 → 本地 ZIP → 上传
2. **GitHub 安装** — 管理后台 → 插件 → 安装插件 → GitHub → 填写 `owner/repo`（系统自动下载最新 Release 中名为 `plugin.zip` 的资源）

---

## TypeScript 支持

安装 SDK 包以获得 `nuxtblog` 全局对象的完整类型定义：

```bash
pnpm add -D @nuxtblog/plugin-sdk
# 或
npm install -D @nuxtblog/plugin-sdk
```

**`tsconfig.json`：**

```json
{
  "extends": "@nuxtblog/plugin-sdk",
  "include": ["src"]
}
```

**或在入口文件顶部添加引用：**

```ts
/// <reference path="../../node_modules/@nuxtblog/plugin-sdk/index.d.ts" />
```

---

## License

MIT
