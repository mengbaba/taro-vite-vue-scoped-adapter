import { describe, expect, it, vi } from 'vitest'

// 模拟核心转换抛错, 验证插件层的错误拦截:
// 报错必须带插件名 + 文件路径 + 原因, 而不是静默吞掉导致样式无声失效
vi.mock('../src/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/core')>()
  return {
    ...actual,
    convertVueScoped: () => {
      throw new Error('mock parse boom')
    }
  }
})

import taroViteVueScopedAdapter from '../src/vite'

describe('Vite 插件转换失败时的报错', () => {
  it('通过 this.error 抛出, 信息含插件名与文件路径', () => {
    const plugin = taroViteVueScopedAdapter({ include: '/project' }) as unknown as {
      transform: (code: string, id: string) => unknown
    }
    const id = '/project/src/pages/index.vue'
    const ctx = {
      error(message: string) {
        throw new Error(message)
      }
    }
    expect(() => plugin.transform.call(ctx, 'whatever', id)).toThrow(/taro-vite-vue-scoped-adapter/)
    expect(() => plugin.transform.call(ctx, 'whatever', id)).toThrow(id)
    expect(() => plugin.transform.call(ctx, 'whatever', id)).toThrow('mock parse boom')
  })
})
