/**
 * @nuxtblog/plugin-sdk — Type declarations for nuxtblog plugins (v1.0.0)
 *
 * 4-Layer Plugin Architecture:
 *
 *   Layer 0 — YAML declarative
 *     Webhooks + filter rules via plugin.yaml only, no JS code.
 *
 *   Layer 1 — Goja VM (JavaScript sandbox)
 *     Full server-side JS plugin: filters, routes, events, HTTP,
 *     DB access, KV store, settings, logging.
 *     Exports via CommonJS `module.exports`.
 *     Global `ctx` object injected on activate.
 *
 *   Layer 3 — Admin browser scripts (admin.js)
 *     Editor commands, webview panels, field watching/suggesting.
 *     Typed below as `nuxtblogAdmin`.
 *
 *   Layer 4 — Public browser scripts (public.js)
 *     Frontend-only extensions.
 *
 * Goja Engine Constraints:
 *   - ES5.1+ syntax (no import/export — use module.exports)
 *   - Single-threaded runtime per plugin with sync.Mutex
 *   - 5-second timeout per JS call (vm.Interrupt on timeout)
 *   - Only injected `ctx` APIs are accessible — no Node.js / browser globals
 *   - Third-party JS libs must be bundled via esbuild into a single file
 *
 * ─── Plugin Structure (plugin.yaml) ──────────────────────────────────────────
 *
 * id:          my-plugin          # unique plugin ID
 * title:       My Plugin
 * version:     1.0.0
 * icon:        i-tabler-puzzle
 * author:      you
 * description: A sample JS plugin
 * type:        js                 # "js" | "full" | "yaml" | "ui" | "builtin"
 * settings:
 *   - key: greeting
 *     label: Greeting
 *     type: string
 *     default: "Hello!"
 *
 * ─── Plugin Entry (plugin.js) ────────────────────────────────────────────────
 *
 * module.exports = {
 *   activate:   function() { ... },
 *   deactivate: function() { ... },
 *   filters:    [ { event, handler } ],
 *   routes:     [ { method, path, auth, handler } ],
 *   onEvent:    function(event, data) { ... },
 * }
 */

// ═══════════════════════════════════════════════════════════════════════════════
// ctx — Global Platform Context (Layer 1 — Goja VM)
// ═══════════════════════════════════════════════════════════════════════════════

// ── ctx.db ──────────────────────────────────────────────────────────────────

/**
 * Database access for plugins.
 * All queries are scoped/prefixed per plugin for safety.
 */
interface PluginDB {
  /**
   * Execute a SQL query and return result rows.
   *
   * @param sql - SQL query with `?` placeholders
   * @param args - Positional arguments for placeholders
   * @returns Array of row objects `{ column: value, ... }`
   *
   * @example
   * var rows = ctx.db.query("SELECT id, title FROM post WHERE status = ?", 1)
   * // => [{ id: 1, title: "Hello" }, { id: 2, title: "World" }]
   */
  query(sql: string, ...args: unknown[]): Record<string, unknown>[]

  /**
   * Execute a write SQL statement (INSERT / UPDATE / DELETE).
   *
   * @param sql - SQL statement with `?` placeholders
   * @param args - Positional arguments for placeholders
   * @returns Number of affected rows
   *
   * @example
   * var n = ctx.db.execute("UPDATE post SET views = views + 1 WHERE id = ?", 42)
   */
  execute(sql: string, ...args: unknown[]): number
}

// ── ctx.store ───────────────────────────────────────────────────────────────

/**
 * Per-plugin key-value store backed by the database.
 * Keys are automatically namespaced per plugin — no cross-plugin access.
 * Values can be any JSON-serializable type.
 */
interface PluginStore {
  /**
   * Get a stored value.
   * @returns The stored value, or `null` if not found
   *
   * @example
   * var count = ctx.store.get("counter")
   */
  get(key: string): unknown

  /**
   * Store a key-value pair.
   *
   * @example
   * ctx.store.set("last_run", Date.now())
   * ctx.store.set("config", { retries: 3 })
   */
  set(key: string, value: unknown): void

