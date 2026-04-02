/**
 * @nuxtblog/plugin-sdk — Type declarations for nuxtblog plugins (v0.1.0)
 *
 * Covers: Phase 0-5 of the plugin framework upgrade.
 *
 * ─── Manifest (package.json "plugin" field) ──────────────────────────────────
 *
 * {
 *   "name":           "owner/slug",         // required, unique plugin ID (owner/slug format)
 *   "title":          "My Plugin",
 *   "description":    "...",
 *   "version":        "1.0.0",
 *   "author":         "owner",
 *   "icon":           "i-tabler-plug",      // any Tabler / Lucide icon name
 *   "entry":          "index.js",           // bundled server-side JS entry (goja VM)
 *   "admin_js":       "admin.js",           // browser-side script for admin panel
 *   "public_js":      "public.js",          // browser-side script for public frontend
 *   "css":            ".my-class { ... }",  // optional CSS injected into frontend <head>
 *   "priority":       10,                   // execution order: lower runs first (default: 10)
 *   "minHostVersion": "2.0.0",             // reject load if host is older
 *   "sdkVersion":     "0.1.0",             // SDK version this plugin targets
 *   "trust_level":    "community",          // "official" | "community" | "local"
 *   "activationEvents": [                   // lazy-load triggers (omit = onStartup)
 *     "onEvent:post.published",
 *     "onEvent:post.*",
 *     "onCommand:my-plugin:action",
 *     "onRoute:/admin/posts/*",
 *     "onStartup"
 *   ],
 *   "capabilities": {
 *     "http":   { "allow": ["api.example.com"], "timeout_ms": 5000 },
 *     "store":  { "read": true, "write": true },
 *     "events": { "subscribe": ["post.*"] },
 *     "db":     true,    // access to plugin-prefixed DB tables
 *     "ai":     true     // access to nuxtblog.ai service
 *   },
 *   "settings":    [ ... ],                 // see SettingField
 *   "contributes": { ... },                 // UI contribution points
 *   "routes":      [ ... ],                 // custom HTTP endpoints
 *   "migrations":  [ ... ],                 // DB schema migrations
 *   "pages":       [ ... ],                 // frontend route extensions
 *   "service":     { ... },                 // external service proxy
 *   "webhooks":    [ ... ],                 // outbound webhooks
 *   "pipelines":   [ ... ]                  // async multi-step workflows
 * }
 *
 * ─── Plugin API overview ─────────────────────────────────────────────────────
 *
 *   // Lifecycle (recommended)
 *   export function activate(ctx: PluginContext) {
 *     ctx.subscriptions.push(
 *       nuxtblog.filter('post.create', handler),
 *       nuxtblog.on('post.published', handler),
 *       nuxtblog.commands.register('my:action', handler),
 *     )
 *   }
 *   export function deactivate() { }  // optional — called on unload/hot-reload
 *
 *   // Legacy (still supported, deprecation warning)
 *   nuxtblog.filter(event, (ctx) => { })
 *   nuxtblog.on(event, (data) => { })
 *
 *   // Pipeline step (exported function, called by engine)
 *   export function myStep(ctx: StepContext) { }
 *
 *   // Route handler (exported function, called by engine)
 *   export function handleInvoke(req: PluginRequest): PluginResponse { }
 */

// ---------------------------------------------------------------------------
// Disposable  (returned by nuxtblog.on / nuxtblog.filter / commands.register)
// ---------------------------------------------------------------------------

/**
 * A Disposable represents a registered handler that can be removed.
 * Push it into `ctx.subscriptions` and the engine will call dispose()
 * automatically when the plugin is unloaded or hot-reloaded.
 *
 * @example
 * export function activate(ctx: PluginContext) {
 *   ctx.subscriptions.push(
 *     nuxtblog.on('post.published', handlePublish),
 *     nuxtblog.filter('post.create', handleCreate),
 *   )
 * }
 */
interface Disposable {
  dispose(): void
}

// ---------------------------------------------------------------------------
// PluginContext  (passed to activate())
// ---------------------------------------------------------------------------

