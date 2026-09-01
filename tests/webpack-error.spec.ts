import { describe, expect, it, vi } from 'vitest'

// 模拟核心转换抛错, 验证 loader 不做静默兜底:
// 错误应原样抛给 webpack (信息含插件名 + 文件路径 + 原因), 呈现为编译错误
vi.mock('../src/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/core')>()
  return {
    ...actual,
    convertVueScoped: () => {
      throw new Error('[taro-vite-vue-scoped-adapter] failed to parse SFC "/project/src/pages/index.vue": mock boom')
    }
  }
})

import taroVueScopedLoader from '../src/webpack'

describe('webpack loader 转换失败时的报错', () => {
  it('直接抛出, 信息含插件名与文件路径', () => {
    const ctx = {
      resourcePath: '/project/src/pages/index.vue',
      getOptions: () => ({ include: '/project' })
    }
    expect(() => taroVueScopedLoader.call(ctx, 'whatever')).toThrow(/taro-vite-vue-scoped-adapter/)
    expect(() => taroVueScopedLoader.call(ctx, 'whatever')).toThrow('/project/src/pages/index.vue')
  })
})
