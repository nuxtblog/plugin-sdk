/**
 * @nuxtblog/plugin-sdk — Type declarations for nuxtblog plugins
 *
 * ─── Manifest (package.json "plugin" field) ──────────────────────────────────
 *
 * {
 *   "name":        "owner/repo",          // required, unique plugin ID
 *   "title":       "My Plugin",
 *   "description": "...",
 *   "version":     "1.0.0",
 *   "author":      "owner",
 *   "icon":        "i-tabler-plug",        // any Tabler / Lucide icon name
 *   "entry":       "dist/index.js",        // bundled JS entry (default: dist/index.js)
 *   "css":         ".my-class { ... }",    // optional CSS injected into frontend <head>
 *   "priority":    10,                     // execution order: lower runs first (default: 10)
 *   "settings":    [ ... ],                // see SettingField below
 *   "capabilities": {                      // required — only declared APIs are injected
 *     "http":   { "allow": ["api.example.com"], "timeout_ms": 5000 },
 *     "store":  { "read": true, "write": true },
 *     "events": { "subscribe": ["post.*"] }
 *   },
 *   "webhooks": [
 *     // Declarative outbound webhooks — no JS needed.
 *     // url and header values support {{settings.key}} to read admin-configured values
 *     // at dispatch time (30-second TTL cache). Never hardcode secrets in the manifest.
 *     {
 *       "url": "{{settings.webhook_url}}",
 *       "events": ["post.*"],
 *       "headers": { "Authorization": "Bearer {{settings.webhook_token}}" }
 *     }
 *   ],
 *   "pipelines": [                         // declarative multi-step async workflows
 *     {
 *       "name": "post-publish",
 *       "trigger": "post.published",
 *       "steps": [
 *         { "type": "js",      "name": "Generate summary", "fn": "generateSummary", "timeout_ms": 8000, "retry": 1 },
 *         {
 *           // webhook step url also supports {{settings.key}}
 *           "type": "webhook", "name": "Notify Slack",
 *           "url": "{{settings.slack_webhook_url}}", "headers": {}
 *         },
 *         {
 *           "type": "condition", "name": "Branch by category",
 *           "if": "ctx.data.category === 'tech'",
 *           "then": [ { "type": "js", "name": "Tweet it", "fn": "postTweet" } ],
 *           "else": [ { "type": "js", "name": "Log skip", "fn": "logSkip" }  ]
 *         }
 *       ]
 *     }
 *   ]
 * }
 *
 * ─── Plugin API overview ─────────────────────────────────────────────────────
 *
 *   nuxtblog.filter(event, (ctx) => { })   ← guard: sync, can abort, HTTP blocked
 *   nuxtblog.on(event, (data) => { })      ← simple response: async, HTTP allowed
 *   function myStep(ctx: StepContext) { }  ← pipeline step: async, HTTP allowed
 *   manifest.webhooks                      ← outbound POST, no JS needed
 *   manifest.pipelines                     ← multi-step workflow with retry/condition
 */

// ---------------------------------------------------------------------------
// Filter context  (nuxtblog.filter handlers)
// ---------------------------------------------------------------------------

/**
 * Context passed to every `nuxtblog.filter()` handler.
 *
 * @example
 * nuxtblog.filter('post.create', (ctx) => {
 *   if (ctx.data.title.length > 200) {
 *     ctx.abort('title too long')
 *     return
 *   }
 *   ctx.data.title = ctx.data.title.trim()
 *   ctx.meta.slug = ctx.data.title.toLowerCase().replace(/\s+/g, '-')
 *   ctx.next()  // optional — chain continues even without it
 * })
 */
