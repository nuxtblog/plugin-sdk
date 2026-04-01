# @nuxtblog/plugin-sdk

TypeScript type definitions and developer guide for [nuxtblog](https://github.com/nuxtblog/nuxtblog) plugins.

English(README.md)|(中文文档](README.zh.md)

---

## Table of Contents

- [Overview](#overview)
- [Plugin Structure](#plugin-structure)
- [Manifest (`package.json`)](#manifest-packagejson)
- [Settings Fields](#settings-fields)
- [Capabilities &amp; Permissions](#capabilities--permissions)
- [Plugin API Reference](#plugin-api-reference)
  - [nuxtblog.on — Event Subscription](#nuxtblogon--event-subscription)
  - [nuxtblog.filter — Data Interception](#nuxtblogfilter--data-interception)
  - [nuxtblog.http — HTTP Requests](#nuxtbloghttp--http-requests)
  - [nuxtblog.store — Persistent KV Store](#nuxtblogstore--persistent-kv-store)
  - [nuxtblog.settings — Read Settings](#nuxtblogsettings--read-settings)
  - [nuxtblog.log — Server Logging](#nuxtbloglog--server-logging)
- [Declarative Webhooks](#declarative-webhooks)
- [Declarative Pipelines](#declarative-pipelines)
- [Event Reference](#event-reference)
  - [Fire-and-forget Events](#fire-and-forget-events-nuxtblogon)
  - [Filter Events](#filter-events-nuxtblogfilter)
- [Execution Model &amp; Concurrency](#execution-model--concurrency)
- [Timeouts &amp; Retry](#timeouts--retry)
- [Observability](#observability)
- [Building &amp; Installing](#building--installing)
- [TypeScript Support](#typescript-support)

---

## Overview

Plugins are **server-side JavaScript scripts** executed by the [goja](https://github.com/dop251/goja) engine (ES2015+ compatible). Each plugin runs in an isolated VM with its own `nuxtblog` global object.

**What plugins can do:**

- Subscribe to system events (posts, comments, users, media, etc.) asynchronously — fire-and-forget
- Intercept and modify data synchronously before it is written to the database, or abort the operation entirely
- Read admin-configured settings (API tokens, webhook URLs, feature flags, etc.)
- Make outbound HTTP requests to external services
- Persist runtime state in a per-plugin key-value store backed by the database
- Declare outbound webhooks and multi-step async pipelines entirely in the manifest — no JS required

**What plugins cannot do:**

- Call `http.fetch` inside `filter` handlers (this would stall request processing — use `nuxtblog.on` for async side-effects)
- Access APIs not declared in `capabilities` (undeclared APIs are simply absent in the VM — `undefined`, not an error)
- Share VM state with other plugins (each plugin has a completely isolated runtime)

---

## Plugin Structure

```
my-plugin/
├── package.json      ← Plugin manifest (required, contains "plugin" field)
├── index.js          ← Bundled single-file entry script (loaded by the server)
└── src/
    └── index.ts      ← TypeScript source (optional, for development)
```

The installation archive only needs to contain `package.json` and `index.js`:

```
my-plugin.zip
├── package.json
└── index.js          (or the path declared in plugin.entry)
```

---

## Manifest (`package.json`)

The manifest lives in the standard `package.json`. All plugin-specific configuration is nested under the `"plugin"` key.

```json
{
  "name": "owner/my-plugin",
  "version": "1.0.0",
  "description": "A short description of what the plugin does",
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

### Top-level fields (standard npm)

| Field           | Type     | Required | Description                                                                                |
| --------------- | -------- | -------- | ------------------------------------------------------------------------------------------ |
| `name`        | string   | ✅       | Unique plugin ID. Recommended format:`owner/repo`. Cannot be changed after installation. |
| `version`     | string   | ✅       | Semantic version, e.g.`1.0.0`                                                            |
| `description` | string   |          | Short description shown in the admin UI                                                    |
| `author`      | string   |          | Author name                                                                                |
| `license`     | string   |          | License identifier, e.g.`MIT`                                                            |
| `homepage`    | string   |          | Plugin homepage or repository URL                                                          |
| `keywords`    | string[] |          | Tags for discovery; include `nuxtblog-plugin`                                            |

### `"plugin"` field

| Field            | Type   | Required | Description                                                                            |
| ---------------- | ------ | -------- | -------------------------------------------------------------------------------------- |
| `title`        | string | ✅       | Display name shown in the admin panel                                                  |
| `icon`         | string |          | [Tabler Icons](https://tabler.io/icons) identifier, e.g. `i-tabler-bell`                |
| `entry`        | string |          | Entry script path inside the archive. Default:`index.js`                             |
| `priority`     | number |          | Execution order among plugins. Lower = runs first. Default:`10`                      |
| `capabilities` | object |          | Declared API permissions. See[Capabilities &amp; Permissions](#capabilities--permissions) |
| `settings`     | array  |          | Admin-configurable parameters. See[Settings Fields](#settings-fields)                     |
| `webhooks`     | array  |          | Declarative outbound webhooks. See[Declarative Webhooks](#declarative-webhooks)           |
| `pipelines`    | array  |          | Declarative async pipelines. See[Declarative Pipelines](#declarative-pipelines)           |

---

## Settings Fields

The `settings` array declares parameters that administrators configure in the plugin settings UI. Plugins read them at runtime via `nuxtblog.settings.get(key)`.

### Field types

| `type`     | UI control              | Use case                                  |
| ------------ | ----------------------- | ----------------------------------------- |
| `string`   | Single-line text input  | URLs, names, arbitrary strings            |
| `password` | Password input (masked) | API keys, tokens, secrets                 |
| `number`   | Numeric input           | Timeouts, limits, counts                  |
| `boolean`  | Toggle switch           | Feature flags                             |
| `select`   | Dropdown                | Enumerated options (use with `options`) |
| `textarea` | Multi-line text         | Templates, JSON config, long strings      |

### Field properties

```json
{
  "key":         "api_token",
  "label":       "API Token",
  "type":        "password",
  "required":    true,
  "default":     "",
  "placeholder": "sk-xxxxxxxx",
  "description": "Copy from your provider's dashboard",
  "options":     []
}
```

| Property        | Type     | Description                                           |
| --------------- | -------- | ----------------------------------------------------- |
| `key`         | string   | Key used in `nuxtblog.settings.get(key)`            |
| `label`       | string   | Form label shown in the admin UI                      |
| `type`        | string   | Control type (see table above)                        |
| `required`    | boolean  | Whether the field is required (visual indicator only) |
| `default`     | any      | Default value populated on install                    |
| `placeholder` | string   | Input placeholder text                                |
| `description` | string   | Help text shown below the field                       |
| `options`     | string[] | Dropdown options (only for `type: "select"`)        |

### Complete example

```json
"settings": [
  { "key": "enabled",     "label": "Enable plugin",     "type": "boolean",  "default": true },
  { "key": "api_token",   "label": "API Token",          "type": "password", "required": true, "placeholder": "sk-xxxxxxxx" },
  { "key": "webhook_url", "label": "Webhook URL",        "type": "string",   "placeholder": "https://example.com/hook" },
  { "key": "timeout",     "label": "Timeout (seconds)",  "type": "number",   "default": 10 },
  { "key": "log_level",   "label": "Log level",          "type": "select",   "default": "info", "options": ["debug","info","warn","error"] },
  { "key": "template",    "label": "Message template",   "type": "textarea", "placeholder": "New post: {{title}}" }
]
```

---

## Capabilities & Permissions

Capabilities follow a **whitelist model**: only APIs you explicitly declare in `capabilities` are injected into the VM. Undeclared APIs are simply `undefined` — accessing them does not throw.

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

| Property       | Type     | Default      | Description                                                                                                                                       |
| -------------- | -------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `allow`      | string[] | `[]` (any) | Domain allowlist. Subdomains are allowed automatically (e.g.`example.com` also permits `api.example.com`). Empty list = any domain permitted. |
| `timeout_ms` | number   | `15000`    | Per-request timeout in milliseconds.                                                                                                              |

### `store`

| Property  | Type    | Description                                                           |
| --------- | ------- | --------------------------------------------------------------------- |
| `read`  | boolean | Grants access to `nuxtblog.store.get`                               |
| `write` | boolean | Grants access to `nuxtblog.store.set` and `nuxtblog.store.delete` |

> **Security note:** `nuxtblog.on` and `nuxtblog.filter` are always available regardless of capabilities, as is `nuxtblog.log` and `nuxtblog.settings`. These require no declaration.

---

## Plugin API Reference

### `nuxtblog.on` — Event Subscription

```ts
nuxtblog.on(event: string, handler: (payload: object) => void): void
```

Subscribes to a fire-and-forget system event. The handler runs **asynchronously** after the operation completes. Errors in the handler are logged and written to the error ring buffer; they never affect the original operation.

**Key constraints:**

- Handler timeout: **3 seconds** (configurable in manifest)
- `http.fetch` is allowed inside `nuxtblog.on` handlers
- Multiple handlers for the same event execute in **priority order** (lower plugin priority = runs first)

```ts
// Notify Slack when a post is published
nuxtblog.on('post.published', (data) => {
  const url = nuxtblog.settings.get('webhook_url') as string
  if (!url) return

  const res = nuxtblog.http.fetch(url, {
    method: 'POST',
    body: { text: `New post: ${data.title} — ${data.slug}` },
  })
  if (!res.ok) {
    nuxtblog.log.warn(`Slack notify failed: HTTP ${res.status}`)
  }
})

// Track a per-plugin post counter
nuxtblog.on('post.created', (_data) => {
  const count = ((nuxtblog.store.get('post_count') as number) || 0) + 1
  nuxtblog.store.set('post_count', count)
  nuxtblog.log.info(`Total posts tracked: ${count}`)
})
```

---

### `nuxtblog.filter` — Data Interception

```ts
nuxtblog.filter(event: string, handler: (ctx: PluginCtx) => void): void
```

Intercepts data **synchronously** before it is written to the database. The handler receives a `ctx` object. Modify `ctx.data` to change what gets saved; call `ctx.abort(reason)` to cancel the entire operation.

**Key constraints:**

- Handler timeout: **50 milliseconds** (hard limit — keeps request latency acceptable)
- `http.fetch` is **blocked** inside filter handlers. Use `nuxtblog.on` for async side-effects.
- All plugins run in priority order; `ctx.meta` is shared across plugins in the same chain

**`ctx` object:**

| Property              | Type     | Description                                                                                                                     |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `ctx.event`         | string   | The filter event name, e.g.`"filter:post.create"`                                                                             |
| `ctx.data`          | object   | Mutable payload. Changes are returned to the caller.                                                                            |
| `ctx.input`         | object   | Read-only deep-copy snapshot of `ctx.data` taken before the chain starts. Use for audit/diff.                                 |
| `ctx.meta`          | object   | Shared KV store across all plugins in this chain. Earlier plugins can leave data for later ones.                                |
| `ctx.next()`        | function | Optional: explicitly signal that this handler is done. The chain continues regardless unless `abort()` is called.             |
| `ctx.abort(reason)` | function | Cancel the operation immediately. All subsequent plugin handlers are skipped. The caller receives an error wrapping `reason`. |

```ts
// Trim whitespace and enforce title length
nuxtblog.filter('post.create', (ctx) => {
  ctx.data.title = (ctx.data.title as string).trim()
  if ((ctx.data.title as string).length > 200) {
    ctx.abort('Title must not exceed 200 characters')
    return
  }
  // Leave a slug hint for the next plugin in the chain
  ctx.meta.computed_slug = (ctx.data.title as string).toLowerCase().replace(/\s+/g, '-')
})

// Auto-generate slug from meta set by the previous plugin
nuxtblog.filter('post.create', (ctx) => {
  if (!ctx.data.slug && ctx.meta.computed_slug) {
    ctx.data.slug = ctx.meta.computed_slug
  }
})

// Block comments containing specific words
nuxtblog.filter('comment.create', (ctx) => {
  const blocked = ['spam', 'advertisement']
  const content = (ctx.data.content as string).toLowerCase()
  if (blocked.some(w => content.includes(w))) {
    ctx.abort('Comment contains prohibited content')
  }
})

// Prevent deletion of posts created in the last hour
nuxtblog.filter('post.delete', (ctx) => {
  // ctx.data: { id }
  // Fetch additional data from store if needed — store.get is allowed in filters
  nuxtblog.log.info(`Post ${ctx.data.id} deletion requested`)
  // ctx.next() — optional
})
```

---

### `nuxtblog.http` — HTTP Requests

```ts
nuxtblog.http.fetch(url: string, options?: FetchOptions): FetchResult
```

Synchronous HTTP request (not a Promise). Returns immediately with the result.

> Requires `capabilities.http` to be declared in the manifest.
> **Blocked inside `filter` handlers.** Use in `nuxtblog.on` handlers or pipeline `js` steps.

**Options:**

| Property    | Type            | Default   | Description                                                                                                     |
| ----------- | --------------- | --------- | --------------------------------------------------------------------------------------------------------------- |
| `method`  | string          | `"GET"` | HTTP method:`GET`, `POST`, `PUT`, `PATCH`, `DELETE`                                                   |
| `body`    | object\| string | —        | Request body. Objects are automatically JSON-serialized.                                                        |
| `headers` | object          | —        | Custom request headers. Setting a body automatically adds `Content-Type: application/json` if not overridden. |

**Return value:**

| Property   | Type    | Description                                                                                 |
| ---------- | ------- | ------------------------------------------------------------------------------------------- |
| `ok`     | boolean | `true` if HTTP status is 200–299                                                         |
| `status` | number  | HTTP status code                                                                            |
| `body`   | any     | Response body, JSON-parsed automatically. Falls back to raw string if parsing fails.        |
| `error`  | string  | Error message if the request failed (network error, timeout, domain not in allowlist, etc.) |

```ts
// POST with JSON body and auth header
const res = nuxtblog.http.fetch('https://api.example.com/notify', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${nuxtblog.settings.get('api_token')}` },
  body: { title: 'Hello', id: 42 },
})

if (res.ok) {
  nuxtblog.log.info(`Created remote record: ${(res.body as any).id}`)
} else {
  nuxtblog.log.error(`Request failed: ${res.error ?? `HTTP ${res.status}`}`)
}
```

---

### `nuxtblog.store` — Persistent KV Store

```ts
nuxtblog.store.get(key: string): unknown
nuxtblog.store.set(key: string, value: unknown): void
nuxtblog.store.delete(key: string): void
```

Per-plugin persistent key-value store backed by the database `options` table. Keys are automatically namespaced per plugin — you cannot read another plugin's data.

Values can be any JSON-serializable type: strings, numbers, booleans, arrays, objects.

> Requires `capabilities.store.read` and/or `capabilities.store.write` to be declared.

```ts
// Track how many posts have been pushed to an external service
nuxtblog.on('post.published', (data) => {
  const count = ((nuxtblog.store.get('push_count') as number) || 0) + 1
  nuxtblog.store.set('push_count', count)

  // Cache the last pushed post ID
  nuxtblog.store.set('last_post', { id: data.id, title: data.title, at: new Date().toISOString() })
})

// On demand: clear cached state
nuxtblog.on('plugin.installed', (_data) => {
  nuxtblog.store.delete('push_count')
  nuxtblog.store.delete('last_post')
})
```

> **Note:** `nuxtblog.store` is for runtime state. For admin-configured values (API keys, URLs, toggles), use `nuxtblog.settings`.

---

### `nuxtblog.settings` — Read Settings

```ts
nuxtblog.settings.get(key: string): unknown
```

Reads a value from the plugin's admin-configured settings. Results are cached for **30 seconds** to avoid per-call database hits; changes made in the admin UI take effect within the next cache expiry.

Always available — no capability declaration required.

```ts
const token   = nuxtblog.settings.get('api_token')   as string  | null
const enabled = nuxtblog.settings.get('enabled')     as boolean | null
const timeout = nuxtblog.settings.get('timeout')     as number  | null

if (!token) {
  nuxtblog.log.warn('api_token not configured — skipping')
  return
}
```

---

### `nuxtblog.log` — Server Logging

```ts
nuxtblog.log.info(msg: string): void
nuxtblog.log.warn(msg: string): void
nuxtblog.log.error(msg: string): void
nuxtblog.log.debug(msg: string): void
```

Writes to the server log. Each message is automatically prefixed with `[plugin:<id>]`.

Always available — no capability declaration required.

```ts
nuxtblog.log.info('Plugin initialized')
nuxtblog.log.debug(`Processing event with data: ${JSON.stringify(data)}`)
nuxtblog.log.warn('api_token is missing — some features are disabled')
nuxtblog.log.error(`Unexpected response: ${res.status}`)
```

---

## Declarative Webhooks

Simple outbound HTTP notifications can be declared entirely in the manifest — no JS required. The platform POSTs the event payload as JSON to the configured URL whenever a matching event fires.

Webhooks fire **asynchronously** (never block the originating request). Failures are written to the plugin's error ring buffer and do not retry.

**Never hardcode secrets.** Use `{{settings.key}}` placeholders in `url` and header values. They are resolved at dispatch time from admin-configured settings (30-second cache).

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

### `WebhookDef` properties

| Property    | Type     | Description                                                            |
| ----------- | -------- | ---------------------------------------------------------------------- |
| `url`     | string   | Endpoint to POST to. Supports `{{settings.key}}` interpolation.      |
| `events`  | string[] | Event names or patterns to match.                                      |
| `headers` | object   | Extra HTTP headers. Values support `{{settings.key}}` interpolation. |

### Event patterns

| Pattern              | Matches                                                                    |
| -------------------- | -------------------------------------------------------------------------- |
| `"post.published"` | Exact match only                                                           |
| `"post.*"`         | All events with `post.` prefix: `post.created`, `post.updated`, etc. |
| `"*"`              | Every event                                                                |

---

## Declarative Pipelines

Multi-step async workflows with conditionals, retries, and timeouts can be declared in the manifest. Pipelines fire asynchronously and never block the originating event.

JS functions called from pipeline steps must be exported at module scope (top-level `function` declarations in your script).

```json
{
  "plugin": {
    "capabilities": {
      "http": { "allow": ["ai-api.example.com", "hooks.slack.com"] }
    },
    "pipelines": [
      {
        "name":    "post-publish",
        "trigger": "post.published",
        "steps": [
          {
            "type":       "js",
            "name":       "Generate AI summary",
            "fn":         "generateSummary",
            "timeout_ms": 8000,
            "retry":      1
          },
          {
            "type": "condition",
            "name": "Branch by post type",
            "if":   "ctx.data.post_type === 0",
            "then": [
              { "type": "js",      "name": "Notify Slack",   "fn": "notifySlack" }
            ],
            "else": [
              { "type": "webhook", "name": "Page webhook",   "url": "https://hooks.example.com/pages" }
            ]
          }
        ]
      }
    ]
  }
}
```

```ts
// src/index.ts — functions called by steps must be at module scope

function generateSummary(ctx: StepContext) {
  const res = nuxtblog.http.fetch<{ summary: string }>('https://ai-api.example.com/summarize', {
    method: 'POST',
    body: { content: ctx.data.content as string },
  })
  if (res.ok) {
    ctx.data.excerpt = res.body.summary  // passes to the next step
  } else {
    ctx.abort(`AI API error: HTTP ${res.status}`)
  }
}

function notifySlack(ctx: StepContext) {
  nuxtblog.http.fetch('https://hooks.slack.com/services/xxx', {
    method: 'POST',
    body: { text: `New post published: ${ctx.data.title}` },
  })
}
```

### Step types

| `type`        | Description                                                                           |
| --------------- | ------------------------------------------------------------------------------------- |
| `"js"`        | Call an exported JS function by name (`fn`). Supports `timeout_ms` and `retry`. |
| `"webhook"`   | POST `StepContext.data` as JSON to `url`. Supports `timeout_ms` and `retry`.  |
| `"condition"` | Evaluate a JS boolean expression (`if`), then run `then` or `else` branches.    |

### `StepContext` object

| Property              | Type     | Description                                      |
| --------------------- | -------- | ------------------------------------------------ |
| `ctx.event`         | string   | The trigger event name                           |
| `ctx.data`          | object   | Shared mutable payload flowing through all steps |
| `ctx.meta`          | object   | Step-to-step KV store                            |
| `ctx.abort(reason)` | function | Stop the pipeline; subsequent steps are skipped  |

### Retry backoff

When `retry` > 0, failed steps are retried with exponential backoff:

| Attempt   | Wait before retry                               |
| --------- | ----------------------------------------------- |
| 1st retry | 200 ms                                          |
| 2nd retry | 400 ms                                          |
| 3rd retry | 800 ms                                          |
| …        | Doubles each time, capped at**8 seconds** |

### Step defaults

| Property       | Default              |
| -------------- | -------------------- |
| `timeout_ms` | `5000` (5 seconds) |
| `retry`      | `0` (no retries)   |

---

## Event Reference

### Fire-and-forget Events (`nuxtblog.on`)

#### Post

| Event              | Trigger                                    | Payload fields                                             |
| ------------------ | ------------------------------------------ | ---------------------------------------------------------- |
| `post.created`   | After a post is created                    | `id, title, slug, excerpt, post_type, author_id, status` |
| `post.updated`   | After a post is updated                    | `id, title, slug, excerpt, post_type, author_id, status` |
| `post.published` | After a post's status changes to published | `id, title, slug, excerpt, post_type, author_id`         |
| `post.deleted`   | After a post is deleted / moved to trash   | `id, title, slug, post_type, author_id`                  |
| `post.viewed`    | After a post is viewed                     | `id, user_id`                                            |

`post_type`: `0` = post, `1` = page
`status`: `0` = draft, `1` = published, `2` = trash

#### Comment

| Event                      | Trigger                                     | Payload fields                                                                                                                                                 |
| -------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `comment.created`        | After a comment is submitted                | `id, status, object_type, object_id, object_title, object_slug, post_author_id, parent_id?, parent_author_id, author_id, author_name, author_email, content` |
| `comment.deleted`        | After a comment is deleted                  | `id, object_type, object_id`                                                                                                                                 |
| `comment.status_changed` | After a comment's moderation status changes | `id, object_type, object_id, old_status, new_status, moderator_id`                                                                                           |
| `comment.approved`       | After a comment is approved                 | `id, object_type, object_id, moderator_id`                                                                                                                   |

`status`: `0` = pending, `1` = approved, `2` = spam

#### User

| Event               | Trigger                         | Payload fields                                                |
| ------------------- | ------------------------------- | ------------------------------------------------------------- |
| `user.registered` | After a user registers          | `id, username, email, display_name, locale, role`           |
| `user.updated`    | After a user profile is updated | `id, username, email, display_name, locale, role, status`   |
| `user.deleted`    | After a user is deleted         | `id, username, email`                                       |
| `user.followed`   | After a user follows another    | `follower_id, follower_name, follower_avatar, following_id` |
| `user.login`      | After a user logs in            | `id, username, email, role`                                 |
| `user.logout`     | After a user logs out           | `id`                                                        |

`role`: `0` = subscriber, `1` = contributor, `2` = editor, `3` = admin
`status`: `0` = active, `1` = banned

#### Media

| Event              | Trigger                  | Payload fields                                                                    |
| ------------------ | ------------------------ | --------------------------------------------------------------------------------- |
| `media.uploaded` | After a file is uploaded | `id, uploader_id, filename, mime_type, file_size, url, category, width, height` |
| `media.deleted`  | After a file is deleted  | `id, uploader_id, filename, mime_type, category`                                |

#### Taxonomy / Term

| Event                | Trigger                                 | Payload fields                                  |
| -------------------- | --------------------------------------- | ----------------------------------------------- |
| `taxonomy.created` | After a taxonomy association is created | `id, term_id, term_name, term_slug, taxonomy` |
| `taxonomy.deleted` | After a taxonomy association is deleted | `id, term_name, term_slug, taxonomy`          |
| `term.created`     | After a term is created                 | `id, name, slug`                              |
| `term.deleted`     | After a term is deleted                 | `id, name, slug`                              |

#### Reactions & Check-in

| Event                | Trigger                             | Payload fields                            |
| -------------------- | ----------------------------------- | ----------------------------------------- |
| `reaction.added`   | After a like or bookmark is added   | `user_id, object_type, object_id, type` |
| `reaction.removed` | After a like or bookmark is removed | `user_id, object_type, object_id, type` |
| `checkin.done`     | After a user checks in              | `user_id, streak, already_checked_in`   |

`type`: `"like"` or `"bookmark"`

#### System

| Event                  | Trigger                        | Payload fields                 |
| ---------------------- | ------------------------------ | ------------------------------ |
| `option.updated`     | After a site option is changed | `key, value`                 |
| `plugin.installed`   | After a plugin is installed    | `id, title, version, author` |
| `plugin.uninstalled` | After a plugin is uninstalled  | `id`                         |

---

### Filter Events (`nuxtblog.filter`)

| Event              | Trigger                                | `ctx.data` fields                                | Notes                                                  |
| ------------------ | -------------------------------------- | -------------------------------------------------- | ------------------------------------------------------ |
| `post.create`    | Before a post is written to DB         | `title, slug, content, excerpt, status`          |                                                        |
| `post.update`    | Before a post update is written        | partial fields only                                | Only fields being changed are present                  |
| `post.delete`    | Before a post is deleted               | `id`                                             | `abort()` cancels the deletion                       |
| `comment.create` | Before a comment is written            | `content, author_name, author_email`             |                                                        |
| `comment.delete` | Before a comment is deleted            | `id`                                             | `abort()` cancels the deletion                       |
| `term.create`    | Before a term is written               | `name, slug`                                     |                                                        |
| `user.register`  | Before a user is written               | `username, email, display_name`                  |                                                        |
| `user.update`    | Before a user update is written        | partial fields only                                | Only fields being changed are present                  |
| `media.upload`   | Before media metadata is written       | `filename, mime_type, category, alt_text, title` |                                                        |
| `content.render` | Before content is rendered for readers | `content`                                        | Modify `ctx.data.content` to change what readers see |

---

## Execution Model & Concurrency

- Each plugin has exactly **one goja VM** and **one mutex**. All VM operations (script execution, handler calls, `ToValue`, etc.) must hold the mutex.
- The `nuxtblog.on` handler timeout is **3 seconds** by default. Timeouts are enforced via `vm.Interrupt` (goroutine-safe; does not require the mutex).
- The `nuxtblog.filter` handler timeout is **50 milliseconds** by default. This is intentionally short to keep request latency predictable.
- Multiple plugins run in ascending **priority** order (lower number = earlier). Within the same priority, plugins are sorted alphabetically by ID.
- `inFilter` is an atomic flag set during filter chain execution. `http.fetch` checks this flag and returns an error object (not a panic/throw) when called inside a filter.
- Pipeline goroutines and webhook goroutines are fire-and-forget — they never block `fanOut`.

---

## Timeouts & Retry

| Context                     | Default timeout | Configurable                     |
| --------------------------- | --------------- | -------------------------------- |
| `nuxtblog.on` handler     | 3 seconds       | In manifest (future)             |
| `nuxtblog.filter` handler | 50 ms           | In manifest (future)             |
| Pipeline `js` step        | 5 seconds       | `timeout_ms` in step           |
| Pipeline `webhook` step   | 5 seconds       | `timeout_ms` in step           |
| Pipeline `condition` step | 50 ms           | Not configurable                 |
| `http.fetch` request      | 15 seconds      | `capabilities.http.timeout_ms` |
| Declarative webhook POST    | 10 seconds      | Not configurable                 |

---

## Observability

The plugin engine exposes runtime metrics via the server's internal API.

### Stats (`GetStats`)

| Field               | Description                                |
| ------------------- | ------------------------------------------ |
| `plugin_id`       | Plugin identifier                          |
| `invocations`     | Total handler/filter executions            |
| `errors`          | Total executions that resulted in an error |
| `avg_duration_ms` | Average execution time in milliseconds     |
| `last_error`      | Most recent error message                  |
| `last_error_at`   | Timestamp of the most recent error         |

### Sliding window (`GetHistory`)

60 one-minute buckets covering the last hour. Each bucket contains `invocations` and `errors` for that minute. Buckets with no activity return zero counters.

### Error ring buffer (`GetErrors`)

Stores the last 100 error entries. Each entry contains:

| Field          | Description                                            |
| -------------- | ------------------------------------------------------ |
| `at`         | Timestamp                                              |
| `event`      | Event name that triggered the error                    |
| `message`    | Error message                                          |
| `input_diff` | JSON diff of `ctx.data` changes (filter errors only) |

The diff format uses prefixes: `+key` = added, `-key` = removed, `~key` = changed (`{ before, after }`).

---

## Building & Installing

### Bundling with esbuild (recommended)

```bash
npm install -D esbuild

npx esbuild src/index.ts \
  --bundle \
  --platform=neutral \
  --main-fields=browser,module,main \
  --target=es2015 \
  --outfile=index.js
```

### Creating the archive

The server uses [mholt/archives](https://github.com/mholt/archives) for extraction. Supported formats:

| Format      | Extension              |
| ----------- | ---------------------- |
| ZIP         | `.zip`               |
| Tar + Gzip  | `.tar.gz` / `.tgz` |
| Tar + Bzip2 | `.tar.bz2`           |
| Tar + XZ    | `.tar.xz`            |
| Tar + Zstd  | `.tar.zst`           |
| 7-Zip       | `.7z`                |
| RAR         | `.rar`               |

**ZIP (Python):**

```python
import zipfile
with zipfile.ZipFile("my-plugin.zip", "w", zipfile.ZIP_DEFLATED) as z:
    z.write("package.json")
    z.write("index.js")
```

**tar.gz (Shell):**

```bash
tar -czf my-plugin.tar.gz package.json index.js
```

**PowerShell:**

```powershell
Compress-Archive -Path package.json, index.js -DestinationPath my-plugin.zip
```

### Installation methods

1. **Local archive** — Admin panel → Plugins → Install → Local ZIP → Upload
2. **GitHub** — Admin panel → Plugins → Install → GitHub → Enter `owner/repo` (the server automatically downloads the latest Release asset named `plugin.zip`)

---

## TypeScript Support

Install the SDK package to get full type coverage for the `nuxtblog` global object.

```bash
pnpm add -D @nuxtblog/plugin-sdk
# or
npm install -D @nuxtblog/plugin-sdk
```

**`tsconfig.json`:**

```json
{
  "extends": "@nuxtblog/plugin-sdk",
  "include": ["src"]
}
```

**Or add a reference at the top of your entry file:**

```ts
/// <reference path="../../node_modules/@nuxtblog/plugin-sdk/index.d.ts" />
```

---

## License

MIT