  /**
   * Delete a key.
   *
   * @example
   * ctx.store.delete("counter")
   */
  delete(key: string): void

  /**
   * Atomically increment a numeric counter.
   *
   * @param key - The key to increment
   * @param delta - Increment amount (default: 1, supports negative)
   * @returns The new value after increment
   *
   * @example
   * var n = ctx.store.increment("counter")       // +1
   * var n2 = ctx.store.increment("counter", 5)   // +5
   * var n3 = ctx.store.increment("counter", -1)  // -1
   */
  increment(key: string, delta?: number): number

  /**
   * Delete all keys matching a prefix.
   *
   * @returns Number of keys deleted
   *
   * @example
   * var deleted = ctx.store.deletePrefix("cache:")
   */
  deletePrefix(prefix: string): number
}

// ── ctx.settings ────────────────────────────────────────────────────────────

/**
 * Read-only access to plugin settings configured by the admin.
 * Settings are defined in plugin.yaml and edited in the admin panel.
 * Values are cached (30s TTL).
 */
interface PluginSettings {
  /**
   * Get a single setting value.
   *
   * @param key - Setting key as defined in plugin.yaml `settings[].key`
   * @returns The setting value, or `null` / default if not set
   *
   * @example
   * var apiKey = ctx.settings.get("api_key")
   * var maxLen = ctx.settings.get("max_length") || 160
   */
  get(key: string): unknown

  /**
   * Get all settings as a key-value object.
   *
   * @returns `{ key: value, ... }`
   *
   * @example
   * var all = ctx.settings.getAll()
   * // => { api_key: "sk-xxx", max_length: 200 }
   */
  getAll(): Record<string, unknown>
}

// ── ctx.log ─────────────────────────────────────────────────────────────────

/**
 * Server-side logging. Messages are prefixed with `[plugin:<id>]`.
 */
interface PluginLog {
  /** Log an INFO level message. */
  info(msg: string): void
  /** Log a WARN level message. */
  warn(msg: string): void
  /** Log an ERROR level message. */
  error(msg: string): void
  /** Log a DEBUG level message. */
  debug(msg: string): void
}

// ── ctx.http ────────────────────────────────────────────────────────────────

/** Options for `ctx.http.fetch()`. */
interface FetchOptions {
  /** HTTP method. Default: `"GET"` */
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD"
  /** Request headers as `{ key: value }`. */
  headers?: Record<string, string>
  /** Request body as string. For JSON, use `JSON.stringify()`. */
  body?: string
  /** Timeout in milliseconds. Default: `10000` (10s). */
  timeout?: number
}

/** Response from `ctx.http.fetch()`. */
interface FetchResponse {
  /** HTTP status code (e.g. 200, 404, 500). */
  status: number
  /** Response body as string. Parse with `JSON.parse()` if JSON. */
  body: string
  /** Response headers as `{ key: value }` (lowercase keys). */
  headers: Record<string, string>
}

/**
 * HTTP client for making outbound requests.
 * Runs synchronously (blocks until complete, no Promise).
 */
interface PluginHTTP {
  /**
   * Make an HTTP request.
   *
   * @param url - Full URL to fetch
   * @param options - Optional request configuration
   * @returns Response object with status, body, headers
   * @throws Error on network failure or timeout
   *
   * @example
   * // Simple GET
   * var resp = ctx.http.fetch("https://api.example.com/data")
   *
   * // POST with JSON body
   * var resp = ctx.http.fetch("https://api.example.com/notify", {
   *   method: "POST",
   *   headers: {
   *     "Content-Type": "application/json",
   *     "Authorization": "Bearer " + ctx.settings.get("token")
   *   },
   *   body: JSON.stringify({ title: "Hello" }),
   *   timeout: 5000
   * })
   * if (resp.status === 200) {
   *   var data = JSON.parse(resp.body)
   * }
   */
  fetch(url: string, options?: FetchOptions): FetchResponse
}

