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
- The global `blog` object with full type coverage (`blog.on`, `blog.filter`, `blog.log`, `blog.http`, `blog.store`, `blog.settings`)

### Example plugin

```ts
// src/index.ts

blog.on("post.published", (payload) => {
  blog.log(`Post published: ${payload.title}`)
})

blog.filter("content.render", (data) => {
  data.content = data.content.replace(/foo/g, "bar")
  return data
})
```

## Plugin manifest (plugin.json)

Every plugin must ship a `plugin.json` at the zip root:

```json
{
  "name":        "owner/repo",
  "title":       "My Plugin",
  "description": "What it does",
  "version":     "1.0.0",
  "author":      "owner",
  "icon":        "i-tabler-plug",
  "entry":       "index.js"
}
```

## Publishing a plugin

See the [nuxtblog plugin registry](https://github.com/nuxtblog/registry) for how to submit your plugin to the marketplace.

## License

MIT