interface PluginCtx<T extends Record<string, unknown> = Record<string, unknown>> {
  /** The filter event name (e.g. "post.create"). */
  readonly event: string
  /**
   * Read-only snapshot of `data` taken before the filter chain started.
   * Use it for audit / diff purposes; modifications have no effect.
   */
  readonly input: Readonly<T>
  /** Mutable payload. Modify fields here — they are persisted after the chain. */
  data: T
  /** Request-scoped KV store shared across all plugins in the same filter chain. */
  meta: Record<string, unknown>
  /**
   * Signal that this handler is done and the chain should continue.
   * Calling `next()` is optional — the chain always continues unless `abort()` is called.
   */
  next(): void
  /**
   * Stop the filter chain immediately. All subsequent handlers are skipped.
   * The operation is rejected and `reason` is surfaced to the caller.
   */
  abort(reason: string): void
}

// ---------------------------------------------------------------------------
// Pipeline step context  (pipeline "type": "js" step handlers)
// ---------------------------------------------------------------------------

/**
 * Context passed to functions called as pipeline JS steps.
 * Unlike `PluginCtx`, this context:
 *   - lives for the entire pipeline (not just one handler)
 *   - allows `nuxtblog.http.fetch` calls
 *   - has no `input` snapshot or `next()` method
 *
 * Export the function at module scope — the pipeline engine looks it up by name.
 *
 * @example
 * // In package.json pipeline step: { "type": "js", "fn": "generateSummary" }
 * function generateSummary(ctx: StepContext) {
 *   const res = nuxtblog.http.fetch('https://ai-api/summarize', {
 *     method: 'POST', body: { content: ctx.data.content as string }
 *   })
 *   ctx.data.excerpt = (res.body as any).summary
 * }
 */
interface StepContext<T extends Record<string, unknown> = Record<string, unknown>> {
  /** The trigger event name (e.g. "post.published"). */
  readonly event: string
  /** Mutable payload shared across all steps in the pipeline. */
  data: T
  /** Pipeline-scoped KV store; values written by earlier steps are visible to later ones. */
  meta: Record<string, unknown>
  /** Stop the pipeline immediately. Subsequent steps are skipped. */
  abort(reason: string): void
}

// ---------------------------------------------------------------------------
// Event payloads  (nuxtblog.on)
// ---------------------------------------------------------------------------

// ── Post ────────────────────────────────────────────────────────────────────

interface PostCreatedPayload {
  id: number
  title: string
  slug: string
  excerpt: string
  /** 0 = post  1 = page */
  post_type: number
  author_id: number
  /** 0 = draft  1 = published  2 = trash */
  status: number
}

interface PostUpdatedPayload {
  id: number
  title: string
  slug: string
  excerpt: string
  post_type: number
  author_id: number
  status: number
}

interface PostPublishedPayload {
  id: number
  title: string
  slug: string
  excerpt: string
  post_type: number
  author_id: number
}

interface PostDeletedPayload {
  id: number
  title: string
  slug: string
  post_type: number
  author_id: number
}

interface PostViewedPayload {
  id: number
  user_id: number
}

// ── Comment ──────────────────────────────────────────────────────────────────

interface CommentCreatedPayload {
  id: number
  /** 0 = pending  1 = approved  2 = spam */
  status: number
  object_type: string
  object_id: number
  object_title: string
  object_slug: string
  post_author_id: number
  /** Undefined for top-level comments */
  parent_id?: number
  parent_author_id: number
  author_id: number
  author_name: string
  author_email: string
  content: string
}

interface CommentDeletedPayload {
  id: number
  object_type: string
  object_id: number
}

interface CommentStatusChangedPayload {
  id: number
  object_type: string
  object_id: number
  /** 0 = pending  1 = approved  2 = spam */
  old_status: number
  new_status: number
  moderator_id: number
}

interface CommentApprovedPayload {
  id: number
  object_type: string
  object_id: number
  moderator_id: number
}

// ── User ─────────────────────────────────────────────────────────────────────

interface UserRegisteredPayload {
  id: number
  username: string
  email: string
  display_name: string
  locale: string
  /** 0 = subscriber  1 = contributor  2 = editor  3 = admin */
  role: number
}