// ── ctx (assembled) ─────────────────────────────────────────────────────────

/**
 * The global `ctx` object injected into Goja VM plugins on activation.
 * Available in all lifecycle functions, filter handlers, route handlers, etc.
 */
interface PluginCtxGlobal {
  /** Database access (query + execute). */
  db: PluginDB
  /** Per-plugin key-value store. */
  store: PluginStore
  /** Admin-configured plugin settings (read-only). */
  settings: PluginSettings
  /** Server-side logger. */
  log: PluginLog
  /** HTTP client for outbound requests. */
  http: PluginHTTP
}

declare const ctx: PluginCtxGlobal

// ═══════════════════════════════════════════════════════════════════════════════
// Filter Context (passed to filter handler functions)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Context object passed to each filter handler.
 * Modify `data` to change what gets written to the database.
 * Call `abort(reason)` to reject the entire operation.
 *
 * @example
 * function handleCreate(fc) {
 *   if (!fc.data.title) {
 *     fc.abort("Title is required")
 *     return
 *   }
 *   fc.data.title = fc.data.title.trim()
 *   fc.meta.processed_by = "my-plugin"
 * }
 */
interface FilterContext<T extends Record<string, unknown> = Record<string, unknown>> {
  /** The filter event name (e.g. "filter:post.create"). */
  readonly event: string
  /** Mutable payload — modifications are persisted after the filter chain. */
  data: T
  /** Request-scoped KV store shared across all plugins in the same filter chain. */
  meta: Record<string, unknown>
  /**
   * Stop the filter chain immediately. All subsequent plugin handlers are skipped.
   * The operation is rejected and `reason` is surfaced to the caller.
   */
  abort(reason: string): void
}

// ═══════════════════════════════════════════════════════════════════════════════
// Route Request (passed to route handler functions)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Request object passed to custom route handlers.
 * Routes are mounted at `/api/plugin/{plugin-id}/`.
 */
interface RouteRequest {
  /** HTTP method (GET, POST, PUT, PATCH, DELETE). */
  method: string
  /** Full URL string. */
  url: string
  /** URL path portion. */
  path: string
  /** Query parameters. Single values are strings; repeated keys are arrays. */
  query: Record<string, string | string[]>
  /** Request headers as `{ key: value }`. */
  headers: Record<string, string>
  /**
   * Request body (for POST/PUT/PATCH).
   * Automatically JSON-parsed to object if valid JSON, otherwise raw string.
   */
  body: Record<string, unknown> | string
  /** Current user ID (available when auth is not "public"). */
  userId: unknown
  /** Current user role (available when auth is not "public"). */
  userRole: unknown
}

// ═══════════════════════════════════════════════════════════════════════════════
// Event Payloads (fire-and-forget events via onEvent)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Post ────────────────────────────────────────────────────────────────────

