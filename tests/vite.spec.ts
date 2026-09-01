import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { wrapperClassNameFor } from '../src/core'
import taroViteVueScopedAdapter, { type TaroVueScopedAdapterOptions } from '../src/vite'

const SRC_ROOT = path.resolve(process.cwd(), 'src')
const PAGE_ID = path.join(SRC_ROOT, 'pages', 'index.vue')

const SFC = `<template>\n<view class="home">hi</view>\n</template>\n<style lang="scss" scoped>\n.home { color: red; }\n</style>\n`

/** 模拟 Vite 调用 transform 的上下文 (this), this.error 抛出便于断言 */
function callTransform(plugin: ReturnType<typeof taroViteVueScopedAdapter>, code: string, id: string) {
  const transform = (plugin as unknown as { transform: (code: string, id: string) => unknown }).transform
  const ctx = {
    error(message: string) {
      throw new Error(message)
    }
  }
  return transform.call(ctx, code, id) as { code: string; map: null } | null
}

function create(options: TaroVueScopedAdapterOptions = {}) {
  return taroViteVueScopedAdapter(options)
}

describe('Vite 插件基础行为', () => {
  it('插件元信息: name 与 enforce: pre', () => {
    const plugin = create()
    expect(plugin.name).toBe('taro-vite-vue-scoped-adapter')
    expect(plugin.enforce).toBe('pre')
  })

  it('非 .vue 文件直接放行', () => {
    expect(callTransform(create(), 'const a = 1', path.join(SRC_ROOT, 'utils/a.ts'))).toBeNull()
  })

  it('include 范围之外的 .vue 文件直接放行', () => {
    expect(callTransform(create(), SFC, '/other/project/pages/index.vue')).toBeNull()
  })

  it('默认 include 为 cwd/src, 命中文件被转换', () => {
    const result = callTransform(create(), SFC, PAGE_ID)
    expect(result).not.toBeNull()
    const cn = wrapperClassNameFor(PAGE_ID)
    expect(result!.code).toContain(`<view class="${cn}">`)
    expect(result!.code).toContain(`.${cn} {`)
    expect(result!.map).toBeNull()
  })

  it('无 scoped 样式的 .vue 文件返回 null (不产生无意义更新)', () => {
    const plain = `<template><view /></template>\n<style lang="scss">.a {}</style>\n`
    expect(callTransform(create(), plain, PAGE_ID)).toBeNull()
  })

  it('带 query 的模块 id 也能正确识别文件路径', () => {
    const result = callTransform(create(), SFC, `${PAGE_ID}?vue&type=style&index=0`)
    expect(result).not.toBeNull()
  })
})

describe('Vite 插件 include / exclude', () => {
  it('自定义 include 字符串前缀', () => {
    const plugin = create({ include: '/project/src' })
    expect(callTransform(plugin, SFC, '/project/src/pages/index.vue')).not.toBeNull()
    expect(callTransform(plugin, SFC, '/workspace/src/pages/index.vue')).toBeNull()
  })

  it('include 正则', () => {
    const plugin = create({ include: /\/project\/src\/.*\.vue$/ })
    expect(callTransform(plugin, SFC, '/project/src/pages/index.vue')).not.toBeNull()
    expect(callTransform(plugin, SFC, '/project/lib/pages/index.vue')).toBeNull()
  })

  it('exclude 优先级高于 include', () => {
    const plugin = create({ include: SRC_ROOT, exclude: /pages\/index\.vue$/ })
    expect(callTransform(plugin, SFC, PAGE_ID)).toBeNull()
    expect(callTransform(plugin, SFC, path.join(SRC_ROOT, 'pages', 'login.vue'))).not.toBeNull()
  })

  it('exclude 函数形式', () => {
    const plugin = create({ include: SRC_ROOT, exclude: (id: string) => id.includes('index.vue') })
    expect(callTransform(plugin, SFC, PAGE_ID)).toBeNull()
    expect(callTransform(plugin, SFC, path.join(SRC_ROOT, 'pages', 'login.vue'))).not.toBeNull()
  })
})

describe('Vite 插件选项透传', () => {
  it('classPrefix 透传到转换结果', () => {
    const plugin = create({ classPrefix: 'myapp' })
    const result = callTransform(plugin, SFC, PAGE_ID)
    expect(result!.code).toContain('.myapp-index-')
    expect(result!.code).not.toContain('.taro-scoped-index-')
  })

  it('wrapperTag 透传到转换结果', () => {
    const plugin = create({ wrapperTag: 'cover-view' })
    const result = callTransform(plugin, SFC, PAGE_ID)
    expect(result!.code).toContain('<cover-view class=')
    expect(result!.code).toContain('</cover-view>')
  })

  it('generateClassName 透传到转换结果', () => {
    const plugin = create({ generateClassName: () => 'pageScope' })
    const result = callTransform(plugin, SFC, PAGE_ID)
    expect(result!.code).toContain('<view class="pageScope">')
    expect(result!.code).toContain('.pageScope {')
  })

  it('transformPseudoSelectors 透传到转换结果', () => {
    const sfc = `<template><view /></template>\n<style lang="scss" scoped>.a :deep(.b) {}</style>\n`
    const plugin = create({ transformPseudoSelectors: true })
    const result = callTransform(plugin, sfc, PAGE_ID)
    expect(result!.code).toContain('.a .b {}')
    expect(result!.code).not.toContain(':deep')
  })
})

describe('Vite 插件平台开关', () => {
  // H5 端原生 scoped 即可生效, 且转换会破坏 HMR 块级更新粒度 (样式丢失), 必须跳过
  it('TARO_PLATFORM=web (H5) 时不转换', () => {
    process.env.TARO_PLATFORM = 'web'
    try {
      const plugin = create()
      expect(callTransform(plugin, SFC, PAGE_ID)).toBeNull()
    } finally {
      delete process.env.TARO_PLATFORM
    }
  })

  it('小程序端 (TARO_PLATFORM=mini) 正常转换', () => {
    process.env.TARO_PLATFORM = 'mini'
    try {
      const plugin = create()
      const result = callTransform(plugin, SFC, PAGE_ID)
      expect(result!.code).toContain('taro-scoped-index-')
    } finally {
      delete process.env.TARO_PLATFORM
    }
  })
})