/**
 * Context object passed to the exported `activate(ctx)` function.
 * All Disposables pushed into `ctx.subscriptions` are automatically
 * disposed when the plugin is unloaded or hot-reloaded.
 */
interface PluginContext {
  /** Push Disposables here; engine disposes them all on unload. */
  subscriptions: Disposable[]
}

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
// Route handler types (Phase 2.7)
// ---------------------------------------------------------------------------

/**
 * Request object passed to plugin route handler functions.
 *
 * @example
 * export function handleInvoke(req: PluginRequest): PluginResponse {
 *   const { action, text } = req.body as any
 *   return { status: 200, body: { data: 'processed' } }
 * }
 */
interface PluginRequest {
  method: string
  path: string
  query: Record<string, string>
  body: unknown
  headers: Record<string, string>
  /** Present when route auth != "public". */
  userId?: number
  /** Present when route auth != "public". */
  userRole?: string
}

/**
 * Response returned by plugin route handler functions.
 */
interface PluginResponse {
  status: number
  body: unknown
  headers?: Record<string, string>
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

/** Fires before status changes to published. Abort to prevent publishing. */
interface FilterPostPublishData {
  id: number
  title: string
  slug: string
  content: string
  excerpt: string
  [key: string]: unknown
}

/** Fires before restoring a post from trash. Abort to prevent restore. */
interface FilterPostRestoreData {
  id: number
  title: string
  slug: string
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

/** Fires before a comment is edited. */
interface FilterCommentUpdateData {
  id: number
  content: string
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

/** Fires before login. Abort to block the login attempt. */
interface FilterUserLoginData {
  username: string
  email: string
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

  /**
   * Returns all stored keys, optionally filtered to those starting with `prefix`.
   * @example nuxtblog.store.list('cache:') -> ['cache:post-1', 'cache:post-2']
   */
  list(prefix?: string): string[]

  /**
   * Batch-reads multiple keys in a single DB query.
   * Missing keys are omitted from the result.
   */
  getMany(keys: string[]): Record<string, unknown>

  /**
   * Deletes all entries whose key starts with `prefix`.
   * Returns the number of deleted entries.
   */
  deletePrefix(prefix: string): number

  /**
   * Atomically increments a numeric store value by `delta` (default 1).
   * Creates the entry at 0 before incrementing if it does not exist.
   * Returns the new value.
   * @example nuxtblog.store.increment('views:post-42') -> 1
   */
  increment(key: string, delta?: number): number
}

// ---------------------------------------------------------------------------
// nuxtblog.db (Phase 4.1)
// ---------------------------------------------------------------------------

/**
 * Plugin database access. Only available when `capabilities.db` is true.
 * All table names must be prefixed with `plugin_{sanitized_id}_`.
 */
interface BlogDB {
  /**
   * Run a SELECT query on plugin-prefixed tables.
   * Returns an array of row objects, or null on error.
   *
   * @example
   * const rows = nuxtblog.db.query(
   *   'SELECT * FROM plugin_my_plugin_items WHERE status = ? LIMIT ?',
   *   'active', 20
   * )
   */
  query(sql: string, ...args: unknown[]): Array<Record<string, unknown>> | null

  /**
   * Run an INSERT/UPDATE/DELETE on plugin-prefixed tables.
   * Returns the number of affected rows, or 0 on error.
   *
   * @example
   * const affected = nuxtblog.db.execute(
   *   'INSERT INTO plugin_my_plugin_items (title, content) VALUES (?, ?)',
   *   'Hello', 'World'
   * )
   */
  execute(sql: string, ...args: unknown[]): number
}

// ---------------------------------------------------------------------------
// nuxtblog.ai (Phase 5.1)
// ---------------------------------------------------------------------------

/** Result from AI service calls. */
interface AIResult {
  ok: boolean
  /** The generated text on success. */
  text?: string
  /** Error message on failure. */
  error?: string
}

/**
 * AI service abstraction. Only available when `capabilities.ai` is true.
 * Uses the host's configured AI provider — plugin does not manage API keys.
 */
interface BlogAI {
  /**
   * Polish/improve the given content.
   * @param content Text to polish
   * @param style Optional style hint (e.g. "formal", "casual")
   */
  polish(content: string, style?: string): AIResult