interface PostCreatedPayload {
  id: number
  title: string
  slug: string
  excerpt: string
  /** 0 = post, 1 = page */
  post_type: number
  author_id: number
  /** 0 = draft, 1 = published, 2 = trash */
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

// ── Comment ─────────────────────────────────────────────────────────────────

interface CommentCreatedPayload {
  id: number
  /** 0 = pending, 1 = approved, 2 = spam */
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
  /** 0 = pending, 1 = approved, 2 = spam */
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

// ── User ────────────────────────────────────────────────────────────────────

interface UserRegisteredPayload {
  id: number
  username: string
  email: string
  display_name: string
  locale: string
  /** 0 = subscriber, 1 = contributor, 2 = editor, 3 = admin */
  role: number
}

interface UserUpdatedPayload {
  id: number
  username: string
  email: string
  display_name: string
  locale: string
  role: number
  /** 0 = active, 1 = inactive/banned */
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

// ── Media ───────────────────────────────────────────────────────────────────

interface MediaUploadedPayload {
  id: number
  uploader_id: number
  filename: string
  mime_type: string
  /** bytes */
  file_size: number
  /** Public CDN / storage URL */
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

// ── Taxonomy / Term ─────────────────────────────────────────────────────────

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

// ── Reaction / Checkin ──────────────────────────────────────────────────────

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

// ── System ──────────────────────────────────────────────────────────────────

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

// ═══════════════════════════════════════════════════════════════════════════════
// Filter Data Shapes (ctx.data type for each filter event)
// ═══════════════════════════════════════════════════════════════════════════════

interface FilterPostCreateData {
  title: string
  slug: string
  content: string
  excerpt: string
  /** 0 = draft, 1 = published */
  status: number
  [key: string]: unknown
}

/** Only fields being updated are present. */
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

/** Only fields being updated are present. */
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
 * Fired when content is about to be returned to the frontend.
 * Modify `ctx.data.content` to change what the reader sees (does not affect storage).
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

// ═══════════════════════════════════════════════════════════════════════════════
// Event Name → Payload Mapping
// ═══════════════════════════════════════════════════════════════════════════════

interface EventPayloadMap {
  "post.created":            PostCreatedPayload
  "post.updated":            PostUpdatedPayload
  "post.published":          PostPublishedPayload
  "post.deleted":            PostDeletedPayload
  "post.viewed":             PostViewedPayload
  "comment.created":         CommentCreatedPayload
  "comment.deleted":         CommentDeletedPayload
  "comment.status_changed":  CommentStatusChangedPayload
  "comment.approved":        CommentApprovedPayload
  "user.registered":         UserRegisteredPayload
  "user.updated":            UserUpdatedPayload
  "user.deleted":            UserDeletedPayload
  "user.followed":           UserFollowedPayload
  "user.login":              UserLoginPayload
  "user.logout":             UserLogoutPayload
  "media.uploaded":          MediaUploadedPayload
  "media.deleted":           MediaDeletedPayload
  "taxonomy.created":        TaxonomyCreatedPayload
  "taxonomy.deleted":        TaxonomyDeletedPayload
  "term.created":            TermCreatedPayload
  "term.deleted":            TermDeletedPayload
  "reaction.added":          ReactionPayload
  "reaction.removed":        ReactionPayload
  "checkin.done":            CheckinPayload
  "option.updated":          OptionUpdatedPayload
  "plugin.installed":        PluginInstalledPayload
  "plugin.uninstalled":      PluginUninstalledPayload
}

// ═══════════════════════════════════════════════════════════════════════════════
// Filter Event → Data Mapping
// ═══════════════════════════════════════════════════════════════════════════════

interface FilterDataMap {
  "filter:post.create":      FilterPostCreateData
  "filter:post.update":      FilterPostUpdateData
  "filter:post.delete":      FilterPostDeleteData
  "filter:post.publish":     FilterPostPublishData
  "filter:post.restore":     FilterPostRestoreData
  "filter:comment.create":   FilterCommentCreateData
  "filter:comment.delete":   FilterCommentDeleteData
  "filter:comment.update":   FilterCommentUpdateData
  "filter:term.create":      FilterTermCreateData
  "filter:user.register":    FilterUserRegisterData
  "filter:user.update":      FilterUserUpdateData
  "filter:user.login":       FilterUserLoginData
  "filter:media.upload":     FilterMediaUploadData
  "filter:content.render":   FilterContentRenderData
}

// ═══════════════════════════════════════════════════════════════════════════════
// Plugin Definition (module.exports shape)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A filter definition in the `filters` array.
 *
 * @example
 * {
 *   event: "filter:post.create",
 *   handler: function(fc) {
 *     fc.data.title = fc.data.title.trim()
 *   }
 * }
 */
interface PluginFilterDef<E extends keyof FilterDataMap = keyof FilterDataMap> {
  /** Filter event name, e.g. "filter:post.create". */
  event: E
  /** Handler function. Receives a FilterContext with typed `data`. */
  handler(fc: FilterContext<FilterDataMap[E]>): void
}

/**
 * A route definition in the `routes` array.
 *
 * @example
 * {
 *   method: "GET",
 *   path: "/hello",
 *   auth: "public",
 *   handler: function(req) {
 *     return { code: 0, data: { message: "Hello!" } }
 *   }
 * }
 */
interface PluginRouteDef {
  /** HTTP method. Default: "GET". */
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  /** Route path. Mounted under `/api/plugin/{plugin-id}/`. */
  path: string
  /** Auth requirement. "public" = no login, "user" = login required, "admin" = admin only. */
  auth?: "public" | "user" | "admin"
  /**
   * Route handler. Receives a request object and should return a JSON-serializable value.
   * The return value is sent as the HTTP response body.
   */
  handler(req: RouteRequest): unknown
}

/**
 * The shape of `module.exports` for a Goja JS plugin.
 *
 * @example
 * module.exports = {
 *   activate: function() {
 *     ctx.log.info("Plugin activated!")
 *   },
 *   deactivate: function() {},
 *   filters: [
 *     { event: "filter:post.create", handler: function(fc) { ... } }
 *   ],
 *   routes: [
 *     { method: "GET", path: "/stats", auth: "admin", handler: function(req) { ... } }
 *   ],
 *   onEvent: function(event, data) {
 *     ctx.log.info("Event: " + event)
 *   }
 * }
 */
interface PluginExports {
  /**
   * Called when the plugin is activated.
   * The `ctx` global is already available at this point.
   */
  activate?(): void

