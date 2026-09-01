# Changelog

All notable changes to this project will be documented in this file.

This file is maintained by [conventional-changelog](https://github.com/conventional-changelog/conventional-changelog) via the `pnpm release` flow.

## 0.1.0 (2026-09-01)

### Features

- Initial public release
- Core conversion (`convertVueScoped`): bundler-agnostic pure function, deterministic wrapper class from file-path hash
- Vite plugin adapter (default export) for Taro `compiler.vitePlugins`
- webpack loader adapter (`./webpack` subpath) for Taro webpack5 compile mode
- Options: `include` / `exclude` filters, `classPrefix`, `generateClassName`, `wrapperTag`, `transformPseudoSelectors`
- ESM + CJS dual builds with callable-`require()` interop, TypeScript declarations included