  /**
   * Generate a summary of the content.
   * @param content Text to summarize
   * @param maxLength Maximum summary length in characters (default 200)
   */
  summarize(content: string, maxLength?: number): AIResult

  /**
   * Suggest tags based on title and content.
   * @returns AIResult where `text` is a comma-separated list of tags
   */
  suggestTags(title: string, content: string): AIResult

  /**
   * Translate content to the target language.
   * @param content Text to translate
   * @param targetLang Target language code (e.g. "en", "zh", "ja")
   */
  translate(content: string, targetLang: string): AIResult
}

// ---------------------------------------------------------------------------
// nuxtblog.commands (Phase 2)
// ---------------------------------------------------------------------------

/**
 * Server-side command registry. Commands can be invoked from admin_js
 * via `nuxtblogAdmin.commands.execute()` or from other plugins.
 */
interface BlogCommands {
  /**
   * Register a command handler. Returns a Disposable.
   * Command IDs should be namespaced: "plugin-id:action-name".
   */
  register(id: string, handler: (...args: unknown[]) => void | Promise<void>): Disposable

  /**
   * Execute a registered command by ID.
   */
  execute(id: string, ...args: unknown[]): Promise<void>
}

// ---------------------------------------------------------------------------
// nuxtblog.on — typed overloads
// ---------------------------------------------------------------------------

interface BlogOn {
  // Post
  (event: "post.created",   handler: (payload: PostCreatedPayload)   => void): Disposable
  (event: "post.updated",   handler: (payload: PostUpdatedPayload)   => void): Disposable
  (event: "post.published", handler: (payload: PostPublishedPayload) => void): Disposable
  (event: "post.deleted",   handler: (payload: PostDeletedPayload)   => void): Disposable
  (event: "post.viewed",    handler: (payload: PostViewedPayload)    => void): Disposable
  // Comment
  (event: "comment.created",        handler: (payload: CommentCreatedPayload)        => void): Disposable
  (event: "comment.deleted",        handler: (payload: CommentDeletedPayload)        => void): Disposable
  (event: "comment.status_changed", handler: (payload: CommentStatusChangedPayload) => void): Disposable
  (event: "comment.approved",       handler: (payload: CommentApprovedPayload)       => void): Disposable
  // User
  (event: "user.registered", handler: (payload: UserRegisteredPayload) => void): Disposable
  (event: "user.updated",    handler: (payload: UserUpdatedPayload)    => void): Disposable
  (event: "user.deleted",    handler: (payload: UserDeletedPayload)    => void): Disposable
  (event: "user.followed",   handler: (payload: UserFollowedPayload)   => void): Disposable
  (event: "user.login",      handler: (payload: UserLoginPayload)      => void): Disposable
  (event: "user.logout",     handler: (payload: UserLogoutPayload)     => void): Disposable
  // Media
  (event: "media.uploaded", handler: (payload: MediaUploadedPayload) => void): Disposable
  (event: "media.deleted",  handler: (payload: MediaDeletedPayload)  => void): Disposable
  // Taxonomy / Term
  (event: "taxonomy.created", handler: (payload: TaxonomyCreatedPayload) => void): Disposable
  (event: "taxonomy.deleted", handler: (payload: TaxonomyDeletedPayload) => void): Disposable
  (event: "term.created",     handler: (payload: TermCreatedPayload)     => void): Disposable
  (event: "term.deleted",     handler: (payload: TermDeletedPayload)     => void): Disposable
  // Reaction / Checkin
  (event: "reaction.added",   handler: (payload: ReactionPayload) => void): Disposable
  (event: "reaction.removed", handler: (payload: ReactionPayload) => void): Disposable
  (event: "checkin.done",     handler: (payload: CheckinPayload)  => void): Disposable
  // System
  (event: "option.updated",     handler: (payload: OptionUpdatedPayload)     => void): Disposable
  (event: "plugin.installed",   handler: (payload: PluginInstalledPayload)   => void): Disposable
  (event: "plugin.uninstalled", handler: (payload: PluginUninstalledPayload) => void): Disposable
  /** Fallback for custom / future events (including inter-plugin events) */
  (event: string, handler: (payload: unknown) => void): Disposable
}

// ---------------------------------------------------------------------------
// nuxtblog.filter — typed overloads
// ---------------------------------------------------------------------------

interface BlogFilter {
  (event: "post.create",
   handler: (ctx: PluginCtx<FilterPostCreateData>) => void): Disposable
  (event: "post.update",
   handler: (ctx: PluginCtx<FilterPostUpdateData>) => void): Disposable
  (event: "post.delete",
   handler: (ctx: PluginCtx<FilterPostDeleteData>) => void): Disposable
  /** Fires before status changes to published. Abort to prevent publishing. */
  (event: "post.publish",
   handler: (ctx: PluginCtx<FilterPostPublishData>) => void): Disposable
  /** Fires before restoring from trash. Abort to prevent restore. */
  (event: "post.restore",
   handler: (ctx: PluginCtx<FilterPostRestoreData>) => void): Disposable
  (event: "comment.create",
   handler: (ctx: PluginCtx<FilterCommentCreateData>) => void): Disposable
  (event: "comment.delete",
   handler: (ctx: PluginCtx<FilterCommentDeleteData>) => void): Disposable
  /** Fires before a comment is edited. */
  (event: "comment.update",
   handler: (ctx: PluginCtx<FilterCommentUpdateData>) => void): Disposable
  (event: "term.create",
   handler: (ctx: PluginCtx<FilterTermCreateData>) => void): Disposable
  (event: "user.register",
   handler: (ctx: PluginCtx<FilterUserRegisterData>) => void): Disposable
  (event: "user.update",
   handler: (ctx: PluginCtx<FilterUserUpdateData>) => void): Disposable
  /** Fires before login. Abort to block the login. */
  (event: "user.login",
   handler: (ctx: PluginCtx<FilterUserLoginData>) => void): Disposable
  (event: "media.upload",
   handler: (ctx: PluginCtx<FilterMediaUploadData>) => void): Disposable
  (event: "content.render",
   handler: (ctx: PluginCtx<FilterContentRenderData>) => void): Disposable
  /** Fallback for custom / future filter events */
  (event: string, handler: (ctx: PluginCtx) => void): Disposable
}

// ---------------------------------------------------------------------------
// Global nuxtblog object  (server-side, goja VM)
// ---------------------------------------------------------------------------

declare const nuxtblog: {
  /**
   * Subscribe to a fire-and-forget event (async, runs after the operation completes).
   * HTTP requests are allowed. Cannot modify or cancel the triggering operation.
   */
  on: BlogOn

  /**
   * Register a synchronous data interceptor.
   * Runs BEFORE data is written to the database.
   * Modify `ctx.data` to change the persisted values.
   * Call `ctx.abort(reason)` to reject the operation entirely.
   *
   * HTTP requests (`nuxtblog.http.fetch`) are NOT allowed inside filter handlers.
   */
  filter: BlogFilter

  /**
   * Emit a custom event that other plugins can listen to via `nuxtblog.on()`.
   * Event name MUST contain ":" for namespacing (e.g. "my-plugin:data-ready").
   * Dispatched asynchronously — does not block the caller.
   *
   * @example
   * nuxtblog.emit('ai-polish:result-ready', { postId: 123, result: '...' })
   */
  emit(event: string, payload: Record<string, unknown>): void

  /** Write a message to the server log (prefixed with [plugin:<id>]). */
  log: {
    info(message: string): void
    warn(message: string): void
    error(message: string): void
    debug(message: string): void
  }

  /**
   * Synchronous HTTP client. Available when the plugin declares `capabilities.http`.
   * Blocked inside `nuxtblog.filter` handlers regardless of capability declarations.
   */
  http: {
    fetch<T = unknown>(url: string, opts?: FetchOptions): FetchResult<T>
  }

  /**
   * Per-plugin persistent key-value store backed by the blog database.
   * Available when the plugin declares `capabilities.store`.
   * Keys are namespaced per plugin — no cross-plugin access.
   */
  store: BlogStore

  /**
   * Read admin-configured plugin settings (set in Plugins > Settings).
   * Always available. Cached for 30 seconds.
   */
  settings: {
    get(key: string): unknown
  }

  /**
   * Plugin database access for custom tables.
   * Available when `capabilities.db` is true.
   * Tables must be prefixed with `plugin_{sanitized_id}_`.
   */
  db: BlogDB

  /**
   * AI service abstraction using the host's configured AI provider.
   * Available when `capabilities.ai` is true.
   * Plugin does not need to manage API keys.
   */
  ai: BlogAI

  /**
   * Server-side command registry.
   * Commands registered here can be invoked from the admin panel
   * or by other plugins.
   */
  commands: BlogCommands
}

// ---------------------------------------------------------------------------
// nuxtblogAdmin — browser-side global (admin.js / admin.mjs)
// ---------------------------------------------------------------------------

/**
 * Editor context passed to command handlers in the admin panel.
 */
interface EditorContext {
  post: {
    title: string
    slug: string
    content: string
    excerpt: string
    status: string
  }
  /** Currently selected text, or null if nothing selected. */
  selection: string | null
  /** Replace the selected text. */
  replace(text: string): void
  /** Insert text at the cursor position. */
  insert(text: string): void
  /** Replace the entire post content. */
  setContent(html: string): void
}

/**
 * Webview panel API for building custom UI panels in the editor sidebar.
 */
interface Webview {
  /** Set the HTML content of the webview panel. */
  html: string
  /** Listen for messages from the webview content. */
  onMessage(handler: (msg: unknown) => void): void
  /** Send a message to the webview content. */
  postMessage(msg: unknown): void
}

/**
 * The `nuxtblogAdmin` global object available in admin.js scripts.
 * Runs in the browser (admin panel), NOT in the goja VM.
 */
declare const nuxtblogAdmin: {
  /**
   * Watch a post field for changes. Returns a Disposable.
   * Fields: 'post.title', 'post.slug', 'post.content', 'post.excerpt'
   */
  watch(
    field: 'post.title' | 'post.slug' | 'post.content' | 'post.excerpt',
    cb: (val: string) => void
  ): Disposable

  /**
   * Soft-set a field value. The user can manually override it.
   * Use this for suggestions (e.g. auto-generated slugs).
   */
  suggest(field: string, value: string): void

  /**
   * Force-set a field value. Overrides the current value.
   * Only available for trust_level "official" or "local".
   */
  set(field: string, value: string): void

  /** Read the current post draft state. */
  getPost(): {
    title: string
    slug: string
    content: string
    excerpt: string
    status: string
  }

  /** Command registry for the admin panel. */
  commands: {
    /** Register a command handler. Returns a Disposable. */
    register(id: string, handler: (ctx: EditorContext) => void | Promise<void>): Disposable
    /** Execute a registered command by ID. */
    execute(id: string, ...args: unknown[]): Promise<void>
  }

  /** Webview panel registry for the editor sidebar. */
  views: {
    /** Register a webview panel provider. Returns a Disposable. */
    register(id: string, provider: (webview: Webview) => void): Disposable
  }

  /**
   * HTTP client that calls this plugin's backend routes.
   * Automatically includes the auth token.
   */
  http: {
    get<T = unknown>(path: string): Promise<{ ok: boolean; data: T; error?: string }>
    post<T = unknown>(path: string, body: object): Promise<{ ok: boolean; data: T; error?: string }>
  }

  /** Show notifications in the admin panel. */
  notify: {
    success(msg: string): void
    error(msg: string): void
    info(msg: string): void
  }
}