  /** Called when the plugin is deactivated or the server shuts down. */
  deactivate?(): void

  /**
   * Array of filter definitions.
   * Each filter intercepts data BEFORE it is written to the database.
   */
  filters?: PluginFilterDef[]

  /**
   * Array of custom HTTP route definitions.
   * Routes are mounted at `/api/plugin/{plugin-id}/{path}`.
   */
  routes?: PluginRouteDef[]

  /**
   * Called for every fire-and-forget event the plugin is subscribed to.
   *
   * @param event - Event name, e.g. "post.created"
   * @param data  - Event payload (see EventPayloadMap for typed shapes)
   */
  onEvent?(event: string, data: Record<string, unknown>): void
}

// ═══════════════════════════════════════════════════════════════════════════════
// Filter Event Constants
// ═══════════════════════════════════════════════════════════════════════════════

declare namespace Filters {
  const POST_CREATE:     "filter:post.create"
  const POST_UPDATE:     "filter:post.update"
  const POST_DELETE:     "filter:post.delete"
  const POST_PUBLISH:    "filter:post.publish"
  const POST_RESTORE:    "filter:post.restore"
  const COMMENT_CREATE:  "filter:comment.create"
  const COMMENT_DELETE:  "filter:comment.delete"
  const COMMENT_UPDATE:  "filter:comment.update"
  const TERM_CREATE:     "filter:term.create"
  const USER_REGISTER:   "filter:user.register"
  const USER_UPDATE:     "filter:user.update"
  const USER_LOGIN:      "filter:user.login"
  const MEDIA_UPLOAD:    "filter:media.upload"
  const CONTENT_RENDER:  "filter:content.render"
}

// ═══════════════════════════════════════════════════════════════════════════════
// Event Name Constants
// ═══════════════════════════════════════════════════════════════════════════════

declare namespace Events {
  // Post
  const POST_CREATED:    "post.created"
  const POST_UPDATED:    "post.updated"
  const POST_PUBLISHED:  "post.published"
  const POST_DELETED:    "post.deleted"
  const POST_VIEWED:     "post.viewed"
  // Comment
  const COMMENT_CREATED:        "comment.created"
  const COMMENT_DELETED:        "comment.deleted"
  const COMMENT_STATUS_CHANGED: "comment.status_changed"
  const COMMENT_APPROVED:       "comment.approved"
  // User
  const USER_REGISTERED: "user.registered"
  const USER_UPDATED:    "user.updated"
  const USER_DELETED:    "user.deleted"
  const USER_FOLLOWED:   "user.followed"
  const USER_LOGIN:      "user.login"
  const USER_LOGOUT:     "user.logout"
  // Media
  const MEDIA_UPLOADED:  "media.uploaded"
  const MEDIA_DELETED:   "media.deleted"
  // Taxonomy / Term
  const TAXONOMY_CREATED: "taxonomy.created"
  const TAXONOMY_DELETED: "taxonomy.deleted"
  const TERM_CREATED:     "term.created"
  const TERM_DELETED:     "term.deleted"
  // Reaction / Checkin
  const REACTION_ADDED:   "reaction.added"
  const REACTION_REMOVED: "reaction.removed"
  const CHECKIN_DONE:     "checkin.done"
  // System
  const OPTION_UPDATED:     "option.updated"
  const PLUGIN_INSTALLED:   "plugin.installed"
  const PLUGIN_UNINSTALLED: "plugin.uninstalled"
}

// ═══════════════════════════════════════════════════════════════════════════════
// Manifest Types (plugin.yaml schema)
// ═══════════════════════════════════════════════════════════════════════════════

interface SettingDef {
  key: string
  label: string
  type: "string" | "number" | "boolean" | "select" | "password" | "textarea"
  required?: boolean
  default?: unknown
  placeholder?: string
  description?: string
  options?: string[]
  group?: string
}

interface PageDef {
  path: string
  slot: "admin" | "public"
  component: string
  title?: string
  nav?: {
    group?: string
    icon?: string
    order?: number
  }
}

interface RouteDef {
  method: string
  path: string
  auth?: "admin" | "user" | "public"
  fn?: string
  description?: string
}

interface MigrationDef {
  version: number
  up: string
  down?: string
}

interface WebhookDef {
  /** POST target URL. Supports `{{settings.key}}` interpolation. */
  url: string
  /** Event names or patterns (e.g. "post.*", "*"). */
  events: string[]
  /** Extra HTTP headers. Values support `{{settings.key}}` interpolation. */
  headers?: Record<string, string>
}

interface ContributesDef {
  commands?: Array<{
    id: string
    title: string
    title_en?: string
    icon?: string
  }>
  menus?: Record<string, Array<{ command: string }>>
}

interface PluginManifest {
  id: string
  title: string
  version: string
  icon?: string
  author?: string
  description?: string
  type?: "js" | "full" | "yaml" | "ui" | "builtin"
  trust_level?: "official" | "community" | "local"
  license?: string
  sdk_version?: string
  priority?: number
  repo?: string
  homepage?: string
  tags?: string[]
  js_entry?: string
  admin_js?: string
  public_js?: string
  css?: string
  settings?: SettingDef[]
  pages?: PageDef[]
  routes?: RouteDef[]
  migrations?: MigrationDef[]
  contributes?: ContributesDef
  webhooks?: WebhookDef[]
}

// ═══════════════════════════════════════════════════════════════════════════════
// nuxtblogAdmin — Browser-side global (Layer 3 — admin.js)
// ═══════════════════════════════════════════════════════════════════════════════

/** Disposable represents a registered handler that can be removed. */
interface Disposable {
  dispose(): void
}

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
 * Runs in the browser (admin panel), NOT in the Goja VM.
 */
declare const nuxtblogAdmin: {
  /**
   * Watch a post field for changes.
   * Fields: 'post.title', 'post.slug', 'post.content', 'post.excerpt'
   */
  watch(
    field: "post.title" | "post.slug" | "post.content" | "post.excerpt",
    cb: (val: string) => void
  ): Disposable

  /** Soft-set a field value. The user can manually override it. */
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

// ═══════════════════════════════════════════════════════════════════════════════
// CommonJS module globals (provided by Goja runtime)
// ═══════════════════════════════════════════════════════════════════════════════

declare var module: { exports: PluginExports }
declare var exports: PluginExports

/**
 * CommonJS require function. Resolves modules relative to the plugin directory.
 * Only files within the plugin directory are accessible.
 */
declare function require(path: string): unknown
