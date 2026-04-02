/**
 * @nuxtblog/plugin-test-utils (v0.1.0)
 *
 * A lightweight harness for unit-testing nuxtblog plugins without a running
 * server. Creates an in-process mock of the `nuxtblog` global object so
 * plugins can register filters/handlers and be exercised with plain test
 * assertions.
 *
 * @example — activate() lifecycle plugin
 * ```ts
 * import { createPluginHarness } from '@nuxtblog/plugin-test-utils'
 * import { activate } from '../src/index'
 *
 * test('pinyin slug', async () => {
 *   const h = createPluginHarness()
 *   h.settings.set('mode', 'always')
 *   h.activate(activate)
 *
 *   const result = await h.runFilter('post.create', {
 *     title: '如何学好 Python', slug: '', content: '', excerpt: '', status: 0
 *   })
 *   expect(result.slug).toBe('ru-he-xue-hao-python')
 * })
 * ```
 *
 * @example — legacy top-level plugin (sets globalThis.nuxtblog before import)
 * ```ts
 * const h = createPluginHarness()
 * h.installGlobal()           // sets globalThis.nuxtblog = h.nuxtblog
 * await import('../src/index') // plugin registers handlers at top level
 *
 * const result = await h.runFilter('post.create', { ... })
 * ```
 *
 * @example — testing route handlers
 * ```ts
 * import { createPluginHarness } from '@nuxtblog/plugin-test-utils'
 * import { handleInvoke } from '../src/index'
 *
 * test('route handler', () => {
 *   const h = createPluginHarness()
 *   h.settings.set('api_key', 'test-key')
 *   h.activate(activate)
 *
 *   const res = h.callRoute(handleInvoke, {
 *     method: 'POST', path: '/api/plugin/test/invoke',
 *     body: { action: 'polish', text: 'hello' },
 *   })
 *   expect(res.status).toBe(200)
 * })
 * ```
 *
 * @example — testing DB access
 * ```ts
 * const h = createPluginHarness()
 * h.db.seed('plugin_test_items', [
 *   { id: 1, title: 'Hello', status: 'active' }
 * ])
 * h.activate(activate)
 * // plugin can now query plugin_test_items
 * ```
 */

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type FilterHandler = (ctx: FilterCtx) => void | Promise<void>
type EventHandler  = (payload: Record<string, unknown>) => void | Promise<void>
type CommandHandler = (...args: unknown[]) => void | Promise<void>

interface FilterCtx {
  event: string
  input: Readonly<Record<string, unknown>>
  data: Record<string, unknown>
  meta: Record<string, unknown>
  next(): void
  abort(reason: string): void
}

interface PluginRequest {
  method: string
  path: string
  query?: Record<string, string>
  body?: unknown
  headers?: Record<string, string>
  userId?: number
  userRole?: string
}

interface PluginResponse {
  status: number
  body: unknown
  headers?: Record<string, string>
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
}

/** Result returned by runFilter(). */
export interface FilterResult<T extends Record<string, unknown> = Record<string, unknown>> {
  /** The (possibly mutated) data map after all handlers ran. */
  data: T
  /** true if a handler called ctx.abort(). */
  aborted: boolean
  /** The abort reason, or undefined when not aborted. */
  reason?: string
}

export interface HarnessOptions {
  settings?: Record<string, unknown>
}

export interface Disposable {
  dispose(): void
}

export interface PluginContext {
  subscriptions: Disposable[]
}

export interface AICall {
  action: string
  params: Record<string, unknown>
}

/**
 * Mock nuxtblog global object.
 */
export interface MockNuxtblog {
  on(event: string, handler: (payload: Record<string, unknown>) => void): Disposable
  filter(event: string, handler: FilterHandler): Disposable
  emit(event: string, payload: Record<string, unknown>): void
  log: {
    info(msg: string): void
    warn(msg: string): void
    error(msg: string): void
    debug(msg: string): void
  }
  http: {
    fetch(url: string, opts?: { method?: string; body?: unknown; headers?: Record<string, string> }): {
      ok: boolean; status?: number; body?: unknown; error?: string
    }
  }
  store: {
    get(key: string): unknown
    set(key: string, value: unknown): void
    delete(key: string): void
    list(prefix?: string): string[]
    getMany(keys: string[]): Record<string, unknown>
    deletePrefix(prefix: string): number
    increment(key: string, delta?: number): number
  }
  settings: {
    get(key: string): unknown
  }
  db: {
    query(sql: string, ...args: unknown[]): Array<Record<string, unknown>> | null
    execute(sql: string, ...args: unknown[]): number
  }
  ai: {
    polish(content: string, style?: string): { ok: boolean; text?: string; error?: string }
    summarize(content: string, maxLength?: number): { ok: boolean; text?: string; error?: string }
    suggestTags(title: string, content: string): { ok: boolean; text?: string; error?: string }
    translate(content: string, targetLang: string): { ok: boolean; text?: string; error?: string }
  }
  commands: {
    register(id: string, handler: CommandHandler): Disposable
    execute(id: string, ...args: unknown[]): Promise<void>
  }
}

