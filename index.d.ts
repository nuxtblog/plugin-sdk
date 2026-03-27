/**
 * plugin.json — manifest fields
 *
 * {
 *   "name":        "owner/repo",          // required, unique plugin ID
 *   "title":       "My Plugin",
 *   "description": "...",
 *   "version":     "1.0.0",
 *   "author":      "owner",
 *   "icon":        "i-tabler-plug",
 *   "entry":       "index.js",            // bundled JS entry (default: dist/index.js)
 *   "css":         ".my-class { ... }",   // optional CSS injected into frontend <head>
 *   "priority":    10,                    // execution order: lower runs first (default: 10)
 *   "settings":    [ ... ]
 * }
 *
 * Priority examples:
 *   1  → runs very early  (e.g. pre-processing, sanitization)
 *   10 → default
 *   20 → runs late        (e.g. post-processing, injection)
 */

/**
 * blog.* — Plugin API type declarations
 *
 * Install the SDK package and add to tsconfig.json:
 *
 *   "devDependencies": { "@nuxtblog/plugin-sdk": "workspace:*" }
 *
 * Then in tsconfig.json:
 *
 *   "extends": "@nuxtblog/plugin-sdk"
 */

// ---------------------------------------------------------------------------
// Event payloads  (blog.on)
// ---------------------------------------------------------------------------

// ── Post ────────────────────────────────────────────────────────────────────

interface PostCreatedPayload {
  id: number
  title: string
  slug: string
  excerpt: string
  /** 0=post  1=page */
  post_type: number
  author_id: number
  /** 0=draft  1=published  2=trash */
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

// ── Comment ──────────────────────────────────────────────────────────────────

interface CommentCreatedPayload {
  id: number
  /** 0=pending  1=approved  2=spam */
  status: number
  object_type: string
  object_id: number
  object_title: string
  object_slug: string
  post_author_id: number
  /** undefined for top-level comments */
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
  /** 0=pending  1=approved  2=spam */
  old_status: number
  new_status: number
  moderator_id: number
}

// ── User ─────────────────────────────────────────────────────────────────────

interface UserRegisteredPayload {
  id: number
  username: string
  email: string
  display_name: string
  locale: string
  /** 0=subscriber  1=contributor  2=editor  3=admin */
  role: number
}

interface UserUpdatedPayload {
  id: number
  username: string
  email: string
  display_name: string
  locale: string
  role: number
  /** 0=active  1=inactive/banned */
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

// ---------------------------------------------------------------------------
// Filter data shapes  (blog.filter)
// ---------------------------------------------------------------------------

interface FilterPostCreateData {
  title: string
  slug: string
  content: string
  excerpt: string
  /** 0=draft  1=published */
  status: number
}

/** Only fields being updated are present */
type FilterPostUpdateData = Partial<FilterPostCreateData>

interface FilterCommentCreateData {
  content: string
  author_name: string
  author_email: string
}

interface FilterUserRegisterData {
  username: string
  email: string
  display_name: string
}

/** Only fields being updated are present */
interface FilterUserUpdateData {
  display_name?: string
  bio?: string
  locale?: string
  status?: number
}

interface FilterMediaUploadData {
  filename: string
  mime_type: string
  category: string
  alt_text: string
  title: string
}

/**
 * Fired when a post, page, or doc is read and about to be returned to the frontend.
 * `content` is the raw markdown source — modify it to change what the reader sees.
 */
interface FilterContentRenderData {
  /** Raw markdown source */
  content: string
  /** "post" | "page" | "doc" */
  type: string
  id: number
  slug: string
  title: string
}

// ---------------------------------------------------------------------------
// blog.http
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
}

// ---------------------------------------------------------------------------
// blog.store
// ---------------------------------------------------------------------------

interface BlogStore {
  get(key: string): unknown
  set(key: string, value: unknown): void
  delete(key: string): void
}

// ---------------------------------------------------------------------------
// blog.on overloads
// ---------------------------------------------------------------------------

interface BlogOn {
  // Post
  (event: "post.created",   handler: (payload: PostCreatedPayload)   => void): void
  (event: "post.updated",   handler: (payload: PostUpdatedPayload)   => void): void
  (event: "post.published", handler: (payload: PostPublishedPayload) => void): void
  (event: "post.deleted",   handler: (payload: PostDeletedPayload)   => void): void
  // Comment
  (event: "comment.created",        handler: (payload: CommentCreatedPayload)        => void): void
  (event: "comment.deleted",        handler: (payload: CommentDeletedPayload)        => void): void
  (event: "comment.status_changed", handler: (payload: CommentStatusChangedPayload) => void): void
  // User
  (event: "user.registered", handler: (payload: UserRegisteredPayload) => void): void
  (event: "user.updated",    handler: (payload: UserUpdatedPayload)    => void): void
  (event: "user.deleted",    handler: (payload: UserDeletedPayload)    => void): void
  (event: "user.followed",   handler: (payload: UserFollowedPayload)   => void): void
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
  /** Fallback for custom / future events */
  (event: string, handler: (payload: unknown) => void): void
}

// ---------------------------------------------------------------------------
// blog.filter overloads
// ---------------------------------------------------------------------------

interface BlogFilter {
  (event: "post.create",
   handler: (data: FilterPostCreateData) => FilterPostCreateData | null | undefined): void
  (event: "post.update",
   handler: (data: FilterPostUpdateData) => FilterPostUpdateData | null | undefined): void
  (event: "comment.create",
   handler: (data: FilterCommentCreateData) => FilterCommentCreateData | null | undefined): void
  (event: "user.register",
   handler: (data: FilterUserRegisterData) => FilterUserRegisterData | null | undefined): void
  (event: "user.update",
   handler: (data: FilterUserUpdateData) => FilterUserUpdateData | null | undefined): void
  (event: "media.upload",
   handler: (data: FilterMediaUploadData) => FilterMediaUploadData | null | undefined): void
  (event: "content.render",
   handler: (data: FilterContentRenderData) => FilterContentRenderData | null | undefined): void
  /** Fallback for custom / future filter events */
  (event: string, handler: (data: unknown) => unknown): void
}

// ---------------------------------------------------------------------------
// Global blog object
// ---------------------------------------------------------------------------

declare const blog: {
  /** Subscribe to a fire-and-forget event (async, cannot modify data). */
  on: BlogOn

  /**
   * Register a synchronous data interceptor.
   * Runs before data is written to the database.
   * Must return the (possibly modified) data, or null/undefined to pass through.
   * Throwing an Error rejects the operation and surfaces the message to the caller.
   */
  filter: BlogFilter

  /** Write a message to the server log (prefixed with [plugin:<id>]). */
  log(message: string): void

  http: {
    /**
     * Synchronous HTTP request (not a Promise). Timeout: 15 seconds.
     */
    fetch<T = unknown>(url: string, opts?: FetchOptions): FetchResult<T>
  }

  /** Per-plugin persistent key-value store backed by the blog database. */
  store: BlogStore

  /**
   * Read admin-configured plugin settings at call time.
   * Values are set in the admin panel (Plugins → Settings gear icon).
   * No plugin restart is needed when settings change.
   */
  settings: {
    /** Returns the configured value for `key`, or `null` if not set. */
    get(key: string): unknown
  }
}
