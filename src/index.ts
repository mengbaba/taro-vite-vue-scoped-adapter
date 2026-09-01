// 默认导出为 Vite 插件; 核心转换函数以命名导出提供,
// 供后续 webpack / rollup 等其他打包器的适配层复用
export { default } from './vite'
export type { TaroVueScopedAdapterOptions } from './vite'
export { convertVueScoped, wrapperClassNameFor, createMatcher, expandScopedPseudoSelectors } from './core'
export type { ConvertOptions, ConvertResult, FilterPattern } from './core'