interface UserUpdatedPayload {
  id: number
  username: string
  email: string
  display_name: string
  locale: string
  role: number
  /** 0 = active  1 = inactive/banned */
  status: number
}

interface UserDeletedPayload {
  id: number
  username: string
  email: string
}

interface UserFollowedPayload {
  follower_id: number
  follower_name: string
  follower_avatar: string
  following_id: number
}

interface UserLoginPayload {
  id: number
  username: string
  email: string
  role: number
}

interface UserLogoutPayload {
  id: number
}

// ── Media ─────────────────────────────────────────────────────────────────────

interface MediaUploadedPayload {
  id: number
  uploader_id: number
  filename: string
  mime_type: string
  /** bytes */
  file_size: number
  /** public CDN / storage URL */
  url: string
  category: string
  /** 0 for non-image files */
  width: number
  height: number
}

interface MediaDeletedPayload {
  id: number
  uploader_id: number
  filename: string
  mime_type: string
  category: string
}

// ── Taxonomy / Term ───────────────────────────────────────────────────────────

interface TaxonomyCreatedPayload {
  id: number
  term_id: number
  term_name: string
  term_slug: string
  /** e.g. "category" | "tag" */
  taxonomy: string
}

interface TaxonomyDeletedPayload {
  id: number
  term_name: string
  term_slug: string
  taxonomy: string
}

interface TermCreatedPayload {
  id: number
  name: string
  slug: string
}

interface TermDeletedPayload {
  id: number
  name: string
  slug: string
}

// ── Reaction / Checkin ────────────────────────────────────────────────────────

interface ReactionPayload {
  user_id: number
  object_type: string
  object_id: number
  type: "like" | "bookmark"
}

interface CheckinPayload {
  user_id: number
  streak: number
  already_checked_in: boolean
}

// ── System ────────────────────────────────────────────────────────────────────

interface OptionUpdatedPayload {
  key: string
  value: unknown
}

interface PluginInstalledPayload {
  id: string
  title: string
  version: string
  author: string
}

interface PluginUninstalledPayload {
  id: string
}

// ---------------------------------------------------------------------------
// Filter data shapes  (nuxtblog.filter — ctx.data type)
// ---------------------------------------------------------------------------

interface FilterPostCreateData {
  title: string
  slug: string
  content: string
  excerpt: string
  /** 0 = draft  1 = published */
  status: number
  [key: string]: unknown
}

/** Only fields being updated are present */
type FilterPostUpdateData = Partial<FilterPostCreateData>

interface FilterPostDeleteData {
  id: number
  [key: string]: unknown
}

interface FilterCommentCreateData {
  content: string
  author_name: string
  author_email: string
  [key: string]: unknown
}

interface FilterCommentDeleteData {
  id: number
  [key: string]: unknown
}

interface FilterTermCreateData {
  name: string
  slug: string
  [key: string]: unknown
}

interface FilterUserRegisterData {
  username: string
  email: string
  display_name: string
  [key: string]: unknown
}

/** Only fields being updated are present */
interface FilterUserUpdateData {
  display_name?: string
  bio?: string
  locale?: string
  status?: number
  [key: string]: unknown
}

interface FilterMediaUploadData {
  filename: string
  mime_type: string
  category: string
  alt_text: string
  title: string
  [key: string]: unknown
}

/**
 * Fired when a post, page, or doc is about to be returned to the frontend.
 * Modify `ctx.data.content` to change what the reader sees.
 */
interface FilterContentRenderData {
  /** Raw markdown source */
  content: string
  /** "post" | "page" | "doc" */
  type: string
  id: number
  slug: string
  title: string
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// nuxtblog.http
// ---------------------------------------------------------------------------

interface FetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  /** Plain object is JSON-serialised automatically; string is sent as-is. */
  body?: Record<string, unknown> | string
  headers?: Record<string, string>
}

