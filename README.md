# @nuxtblog/plugin-sdk

TypeScript type definitions and base `tsconfig` for [nuxtblog](https://github.com/nuxtblog/nuxtblog) plugins.

## Installation

```bash
pnpm add -D @nuxtblog/plugin-sdk
# or
npm install -D @nuxtblog/plugin-sdk
```

## Usage

### tsconfig.json

```json
{
  "extends": "@nuxtblog/plugin-sdk",
  "include": ["src"]
}
```

This gives you strict TypeScript compiler options and the global `nuxtblog` object with full type coverage.

---

## Plugin manifest (package.json)

Every plugin declares its metadata and permissions in `package.json` under the `"plugin"` field.
Capabilities must be explicitly declared — only declared APIs are injected into the plugin VM.

```json
{
  "name": "owner/my-plugin",
  "version": "1.0.0",
  "description": "What it does",
  "author": "owner",
  "license": "MIT",
  "plugin": {
    "title": "My Plugin",
    "icon": "i-tabler-plug",
    "entry": "dist/index.js",
    "priority": 10,
    "capabilities": {
      "http":  { "allow": ["hooks.slack.com"], "timeout_ms": 5000 },
      "store": { "read": true, "write": true }
    },
    "settings": [
      { "key": "webhook_url", "label": "Slack Webhook URL", "type": "string", "required": true }
    ]
  }
}
```

---

## Plugin API

### `nuxtblog.filter` — synchronous interceptor

Runs **before** data is written to the database. Modify `ctx.data` or call `ctx.abort()` to cancel.
HTTP requests are **not allowed** inside filter handlers.

```ts
// src/index.ts

nuxtblog.filter('post.create', (ctx) => {
  if (!ctx.data.title) {
    ctx.abort('title is required')
    return
  }
  ctx.data.title = ctx.data.title.trim()
  // ctx.next() is optional — the chain continues unless abort() is called
})

nuxtblog.filter('content.render', (ctx) => {
  // ctx.input  — read-only snapshot before the chain (for diff/audit)
  // ctx.data   — mutable, changes are returned to the caller
  // ctx.meta   — shared KV across all plugins in the same chain
  ctx.data.content = ctx.data.content.replace(/\bfoo\b/g, 'bar')
})
```

### `nuxtblog.on` — async event handler

Runs **after** the operation completes. HTTP requests are allowed.

```ts
nuxtblog.on('post.published', (data) => {
  const url = nuxtblog.settings.get('webhook_url') as string
  nuxtblog.http.fetch(url, {
    method: 'POST',
    body: { text: `New post: ${data.title}` },
  })
})

nuxtblog.on('user.registered', (data) => {
  nuxtblog.log.info(`New user: ${data.username} (${data.email})`)
})
```

### `nuxtblog.http.fetch` — synchronous HTTP

Available when `capabilities.http` is declared. Returns immediately (not a Promise).
Blocked inside `filter` handlers.

```ts
const res = nuxtblog.http.fetch<{ id: string }>('https://api.example.com/create', {
  method: 'POST',
  body: { title: 'Hello' },
  headers: { Authorization: 'Bearer token' },
})

if (res.ok) {
  nuxtblog.log.info('created: ' + res.body.id)
} else {
  nuxtblog.log.error(res.error ?? `HTTP ${res.status}`)
}
```

### `nuxtblog.store` — persistent key-value store

Available when `capabilities.store` is declared. Keys are namespaced per plugin.

```ts
nuxtblog.store.set('last_run', new Date().toISOString())
const last = nuxtblog.store.get('last_run') // unknown
nuxtblog.store.delete('last_run')
```

### `nuxtblog.settings.get` — admin-configured settings

Always available. Cached for 30 seconds.

```ts
const apiKey = nuxtblog.settings.get('api_key') as string
```

### `nuxtblog.log` — server logging

```ts
nuxtblog.log.info('hello')
nuxtblog.log.warn('something looks off')
nuxtblog.log.error('this failed')
nuxtblog.log.debug('verbose details')
```

---

## Declarative webhooks (no JS needed)

Simple outbound notifications can be declared in the manifest instead of writing JS.

**Never hardcode secrets in the manifest.** Use `{{settings.key}}` placeholders in `url`
and header values — they are resolved at dispatch time from admin-configured settings:

```json
{
  "plugin": {
    "settings": [
      { "key": "webhook_url",   "label": "Webhook URL",   "type": "string",   "placeholder": "https://hooks.slack.com/..." },
      { "key": "webhook_token", "label": "Webhook Token", "type": "password", "placeholder": "xoxb-..." }
    ],
    "webhooks": [
      {
        "url": "{{settings.webhook_url}}",
        "events": ["post.published", "comment.created"],
        "headers": { "Authorization": "Bearer {{settings.webhook_token}}" }
      }
    ]
  }
}
```

Event patterns: `"post.*"` matches all post events; `"*"` matches everything.

---

## Declarative pipelines (multi-step async workflows)

For multi-step workflows with conditionals and retries, declare a pipeline in the manifest.
JS functions exported at module scope are called by name.

```json
{
  "plugin": {
    "capabilities": {
      "http": { "allow": ["ai-api.example.com", "hooks.slack.com"] }
    },
    "pipelines": [
      {
        "name": "post-publish",
        "trigger": "post.published",
        "steps": [
          {
            "type": "js",
            "name": "Generate summary",
            "fn": "generateSummary",
            "timeout_ms": 8000,
            "retry": 1
          },
          {
            "type": "condition",
            "name": "Branch by category",
            "if": "ctx.data.category === 'tech'",
            "then": [
              { "type": "webhook", "name": "Post to Twitter", "url": "https://api.twitter.com/..." }
            ],
            "else": [
              { "type": "js", "name": "Notify Slack", "fn": "notifySlack" }
            ]
          }
        ]
      }
    ]
  }
}
```

```ts
// src/index.ts — functions called by pipeline steps must be exported at module scope

function generateSummary(ctx: StepContext) {
  const res = nuxtblog.http.fetch<{ summary: string }>('https://ai-api.example.com/summarize', {
    method: 'POST',
    body: { content: ctx.data.content as string },
  })
  if (res.ok) {
    ctx.data.excerpt = res.body.summary
  }
}

function notifySlack(ctx: StepContext) {
  nuxtblog.http.fetch('https://hooks.slack.com/services/xxx', {
    method: 'POST',
    body: { text: `New post: ${ctx.data.title}` },
  })
}
```

Step types:
- `"js"` — call an exported JS function; supports `timeout_ms` and `retry`
- `"webhook"` — POST the event payload to a URL; supports `timeout_ms` and `retry`
- `"condition"` — evaluate a JS boolean expression, branch to `then` or `else`

Retry backoff: 200 ms → 400 ms → 800 ms … capped at 8 s.

---

## Event reference

### Fire-and-forget events (`nuxtblog.on`)

| Event | Payload type |
|-------|-------------|
| `post.created` | `PostCreatedPayload` |
| `post.updated` | `PostUpdatedPayload` |
| `post.published` | `PostPublishedPayload` |
| `post.deleted` | `PostDeletedPayload` |
| `post.viewed` | `PostViewedPayload` |
| `comment.created` | `CommentCreatedPayload` |
| `comment.deleted` | `CommentDeletedPayload` |
| `comment.status_changed` | `CommentStatusChangedPayload` |
| `comment.approved` | `CommentApprovedPayload` |
| `user.registered` | `UserRegisteredPayload` |
| `user.updated` | `UserUpdatedPayload` |
| `user.deleted` | `UserDeletedPayload` |
| `user.followed` | `UserFollowedPayload` |
| `user.login` | `UserLoginPayload` |
| `user.logout` | `UserLogoutPayload` |
| `media.uploaded` | `MediaUploadedPayload` |
| `media.deleted` | `MediaDeletedPayload` |
| `taxonomy.created` | `TaxonomyCreatedPayload` |
| `taxonomy.deleted` | `TaxonomyDeletedPayload` |
| `term.created` | `TermCreatedPayload` |
| `term.deleted` | `TermDeletedPayload` |
| `reaction.added` | `ReactionPayload` |
| `reaction.removed` | `ReactionPayload` |
| `checkin.done` | `CheckinPayload` |
| `option.updated` | `OptionUpdatedPayload` |
| `plugin.installed` | `PluginInstalledPayload` |
| `plugin.uninstalled` | `PluginUninstalledPayload` |

### Filter events (`nuxtblog.filter`)

| Event | `ctx.data` type | Notes |
|-------|----------------|-------|
| `post.create` | `FilterPostCreateData` | |
| `post.update` | `FilterPostUpdateData` | Only updated fields are present |
| `post.delete` | `FilterPostDeleteData` | `abort()` cancels the deletion |
| `comment.create` | `FilterCommentCreateData` | |
| `comment.delete` | `FilterCommentDeleteData` | `abort()` cancels the deletion |
| `term.create` | `FilterTermCreateData` | |
| `user.register` | `FilterUserRegisterData` | |
| `user.update` | `FilterUserUpdateData` | Only updated fields are present |
| `media.upload` | `FilterMediaUploadData` | |
| `content.render` | `FilterContentRenderData` | Modify `ctx.data.content` to change what readers see |

---

## Publishing a plugin

See the [nuxtblog plugin registry](https://github.com/nuxtblog/registry) for how to submit your plugin to the marketplace.

## License

MIT
