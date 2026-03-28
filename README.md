# @nuxtblog/plugin-sdk

TypeScript type definitions and base `tsconfig` for [nuxtblog](https://github.com/nuxtblog/nuxtblog) plugins.

## Installation

```bash
npm install -D @nuxtblog/plugin-sdk
# or
pnpm add -D @nuxtblog/plugin-sdk
```

## Usage

### tsconfig.json

```json
{
  "extends": "@nuxtblog/plugin-sdk",
  "include": ["src"]
}
```

This gives you:

- Strict TypeScript compiler options tuned for plugin bundles
- The global `blog` object with full type coverage (`nuxtblog.on`, `nuxtblog.filter`, `nuxtblog.log`, `nuxtblog.http`, `nuxtblog.store`, `nuxtblog.settings`)

### Example plugin

```ts
// src/index.ts

nuxtblog.on("post.published", (payload) => {
  nuxtblog.log.info(`Post published: ${payload.title}`)
})

nuxtblog.filter("content.render", (data) => {
  data.content = data.content.replace(/foo/g, "bar")
  return data
})
```

## Plugin manifest (package.json)

Every plugin declares its metadata in `package.json` using the `"plugin"` field:

```json
{
  "name":        "owner/repo",
  "version":     "1.0.0",
  "description": "What it does",
  "author":      "owner",
  "license":     "MIT",
  "plugin": {
    "title":  "My Plugin",
    "icon":   "i-tabler-plug",
    "entry":  "index.js"
  }
}
```

## Publishing a plugin

See the [nuxtblog plugin registry](https://github.com/nuxtblog/registry) for how to submit your plugin to the marketplace.

## License

MIT