/**
 * In-memory mock for plugin DB tables.
 */
export interface MockDB {
  /** Seed a table with rows for testing. */
  seed(table: string, rows: Array<Record<string, unknown>>): void
  /** Get all rows in a mock table. */
  getTable(table: string): Array<Record<string, unknown>>
  /** Clear all mock tables. */
  clear(): void
  /** Recorded SQL calls for assertions. */
  queries: Array<{ sql: string; args: unknown[] }>
  /** Recorded execute calls for assertions. */
  executions: Array<{ sql: string; args: unknown[] }>
}

/**
 * The test harness returned by createPluginHarness().
 */
export interface PluginHarness {
  nuxtblog: MockNuxtblog
  ctx: PluginContext

  activate(activateFn: (ctx: PluginContext) => void): void
  deactivate(deactivateFn?: () => void): void
  installGlobal(): () => void

  runFilter<T extends Record<string, unknown>>(
    event: string, data: T
  ): Promise<FilterResult<T>>

  trigger(event: string, payload?: Record<string, unknown>): Promise<void>

  /** Call a route handler function with a mock request. */
  callRoute(
    handler: (req: PluginRequest) => PluginResponse,
    req: Partial<PluginRequest>
  ): PluginResponse

  settings: {
    set(key: string, value: unknown): void
    get(key: string): unknown
    all(): Record<string, unknown>
  }

  logs: LogEntry[]
  clearLogs(): void

  httpCalls: Array<{ url: string; opts?: unknown }>
  mockHttp(
    fn: (url: string, opts?: unknown) => { ok: boolean; status?: number; body?: unknown; error?: string }
  ): void

  /** Emitted custom events for assertions. */
  emittedEvents: Array<{ event: string; payload: Record<string, unknown> }>

  /** Recorded AI calls for assertions. */
  aiCalls: AICall[]
  /** Override AI mock responses. */
  mockAI(fn: (action: string, params: Record<string, unknown>) => { ok: boolean; text?: string; error?: string }): void

