import path from 'node:path'

import { convertVueScoped, createMatcher, type ConvertOptions, type FilterPattern } from './core'

export interface TaroWebpackScopedLoaderOptions extends ConvertOptions {
  /**
   * 要处理的 .vue 文件过滤器, 形式同 Vite 插件 (字符串/数组/正则/函数)。
   * 默认 `path.resolve(process.cwd(), 'src')`
   */
  include?: FilterPattern
  /** 排除过滤器, 形式同 include; 命中则不转换 (优先级高于 include) */
  exclude?: FilterPattern
}

/** webpack loader 上下文的最小子集 (不引入完整 webpack 类型依赖) */
interface LoaderContext {
  resourcePath: string
  /** webpack 5 提供; 返回 rules 中配置的 options */
  getOptions?: () => TaroWebpackScopedLoaderOptions | undefined
  /** webpack 4 / inline loader 的选项载体 (对象形式) */
  query?: TaroWebpackScopedLoaderOptions | string
}

/** options 对象 → 归一化后的匹配器缓存, 避免每个模块重复构建 */
const matcherCache = new WeakMap<
  TaroWebpackScopedLoaderOptions,
  { isInclude: (id: string) => boolean; isExclude: (id: string) => boolean }
>()

function resolveMatchers(options: TaroWebpackScopedLoaderOptions) {
  let cached = matcherCache.get(options)
  if (!cached) {
    cached = {
      isInclude: createMatcher(options.include ?? path.resolve(process.cwd(), 'src'), 'include'),
      isExclude: createMatcher(options.exclude, 'exclude')
    }
    matcherCache.set(options, cached)
  }
  return cached
}

function readOptions(ctx: LoaderContext): TaroWebpackScopedLoaderOptions {
  if (typeof ctx.getOptions === 'function') {
    return ctx.getOptions() ?? {}
  }
  // webpack 4 等无 getOptions 的环境: 仅支持对象形式的 query
  return typeof ctx.query === 'object' && ctx.query !== null ? ctx.query : {}
}

/**
 * webpack loader 入口 (default export)。
 * CJS 产物经构建互操作处理, `require('taro-vite-vue-scoped-adapter/webpack')`
 * 直接得到本函数, 符合 webpack 对 loader 模块的要求。
 * 转换失败直接抛出 (错误信息含插件名/文件路径/原因), 由 webpack 呈现为编译错误。
 */
export default function taroVueScopedLoader(this: LoaderContext, source: string): string {
  // H5 端是真实 DOM, Vue 原生 scoped (data-v) 本就生效, 无需转换;
  // 且转换会破坏 HMR 的块级更新粒度 (热更新后样式丢失),
  // 与 Vite 插件保持一致: 仅在小程序端 (TARO_PLATFORM !== 'web') 执行转换
  if (process.env.TARO_PLATFORM === 'web') return source

  const options = readOptions(this)
  const filePath = this.resourcePath
  const { isInclude, isExclude } = resolveMatchers(options)

  if (!filePath.endsWith('.vue') || !isInclude(filePath) || isExclude(filePath)) {
    return source
  }

  // 仅透传核心关心的字段, 避免 include/exclude 误入核心层
  const convertOptions: ConvertOptions = {
    classPrefix: options.classPrefix,
    generateClassName: options.generateClassName,
    wrapperTag: options.wrapperTag,
    transformPseudoSelectors: options.transformPseudoSelectors
  }
  const result = convertVueScoped(source, filePath, convertOptions)
  return result.changed ? result.code : source
}
