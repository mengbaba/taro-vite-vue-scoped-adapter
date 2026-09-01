import path from 'node:path'

import type { Plugin } from 'vite'

import { convertVueScoped, createMatcher, type ConvertOptions, type FilterPattern } from './core'

export interface TaroVueScopedAdapterOptions extends ConvertOptions {
  /**
   * 要处理的 .vue 文件过滤器, 支持路径前缀字符串 / 数组 / 正则 / 函数。
   * 默认 `path.resolve(process.cwd(), 'src')`
   */
  include?: FilterPattern
  /**
   * 排除过滤器, 形式同 include; 命中则不转换 (优先级高于 include)。
   * 默认不排除
   */
  exclude?: FilterPattern
}

/**
 * Vite 插件: 修复 Taro + Vue3 编译小程序时 <style scoped> 失效的问题。
 * 核心逻辑见 `convertVueScoped` (打包工具无关, 可复用于其他打包器适配)。
 *
 * 用法 (Taro 配置):
 * ```ts
 * compiler: {
 *   type: 'vite',
 *   vitePlugins: [taroViteVueScopedAdapter({ include: path.resolve(__dirname, '../src') })]
 * }
 * ```
 */
export default function taroViteVueScopedAdapter(options: TaroVueScopedAdapterOptions = {}): Plugin {
  // 过滤器在插件创建期归一化一次, 非法值由 createMatcher 内部警告并兜底
  const isInclude = createMatcher(options.include ?? path.resolve(process.cwd(), 'src'), 'include')
  const isExclude = createMatcher(options.exclude, 'exclude')

  // 转换选项只透传核心关心的字段, 避免 include/exclude 误入核心层
  const convertOptions: ConvertOptions = {
    classPrefix: options.classPrefix,
    generateClassName: options.generateClassName,
    wrapperTag: options.wrapperTag,
    transformPseudoSelectors: options.transformPseudoSelectors
  }

  return {
    name: 'taro-vite-vue-scoped-adapter',
    // 必须 pre: 要在 @vitejs/plugin-vue 解析 SFC 之前改写源码
    enforce: 'pre',
    transform(code, id) {
      // H5 端是真实 DOM, Vue 原生 scoped (data-v) 本就生效, 无需转换;
      // 且本插件同时改写模板与样式, 会破坏 Vite HMR 的块级更新粒度
      // (热更新时模板渲染函数与样式不同步刷新, 导致包装类与选择器错配、样式丢失),
      // 故仅在小程序端 (TARO_PLATFORM !== 'web') 执行转换
      if (process.env.TARO_PLATFORM === 'web') return null
      const filePath = id.split('?')[0]
      if (!filePath.endsWith('.vue') || !isInclude(filePath) || isExclude(filePath)) return null
      try {
        const result = convertVueScoped(code, filePath, convertOptions)
        if (!result.changed) return null
        return { code: result.code, map: null }
      } catch (err) {
        // 明确抛出: 哪个插件、哪个文件、什么原因 —— 便于用户直接定位, 而不是静默样式失效
        this.error(
          `[taro-vite-vue-scoped-adapter] transform failed for "${filePath}": ${(err as Error).message}`
        )
      }
    }
  }
}