interface FetchResult<T = unknown> {
  /** true when HTTP status is 200–299 */
  ok: boolean
  status: number
  /** Auto JSON.parse'd; falls back to raw string on parse failure. */
  body: T
  /** Present when the request itself failed (network error, timeout, domain blocked, etc.). */
  error?: string
}

// ---------------------------------------------------------------------------
// nuxtblog.store
// ---------------------------------------------------------------------------

interface BlogStore {
  /** Returns the stored value for `key`, or `null` if not set. */
  get(key: string): unknown
  /** Persists `value` under `key`. Value is JSON-serialised. */
  set(key: string, value: unknown): void
  /** Removes the entry for `key`. */
  delete(key: string): void
}

// ---------------------------------------------------------------------------
// nuxtblog.on — typed overloads
// ---------------------------------------------------------------------------

interface BlogOn {
  // Post
  (event: "post.created",   handler: (payload: PostCreatedPayload)   => void): void
  (event: "post.updated",   handler: (payload: PostUpdatedPayload)   => void): void
  (event: "post.published", handler: (payload: PostPublishedPayload) => void): void
  (event: "post.deleted",   handler: (payload: PostDeletedPayload)   => void): void
  (event: "post.viewed",    handler: (payload: PostViewedPayload)    => void): void
  // Comment
  (event: "comment.created",        handler: (payload: CommentCreatedPayload)        => void): void
  (event: "comment.deleted",        handler: (payload: CommentDeletedPayload)        => void): void
  (event: "comment.status_changed", handler: (payload: CommentStatusChangedPayload) => void): void
  (event: "comment.approved",       handler: (payload: CommentApprovedPayload)       => void): void
  // User
  (event: "user.registered", handler: (payload: UserRegisteredPayload) => void): void
  (event: "user.updated",    handler: (payload: UserUpdatedPayload)    => void): void
  (event: "user.deleted",    handler: (payload: UserDeletedPayload)    => void): void
  (event: "user.followed",   handler: (payload: UserFollowedPayload)   => void): void
  (event: "user.login",      handler: (payload: UserLoginPayload)      => void): void
  (event: "user.logout",     handler: (payload: UserLogoutPayload)     => void): void
  // Media
  (event: "media.uploaded", handler: (payload: MediaUploadedPayload) => void): void
  (event: "media.deleted",  handler: (payload: MediaDeletedPayload)  => void): void
  // Taxonomy / Term
  (event: "taxonomy.created", handler: (payload: TaxonomyCreatedPayload) => void): void
  (event: "taxonomy.deleted", handler: (payload: TaxonomyDeletedPayload) => void): void
  (event: "term.created",     handler: (payload: TermCreatedPayload)     => void): void
  (event: "term.deleted",     handler: (payload: TermDeletedPayload)     => void): void
  // Reaction / Checkin
  (event: "reaction.added",   handler: (payload: ReactionPayload) => void): void
  (event: "reaction.removed", handler: (payload: ReactionPayload) => void): void
  (event: "checkin.done",     handler: (payload: CheckinPayload)  => void): void
  // System
  (event: "option.updated",     handler: (payload: OptionUpdatedPayload)     => void): void
  (event: "plugin.installed",   handler: (payload: PluginInstalledPayload)   => void): void
  (event: "plugin.uninstalled", handler: (payload: PluginUninstalledPayload) => void): void
  /** Fallback for custom / future events */
  (event: string, handler: (payload: unknown) => void): void
}

// ---------------------------------------------------------------------------
// nuxtblog.filter — typed overloads
//
// Handlers receive a PluginCtx. Modify ctx.data to change the data that will
// be persisted. Call ctx.abort(reason) to reject the operation entirely.
// Calling ctx.next() is optional — the chain continues unless abort() is called.
// ---------------------------------------------------------------------------

