# Changelog

All notable changes to this project will be documented in this file.

This file is maintained by [conventional-changelog](https://github.com/conventional-changelog/conventional-changelog) via the `pnpm release` flow.

## [0.2.1](https://github.com/mengbaba/taro-vite-vue-scoped-adapter/compare/v0.2.0...v0.2.1) (2026-09-01)


### Bug Fixes

* skip scoped transform on H5 to keep native scoped and HMR consistency ([addd62a](https://github.com/mengbaba/taro-vite-vue-scoped-adapter/commit/addd62ae9807a6bb33fc46361992c64f20c75cf0))

## [0.2.0](https://github.com/mengbaba/taro-vite-vue-scoped-adapter/compare/v0.1.0...v0.2.0) (2026-09-01)


### Features

* initial public release of taro-vite-vue-scoped-adapter ([e91cd34](https://github.com/mengbaba/taro-vite-vue-scoped-adapter/commit/e91cd34cfb5452cd0d34c6afa759180431f2f39d))


### Bug Fixes

* **ci:** add release-please manifest file with current version ([875141a](https://github.com/mengbaba/taro-vite-vue-scoped-adapter/commit/875141ad4eb98e3c6a37f6dd71045b4cf1ef3108))

## 0.1.0 (2026-09-01)

### Features

- Initial public release
- Core conversion (`convertVueScoped`): bundler-agnostic pure function, deterministic wrapper class from file-path hash
- Vite plugin adapter (default export) for Taro `compiler.vitePlugins`
- webpack loader adapter (`./webpack` subpath) for Taro webpack5 compile mode
- Options: `include` / `exclude` filters, `classPrefix`, `generateClassName`, `wrapperTag`, `transformPseudoSelectors`
- ESM + CJS dual builds with callable-`require()` interop, TypeScript declarations included
