# taro-vite-vue-scoped-adapter

**English** | [中文](./README.md)

A Vite plugin that fixes **broken `scoped` styles when compiling WeChat mini programs with Taro + Vue3**. 

---

## Background

Vue compiles `<style scoped>` selectors into `.x[data-v-hash]` attribute selectors, which rely on the `data-v-hash` attribute being rendered on elements at runtime.

However, Taro's mini program runtime renders via **virtual DOM → WXML template serialization**, which only emits a whitelist of attributes (`class`, `style`, etc.). **The `data-v` attribute never appears on real nodes**, so every `scoped` selector fails to match and styles silently break.

## How It Works

Each `.vue` file containing `scoped` styles is transformed at the source level (in memory only — your files on disk are never modified):

1. The template content is wrapped in a root node with a unique class: `<view class="taro-scoped-{fileName}-{hash}">`
2. The `scoped` style content is nested under that selector (`.taro-scoped-xxx { ... }`), and the `scoped` attribute is removed from the tag

Implementation highlights:

- Uses `@vue/compiler-sfc` to locate template / style block offsets and performs **string-level edits**; the SFC is never reconstructed, so script blocks, non-scoped styles and comments are preserved as-is
- Class names are generated from a **deterministic hash of the file path** (djb2) — stable across builds and processes, cache friendly
- No jsdom template rewriting, so no attribute corruption risk
- Only inline styles with `lang="scss|less"` are wrapped (relying on preprocessor nesting); in other cases only the `scoped` attribute is removed (see [Known Limitations](#known-limitations))

## Installation

```bash
npm install -D taro-vite-vue-scoped-adapter
```

> For other package managers (pnpm / yarn / etc.), use the equivalent command of your choice.

## Usage

Inject the plugin in your Taro config (`compiler` must be in **object form** to attach `vitePlugins`):

```ts
// config/index.ts
import path from 'node:path'

import { defineConfig } from '@tarojs/cli'
import taroViteVueScopedAdapter from 'taro-vite-vue-scoped-adapter'

export default defineConfig(async () => ({
  framework: 'vue3',
  compiler: {
    type: 'vite',
    vitePlugins: [
      taroViteVueScopedAdapter({
        include: path.resolve(__dirname, '../src')
      })
    ]
  }
}))
```

You can then write `scoped` styles as usual — behavior is consistent between mini program and H5 (each file gets its own unique class name, no cross-page pollution):

```vue
<!-- pages/index/index.vue -->
<template>
  <view class="home">...</view>
</template>

<style lang="scss" scoped>
.home {
  padding: 24px; /* Compiled to .taro-scoped-index-{hash} .home for mini program, works as expected */
}
</style>
```

### Webpack Compile Mode

For Taro projects using the webpack5 compile mode, inject the loader via `webpackChain` (it is appended to the end of the `.vue` rule's `use` array, so it runs first and transforms the raw SFC source before vue-loader):

```ts
// config/index.ts
export default defineConfig(async () => ({
  framework: 'vue3',
  compiler: 'webpack5',
  mini: {
    webpackChain(chain) {
      chain.module
        .rule('vue')
        .use('taro-vue-scoped')
        .loader('taro-vite-vue-scoped-adapter/webpack')
        // .options({ include: ..., classPrefix: ... }) — same options as the Vite plugin
    }
  }
}))
```

> For file scope control, prefer the webpack rule's own `include` / `exclude`; the loader options also accept the same fields as a secondary filter. If the `.vue` rule has a different name in your chain, adjust accordingly.
>
> Note: the `webpack` version in your project must match the one required by `@tarojs/webpack5-runner` (4.2.x pins 5.91.0); webpack ≥5.99 changed the ProgressPlugin schema, which breaks the runner itself (unrelated to this plugin).

## Options & Configuration

### Plugin Options

| Option                       | Type                                                           | Default                                | Description                                                                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `include`                  | `string \| Array<string \| RegExp> \| RegExp \| (id) => boolean` | `path.resolve(process.cwd(), 'src')` | File filter (strings match as path prefixes); invalid entries are warned about and skipped, and if all entries are invalid no file is transformed                               |
| `exclude`                  | Same as`include`                                             | No exclusion                           | Exclusion filter, takes priority over`include`                                                                                                                                |
| `classPrefix`              | `string`                                                     | `'taro-scoped'`                      | Prefix of the wrapper class name, final form`{prefix}-{fileName}-{hash}`; invalid values (empty / not a CSS identifier) are warned about and fall back to the default         |
| `generateClassName`        | `(filePath: string) => string`                               | Built-in rule                          | Fully customize the wrapper class name, takes priority over`classPrefix`; throws or returns an invalid name → warn and fall back to the built-in rule                        |
| `wrapperTag`               | `string`                                                     | `'view'`                             | Tag name of the template wrapper node; invalid tag names are warned about and fall back to`'view'`                                                                            |
| `transformPseudoSelectors` | `boolean`                                                    | `false`                              | Whether to expand`:deep()` / `::v-deep` / `:slotted()` / `:global()` into plain selectors; style blocks with unbalanced parentheses are warned about and kept untouched |

> The webpack loader (`taro-vite-vue-scoped-adapter/webpack`) accepts exactly the same options, passed via `use(...).options({ ... })`.

### Taro Config

**Vite compile mode**

| Field                    | Location            | Description                                                                                                 |
| ------------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `compiler.type`        | `config/index.ts` | Must be`'vite'`                                                                                           |
| `compiler.vitePlugins` | `config/index.ts` | Array of Vite plugins; note that plugins cannot be injected when`compiler` is the plain string `'vite'` |

**webpack5 compile mode**

| Field                 | Location            | Description                                                                                                                                   |
| --------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `compiler`          | `config/index.ts` | Set to`'webpack5'`                                                                                                                          |
| `mini.webpackChain` | `config/index.ts` | Inject the loader via`chain.module.rule('vue').use(...).loader('taro-vite-vue-scoped-adapter/webpack')` (see [Usage](#webpack-compile-mode)) |

### Exports

| Export                          | Kind           | Description                                                                                                                               |
| ------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `default`                     | Vite plugin    | `taroViteVueScopedAdapter(options?)`                                                                                                    |
| `convertVueScoped`            | Named export   | Core bundler-agnostic pure function`(source, filePath, options?) => { code, changed, className? }`, reusable for other bundler adapters |
| `wrapperClassNameFor`         | Named export   | Generates the deterministic wrapper class name from a file path, customizable via`classPrefix`                                          |
| `createMatcher`               | Named export   | Normalizes an`include`/`exclude` filter into a predicate function                                                                     |
| `expandScopedPseudoSelectors` | Named export   | Expands`scoped`-specific pseudo selectors like `:deep()` into plain selectors                                                         |
| `./webpack` subpath           | webpack loader | `require()` returns the loader function directly, for injection into webpack rules (see [Usage](#webpack-compile-mode))                  |

### Error Handling Strategy

- **Invalid configuration** (prefix / tag name / filter entries): a clear console warning explains the cause and the fallback; the build is not interrupted
- **Local style-block failure** (e.g. unbalanced pseudo-selector parentheses): warn and keep that block untouched while transforming the rest normally
- **File parse failure**: throws a clear error containing the plugin name, file path and concrete reason, displayed directly by Vite in the build log

## Compatibility

| Item          | Support                                                                                                                                                                                                                                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite          | Supported from 4.0.0 (5.x verified; 6.0 and above not yet verified)                                                                                                                                                                                                                                                                           |
| webpack       | 5.x (Taro webpack5 compile mode); verified end-to-end with 5.91.0 in this repo. Note: the project's`webpack` version must match the one required by `@tarojs/webpack5-runner` (the ProgressPlugin schema change in ≥5.99 breaks the runner itself, unrelated to this plugin); webpack 4 compile mode (`webpack4`) is not supported yet |
| Taro          | Supported from 4.0; Vite compile mode via the`compiler.vitePlugins` injection point, webpack5 compile mode via the `./webpack` loader subpath; 3.x is not supported yet                                                                                                                                                                   |
| Framework     | Taro Vue3 only (`framework: 'vue3'`); React and other frameworks are not supported                                                                                                                                                                                                                                                          |
| Vue syntax    | Vue 3 single-file components (relies on `@vue/compiler-sfc`); Vue 2 is not supported |
| H5            | Not transformed: H5 runs on real DOM where Vue's native `scoped` works as-is; skipping also avoids styles being lost after HMR due to block-level update granularity. Transformation applies to mini program builds only |
| Module format | Both ESM and CommonJS are supported (the main entry and the`./webpack` subpath each ship `.js` / `.cjs`), with TypeScript declarations included                                                                                                                                                                                         |
| Node.js       | Follows the Node version requirement of the Vite version you use                                                                                                                                                                                                                                                                              |
| Style syntax  | Only inline styles with`lang="scss\|less"` get content wrapping; see [Known Limitations](#known-limitations) for other syntaxes                                                                                                                                                                                                               |

## Architecture (Multi-Bundler Support)

```
src/
├── core.ts     # Core transform: convertVueScoped(source, filePath, options?) — bundler-agnostic pure function
├── vite.ts     # Vite plugin (enforce: 'pre' transform)
├── webpack.ts  # webpack loader (runs before vue-loader, transforms the raw SFC)
└── index.ts    # Entry: default-exports the Vite plugin + named-exports the core function
```

The core module has no dependency on any bundler context; both the Vite plugin and the webpack loader are thin wrappers around it, and adding a rollup or other bundler adapter later is equally just one thin layer.

## Known Limitations

- `scoped`-specific pseudo selectors such as `:deep()` / `:slotted()` / `:global()` are not transformed by default: after wrapping, the whole style block already lives inside the file's own scope, and plain descendant selectors cover most use cases; enable `transformPseudoSelectors: true` to expand them into plain selectors if needed
- `scoped` styles with `lang="sass"` (indented syntax) or no `lang` (plain CSS) only get the `scoped` attribute removed, without content nesting: the former cannot be wrapped with braces, and mini program support for native CSS nesting is unreliable

## Local Development

```bash
pnpm install        # Install dependencies (also installs git hooks via simple-git-hooks)
pnpm test           # Run the vitest suite
pnpm build          # Emits dist/ (ESM + CJS + d.ts)
```

Release flow: fully automated by [release-please](https://github.com/googleapis/release-please-action) — when conventional commits land on `main`, a Release PR is created automatically (version bump + CHANGELOG); merging that PR tags the release, and GitHub Actions runs the tests and publishes to npm. No local commands required.

## License

MIT
