# taro-vite-vue-scoped-adapter

[English](./README.en-US.md) | **中文**

Vite 插件：解决 **Taro + Vue3 编译小程序时 `scoped` 样式失效**的问题。

## 背景

Vue 会把 `<style scoped>` 的选择器编译为 `.x[data-v-hash]` 属性选择器，运行时依赖元素上渲染出的 `data-v-hash` 属性。

但 Taro 小程序运行时通过 **虚拟 DOM → WXML 模板序列化** 渲染，只输出白名单属性（`class`、`style` 等），**`data-v` 属性不会出现在真实节点上**，导致所有 `scoped` 选择器永远匹配不上、样式静默失效。

## 原理

对每个含 `scoped` 样式的 `.vue` 文件做源码级转换（内存中进行，不改磁盘文件）：

1. 给模板内容包一层带唯一类名的根节点 `<view class="taro-scoped-{fileName}-{hash}">`
2. 把 `scoped` 样式内容嵌套进该选择器（`.taro-scoped-xxx { ... }`），并移除标签上的 `scoped` 属性

实现要点：

- 基于 `@vue/compiler-sfc` 解析出 template / style 块的源码偏移量，做**字符串级编辑**；不重构整个 SFC，script 块、普通样式、注释原样保留
- 类名由**文件路径确定性哈希**生成（djb2），同一文件跨构建、跨进程类名稳定，缓存友好
- 不使用 jsdom 重写模板，无属性损坏风险
- 仅对 `lang="scss|less"` 的内联样式做内容包裹（依赖预处理器嵌套语法）；其他情况只移除 `scoped` 属性（见[已知限制](#已知限制)）

## 安装

```bash
npm install -D taro-vite-vue-scoped-adapter
```

> 其他包管理器（pnpm / yarn 等）请按各自习惯等价安装。

## 使用案例

在 Taro 配置中注入插件（`compiler` 必须是**对象形式**才能挂 `vitePlugins`）：

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

之后页面即可正常写 `scoped` 样式，小程序与 H5 行为一致（每个文件独立唯一类名，互不污染）：

```vue
<!-- pages/index/index.vue -->
<template>
  <view class="home">...</view>
</template>

<style lang="scss" scoped>
.home {
  padding: 24px; /* 小程序端会被转换为 .taro-scoped-index-{hash} .home, 正常生效 */
}
</style>
```

### webpack 编译模式

Taro webpack5 编译模式的项目通过 `webpackChain` 注入 loader（它会被追加到 `.vue` 规则 `use` 数组末尾，即最先执行，先于 vue-loader 拿到原始 SFC 源码）：

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
        // .options({ include: ..., classPrefix: ... }) —— 参数与 Vite 插件一致
    }
  }
}))
```

> 文件范围控制推荐直接用 webpack 规则自带的 `include` / `exclude`；loader options 也支持同名参数做二次过滤。若你的项目 chain 中 `.vue` 规则名不同，按实际规则名调整即可。
>
> 注意：项目中的 `webpack` 版本需与 `@tarojs/webpack5-runner` 依赖的版本一致（4.2.x 钉在 5.91.0）；webpack ≥5.99 的 ProgressPlugin schema 变更会导致 runner 自身构建报错（与本插件无关）。

## 参数与配置项

### 插件参数

| 参数                         | 类型                                                           | 默认值                                 | 说明                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `include`                  | `string \| Array<string \| RegExp> \| RegExp \| (id) => boolean` | `path.resolve(process.cwd(), 'src')` | 文件过滤器（字符串按路径前缀匹配）；非法条目会警告并跳过，全部非法时不处理任何文件                                   |
| `exclude`                  | 同`include`                                                  | 不排除                                 | 排除过滤器，优先级高于`include`                                                                                    |
| `classPrefix`              | `string`                                                     | `'taro-scoped'`                      | 包装类名前缀，最终类名形如`{prefix}-{fileName}-{hash}`；非法值（空/非 CSS 标识符）会警告并回退默认                 |
| `generateClassName`        | `(filePath: string) => string`                               | 内置规则                               | 完全定制包装类名，优先级高于`classPrefix`；抛错或返回非法类名时警告并回退内置规则                                  |
| `wrapperTag`               | `string`                                                     | `'view'`                             | 模板包装节点标签名；非法标签名会警告并回退`'view'`                                                                 |
| `transformPseudoSelectors` | `boolean`                                                    | `false`                              | 是否展开`:deep()` / `::v-deep` / `:slotted()` / `:global()` 为普通选择器；括号不配对的样式块会警告并保持原样 |

> webpack loader（`taro-vite-vue-scoped-adapter/webpack`）接受与上表完全一致的参数，通过 `use(...).options({ ... })` 传入。

### Taro 配置项

**Vite 编译模式**

| 配置项                   | 位置                | 说明                                                                 |
| ------------------------ | ------------------- | -------------------------------------------------------------------- |
| `compiler.type`        | `config/index.ts` | 必须为`'vite'`                                                     |
| `compiler.vitePlugins` | `config/index.ts` | Vite 插件数组；注意`compiler` 写成字符串 `'vite'` 时无法注入插件 |

**webpack5 编译模式**

| 配置项                | 位置                | 说明                                                                                                                                   |
| --------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `compiler`          | `config/index.ts` | 设为`'webpack5'`                                                                                                                     |
| `mini.webpackChain` | `config/index.ts` | 通过`chain.module.rule('vue').use(...).loader('taro-vite-vue-scoped-adapter/webpack')` 注入 loader（见[使用案例](#webpack-编译模式)） |

### 导出内容

| 导出                            | 形式           | 说明                                                                                                                |
| ------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------- |
| `default`                     | Vite 插件      | `taroViteVueScopedAdapter(options?)`                                                                              |
| `convertVueScoped`            | 命名导出       | 核心转换纯函数`(source, filePath, options?) => { code, changed, className? }`，打包工具无关，供其他打包器适配复用 |
| `wrapperClassNameFor`         | 命名导出       | 根据文件路径生成确定性包装类名，支持`classPrefix` 定制                                                            |
| `createMatcher`               | 命名导出       | 将`include`/`exclude` 过滤器归一化为判断函数                                                                    |
| `expandScopedPseudoSelectors` | 命名导出       | 展开`:deep()` 等 scoped 专有伪类为普通选择器                                                                      |
| `./webpack` 子路径            | webpack loader | `require()` 直接得到 loader 函数，用于注入 webpack 规则（见[使用案例](#webpack-编译模式)）                         |

### 错误处理策略

- **配置非法**（前缀/标签名/过滤器条目）：控制台明确警告原因与回退结果，构建不中断
- **样式块局部异常**（伪类括号不配对等）：警告并保持该块原样，其余正常转换
- **文件解析失败**：抛出带插件名、文件路径、具体原因的明确错误，由 Vite 在构建日志中直接展示

## 兼容性

| 项目     | 支持情况                                                                                                                                                                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite     | 4.0.0 及以上版本支持（5.x 已验证；6.0 及以上暂未验证）                                                                                                                                                                                                               |
| webpack  | 5.x（Taro webpack5 编译模式）；本项目以 5.91.0 端到端验证。注意：项目中的`webpack` 版本须与 `@tarojs/webpack5-runner` 依赖的版本一致（≥5.99 的 ProgressPlugin schema 变更会导致 runner 自身构建失败，与本插件无关）；webpack 4 编译模式（`webpack4`）暂不支持 |
| Taro     | 4.0 及以上版本；Vite 编译模式通过`compiler.vitePlugins` 注入，webpack5 编译模式通过 `./webpack` loader 子路径注入；3.x 暂不支持                                                                                                                                  |
| 框架     | 仅支持 Taro Vue3（`framework: 'vue3'`）；React 等其他框架不支持                                                                                                                                                                                                    |
| Vue 语法 | Vue 3 单文件组件（依赖`@vue/compiler-sfc`）；Vue 2 不支持                                                                                                                                                                                                          |
| 模块格式 | ESM 与 CommonJS 均支持（主入口与`./webpack` 子路径各产出 `.js` / `.cjs`），并附带 TypeScript 类型声明                                                                                                                                                          |
| Node.js  | 跟随你所用 Vite 版本的 Node 版本要求                                                                                                                                                                                                                                 |
| 样式语法 | 仅`lang="scss\|less"` 内联样式做内容包裹，其他语法见[已知限制](#已知限制)                                                                                                                                                                                            |

## 架构（多打包器支持）

```
src/
├── core.ts     # 核心转换: convertVueScoped(source, filePath, options?) —— 打包工具无关纯函数
├── vite.ts     # Vite 插件 (enforce: 'pre' transform)
├── webpack.ts  # webpack loader (先于 vue-loader 执行, 处理原始 SFC)
└── index.ts    # 入口: 默认导出 vite 插件 + 命名导出核心函数
```

核心模块不依赖任何打包器上下文，Vite 插件与 webpack loader 都是它的薄封装；后续新增 rollup 等其他打包器适配同样只需一层封装。

## 已知限制

- `:deep()` / `:slotted()` / `:global()` 等 `scoped` 专有伪类默认不做转换：包裹后整页样式已处于本文件作用域内，常规后代选择器即可覆盖绝大多数场景；确有需要可开启 `transformPseudoSelectors: true` 将其展开为普通选择器
- `lang="sass"`（缩进语法）与无 `lang`（纯 CSS）的 `scoped` 样式只移除 `scoped` 属性、不做内容嵌套：前者无法用大括号包裹，后者小程序对原生 CSS 嵌套支持不可控

## 本地开发

```bash
pnpm install        # 安装依赖（同时通过 simple-git-hooks 安装 git 钩子）
pnpm test           # 运行 vitest 全量用例
pnpm build          # 产出 dist/ (ESM + CJS + d.ts)
```

发布流程：由 [release-please](https://github.com/googleapis/release-please-action) 全自动完成——符合 conventional commit 规范的代码合并到 `main` 后，自动创建 Release PR（升版本号 + 生成 CHANGELOG）；合并该 PR 后自动打版本标签，由 GitHub Actions 跑测试并发布到 npm，全程无需本地执行命令。

## License

MIT