  /** Mock DB access for testing plugins that use nuxtblog.db. */
  db: MockDB
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function createPluginHarness(options?: HarnessOptions): PluginHarness {
  // ── Internal state ─────────────────────────────────────────────────────────
  const _settings: Record<string, unknown> = { ...(options?.settings ?? {}) }
  const _store: Record<string, unknown> = {}
  const _logs: LogEntry[] = []
  const _httpCalls: Array<{ url: string; opts?: unknown }> = []
  const _emittedEvents: Array<{ event: string; payload: Record<string, unknown> }> = []
  const _aiCalls: AICall[] = []

  const _eventHandlers = new Map<string, EventHandler[]>()
  const _filterHandlers = new Map<string, FilterHandler[]>()
  const _commands = new Map<string, CommandHandler>()

  let _httpMock: ((url: string, opts?: unknown) => { ok: boolean; status?: number; body?: unknown; error?: string }) | null = null
  let _aiMock: ((action: string, params: Record<string, unknown>) => { ok: boolean; text?: string; error?: string }) | null = null

  // Mock DB
  const _dbTables = new Map<string, Array<Record<string, unknown>>>()
  const _dbQueries: Array<{ sql: string; args: unknown[] }> = []
  const _dbExecutions: Array<{ sql: string; args: unknown[] }> = []

  // ── nuxtblog.on / nuxtblog.filter ──────────────────────────────────────────

  function nbOn(event: string, handler: EventHandler): Disposable {
    if (!_eventHandlers.has(event)) _eventHandlers.set(event, [])
    _eventHandlers.get(event)!.push(handler)
    return {
      dispose() {
        const list = _eventHandlers.get(event)
        if (!list) return
        const idx = list.indexOf(handler)
        if (idx !== -1) list.splice(idx, 1)
      }
    }
  }

  function nbFilter(event: string, handler: FilterHandler): Disposable {
    const key = 'filter:' + event
    if (!_filterHandlers.has(key)) _filterHandlers.set(key, [])
    _filterHandlers.get(key)!.push(handler)
    return {
      dispose() {
        const list = _filterHandlers.get(key)
        if (!list) return
        const idx = list.indexOf(handler)
        if (idx !== -1) list.splice(idx, 1)
      }
    }
  }

  // ── nuxtblog.emit ──────────────────────────────────────────────────────────

  function nbEmit(event: string, payload: Record<string, unknown>): void {
    _emittedEvents.push({ event, payload })
    // Also dispatch to handlers (simulates fanOut)
    const handlers = _eventHandlers.get(event) ?? []
    for (const handler of handlers) {
      try { handler(payload) } catch { /* ignore in tests */ }
    }
  }

  // ── nuxtblog.log ───────────────────────────────────────────────────────────

  function makeLog(level: LogEntry['level']) {
    return (msg: string) => _logs.push({ level, message: msg })
  }

  // ── nuxtblog.http.fetch ────────────────────────────────────────────────────

  function nbFetch(url: string, opts?: unknown) {
    _httpCalls.push({ url, opts })
    if (_httpMock) return _httpMock(url, opts)
    return { ok: true, status: 200, body: null }
  }

  // ── nuxtblog.store ─────────────────────────────────────────────────────────

  const nbStore = {
    get(key: string): unknown { return _store[key] ?? null },
    set(key: string, value: unknown): void { _store[key] = value },
    delete(key: string): void { delete _store[key] },
    list(prefix?: string): string[] {
      const keys = Object.keys(_store)
      return prefix ? keys.filter(k => k.startsWith(prefix)) : keys
    },
    getMany(keys: string[]): Record<string, unknown> {
      return Object.fromEntries(keys.map(k => [k, _store[k] ?? null]))
    },
    deletePrefix(prefix: string): number {
      const keys = Object.keys(_store).filter(k => k.startsWith(prefix))
      keys.forEach(k => delete _store[k])
      return keys.length
    },
    increment(key: string, delta = 1): number {
      const current = typeof _store[key] === 'number' ? (_store[key] as number) : 0
      _store[key] = current + delta
      return current + delta
    }
  }

  // ── nuxtblog.db ────────────────────────────────────────────────────────────

  const nbDB = {
    query(sql: string, ...args: unknown[]): Array<Record<string, unknown>> | null {
      _dbQueries.push({ sql, args })
      // Simple mock: return rows from seeded table if SQL contains the table name
      for (const [table, rows] of _dbTables.entries()) {
        if (sql.includes(table)) return [...rows]
      }
      return []
    },
    execute(sql: string, ...args: unknown[]): number {
      _dbExecutions.push({ sql, args })
      return 1
    }
  }

  // ── nuxtblog.ai ────────────────────────────────────────────────────────────

  function makeAIMethod(action: string) {
    return (...params: unknown[]) => {
      const paramsMap: Record<string, unknown> = {}
      if (action === 'polish') {
        paramsMap.content = params[0]; paramsMap.style = params[1]
      } else if (action === 'summarize') {
        paramsMap.content = params[0]; paramsMap.maxLength = params[1]
      } else if (action === 'suggestTags') {
        paramsMap.title = params[0]; paramsMap.content = params[1]
      } else if (action === 'translate') {
        paramsMap.content = params[0]; paramsMap.targetLang = params[1]
      }
      _aiCalls.push({ action, params: paramsMap })
      if (_aiMock) return _aiMock(action, paramsMap)
      return { ok: true, text: `[mock ${action} result]` }
    }
  }

  const nbAI = {
    polish: makeAIMethod('polish'),
    summarize: makeAIMethod('summarize'),
    suggestTags: makeAIMethod('suggestTags'),
    translate: makeAIMethod('translate'),
  }

  // ── nuxtblog.commands ──────────────────────────────────────────────────────

  const nbCommands = {
    register(id: string, handler: CommandHandler): Disposable {
      _commands.set(id, handler)
      return {
        dispose() { _commands.delete(id) }
      }
    },
    async execute(id: string, ...args: unknown[]): Promise<void> {
      const handler = _commands.get(id)
      if (handler) await handler(...args)
    }
  }

  // ── Assemble mock nuxtblog ─────────────────────────────────────────────────

  const nuxtblog: MockNuxtblog = {
    on: nbOn,
    filter: nbFilter,
    emit: nbEmit,
    log: {
      info:  makeLog('info'),
      warn:  makeLog('warn'),
      error: makeLog('error'),
      debug: makeLog('debug'),
    },
    http: { fetch: nbFetch },
    store: nbStore,
    settings: {
      get: (key: string) => _settings[key] ?? null,
    },
    db: nbDB,
    ai: nbAI as MockNuxtblog['ai'],
    commands: nbCommands,
  }

  // ── PluginContext (for activate) ───────────────────────────────────────────

  const ctx: PluginContext = { subscriptions: [] }

  // ── Harness methods ───────────────────────────────────────────────────────

  function activate(activateFn: (ctx: PluginContext) => void): void {
    ctx.subscriptions = []
    activateFn(ctx)
  }

  function deactivate(deactivateFn?: () => void): void {
    if (deactivateFn) deactivateFn()
    for (const sub of ctx.subscriptions) {
      try { sub.dispose() } catch { /* ignore disposal errors in tests */ }
    }
    ctx.subscriptions = []
  }

  function installGlobal(): () => void {
    const g = globalThis as Record<string, unknown>
    const prev = g['nuxtblog']
    g['nuxtblog'] = nuxtblog
    return () => { g['nuxtblog'] = prev }
  }

  async function runFilter<T extends Record<string, unknown>>(
    event: string,
    data: T
  ): Promise<FilterResult<T>> {
    const key = 'filter:' + event
    const handlers = _filterHandlers.get(key) ?? []
    let aborted = false
    let reason: string | undefined

    const mutableData: Record<string, unknown> = JSON.parse(JSON.stringify(data))
    const inputSnapshot: Readonly<Record<string, unknown>> = JSON.parse(JSON.stringify(data))
    const meta: Record<string, unknown> = {}

    for (const handler of handlers) {
      if (aborted) break

      let _aborted = false
      let _reason = ''

      const ctx: FilterCtx = {
        event: 'filter:' + event,
        input: inputSnapshot,
        data: mutableData,
        meta,
        next() { /* no-op, chain continues by default */ },
        abort(r: string) { _aborted = true; _reason = r }
      }

      await handler(ctx)

      if (_aborted) {
        aborted = true
        reason = _reason
      }
    }

    return { data: mutableData as T, aborted, reason }
  }

  async function trigger(event: string, payload: Record<string, unknown> = {}): Promise<void> {
    const handlers = _eventHandlers.get(event) ?? []
    for (const handler of handlers) {
      await handler(payload)
    }
  }

  function callRoute(
    handler: (req: PluginRequest) => PluginResponse,
    req: Partial<PluginRequest>
  ): PluginResponse {
    const fullReq: PluginRequest = {
      method: req.method ?? 'GET',
      path: req.path ?? '/',
      query: req.query ?? {},
      body: req.body ?? null,
      headers: req.headers ?? {},
      userId: req.userId,
      userRole: req.userRole,
    }
    return handler(fullReq)
  }

  const settingsAPI = {
    set(key: string, value: unknown): void { _settings[key] = value },
    get(key: string): unknown { return _settings[key] ?? null },
    all(): Record<string, unknown> { return { ..._settings } },
  }

  const mockDB: MockDB = {
    seed(table: string, rows: Array<Record<string, unknown>>): void {
      _dbTables.set(table, [...rows])
    },
    getTable(table: string): Array<Record<string, unknown>> {
      return _dbTables.get(table) ?? []
    },
    clear(): void { _dbTables.clear() },
    queries: _dbQueries,
    executions: _dbExecutions,
  }

  return {
    nuxtblog,
    ctx,
    activate,
    deactivate,
    installGlobal,
    runFilter,
    trigger,
    callRoute,
    settings: settingsAPI,
    logs: _logs,
    clearLogs(): void { _logs.length = 0 },
    httpCalls: _httpCalls,
    mockHttp(fn) { _httpMock = fn },
    emittedEvents: _emittedEvents,
    aiCalls: _aiCalls,
    mockAI(fn) { _aiMock = fn },
    db: mockDB,
  }
}