interface BlogFilter {
  (event: "post.create",
   handler: (ctx: PluginCtx<FilterPostCreateData>) => void): void
  (event: "post.update",
   handler: (ctx: PluginCtx<FilterPostUpdateData>) => void): void
  (event: "post.delete",
   handler: (ctx: PluginCtx<FilterPostDeleteData>) => void): void
  (event: "comment.create",
   handler: (ctx: PluginCtx<FilterCommentCreateData>) => void): void
  (event: "comment.delete",
   handler: (ctx: PluginCtx<FilterCommentDeleteData>) => void): void
  (event: "term.create",
   handler: (ctx: PluginCtx<FilterTermCreateData>) => void): void
  (event: "user.register",
   handler: (ctx: PluginCtx<FilterUserRegisterData>) => void): void
  (event: "user.update",
   handler: (ctx: PluginCtx<FilterUserUpdateData>) => void): void
  (event: "media.upload",
   handler: (ctx: PluginCtx<FilterMediaUploadData>) => void): void
  (event: "content.render",
   handler: (ctx: PluginCtx<FilterContentRenderData>) => void): void
  /** Fallback for custom / future filter events */
  (event: string, handler: (ctx: PluginCtx) => void): void
}

// ---------------------------------------------------------------------------
// Global nuxtblog object
// ---------------------------------------------------------------------------

declare const nuxtblog: {
  /**
   * Subscribe to a fire-and-forget event (async, runs after the operation completes).
   * HTTP requests are allowed. Cannot modify or cancel the triggering operation.
   *
   * @example
   * nuxtblog.on('post.published', (data) => {
   *   nuxtblog.http.fetch('https://hooks.slack.com/...', {
   *     method: 'POST', body: { text: 'New post: ' + data.title }
   *   })
   * })
   */
  on: BlogOn

  /**
   * Register a synchronous data interceptor.
   * Runs BEFORE data is written to the database.
   * Modify `ctx.data` to change the persisted values.
   * Call `ctx.abort(reason)` to reject the operation entirely.
   *
   * ⚠️ HTTP requests (`nuxtblog.http.fetch`) are NOT allowed inside filter handlers.
   *    Use `nuxtblog.on` or a pipeline step for async side-effects.
   *
   * @example
   * nuxtblog.filter('post.create', (ctx) => {
   *   if (!ctx.data.title) {
   *     ctx.abort('title is required')
   *     return
   *   }
   *   ctx.data.title = ctx.data.title.trim()
   * })
   */
  filter: BlogFilter

  /** Write a message to the server log (prefixed with [plugin:<id>]). */
  log: {
    info(message: string): void
    warn(message: string): void
    error(message: string): void
    debug(message: string): void
  }

  /**
   * Synchronous HTTP client. Available when the plugin declares `capabilities.http`.
   *
   * ⚠️ Blocked inside `nuxtblog.filter` handlers regardless of capability declarations.
   *    Safe to use in `nuxtblog.on` handlers and pipeline JS steps.
   */
  http: {
    /**
     * Make a synchronous HTTP request. Default timeout: 15 seconds (overridable
     * via `capabilities.http.timeout_ms` in the manifest).
     * Returns immediately with the result (not a Promise).
     *
     * @example
     * const res = nuxtblog.http.fetch<{ id: number }>('https://api.example.com/notify', {
     *   method: 'POST',
     *   body: { message: 'hello' },
     *   headers: { Authorization: 'Bearer token' },
     * })
     * if (res.ok) nuxtblog.log.info('notified: ' + res.body.id)
     */
    fetch<T = unknown>(url: string, opts?: FetchOptions): FetchResult<T>
  }

  /**
   * Per-plugin persistent key-value store backed by the blog database.
   * Available when the plugin declares `capabilities.store`.
   * Keys are namespaced per plugin — no cross-plugin access.
   */
  store: BlogStore

  /**
   * Read admin-configured plugin settings (set in Plugins → Settings gear icon).
   * Always available. Cached for 30 seconds; changes take effect without restart.
   *
   * @example
   * const apiKey = nuxtblog.settings.get('api_key') as string
   */
  settings: {
    get(key: string): unknown
  }
}
