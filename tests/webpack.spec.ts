import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { wrapperClassNameFor } from '../src/core'
import taroVueScopedLoader, { type TaroWebpackScopedLoaderOptions } from '../src/webpack'

const SRC_ROOT = path.resolve(process.cwd(), 'src')
const PAGE_PATH = path.join(SRC_ROOT, 'pages', 'index.vue')

const SFC = `<template>\n<view class="home">hi</view>\n</template>\n<style lang="scss" scoped>\n.home { color: red; }\n</style>\n`

interface FakeContext {
  resourcePath: string
  getOptions?: () => TaroWebpackScopedLoaderOptions | undefined
  query?: TaroWebpackScopedLoaderOptions | string
}

/** 模拟 webpack 5 调用: this = loader 上下文 (getOptions 返回 rules 中的 options) */
function callViaGetOptions(resourcePath: string, source: string, options?: TaroWebpackScopedLoaderOptions) {
  const ctx: FakeContext = { resourcePath, getOptions: () => options }
  return taroVueScopedLoader.call(ctx, source)
}

/** 模拟 webpack 4 / 无 getOptions 环境: options 走对象形式的 query */
function callViaQuery(resourcePath: string, source: string, query: FakeContext['query']) {
  const ctx: FakeContext = { resourcePath, query }
  return taroVueScopedLoader.call(ctx, source)
}

describe('webpack loader 基础行为', () => {
  it('命中文件被转换 (默认 include = cwd/src)', () => {
    const out = callViaGetOptions(PAGE_PATH, SFC)
    const cn = wrapperClassNameFor(PAGE_PATH)
    expect(out).toContain(`<view class="${cn}">`)
    expect(out).toContain(`.${cn} {`)
    expect(out).not.toMatch(/<style[^>]*scoped/)
  })

  it('无 scoped 样式的文件原样返回 (同一字符串)', () => {
    const plain = `<template><view /></template>\n<style lang="scss">.a {}</style>\n`
    expect(callViaGetOptions(PAGE_PATH, plain)).toBe(plain)
  })

  it('非 .vue 文件原样返回', () => {
    expect(callViaGetOptions(path.join(SRC_ROOT, 'utils/a.ts'), 'const a = 1')).toBe('const a = 1')
  })

  it('include 范围之外的文件原样返回', () => {
    expect(callViaGetOptions('/other/project/pages/index.vue', SFC)).toBe(SFC)
  })

  it('getOptions 返回 undefined 时按默认选项处理', () => {
    const out = callViaGetOptions(PAGE_PATH, SFC)
    expect(out).toContain(`<view class="${wrapperClassNameFor(PAGE_PATH)}">`)
  })
})

describe('webpack loader options', () => {
  it('自定义 include (字符串/正则)', () => {
    expect(callViaGetOptions('/project/src/a.vue', SFC, { include: '/project/src' })).not.toBe(SFC)
    expect(callViaGetOptions('/workspace/src/a.vue', SFC, { include: '/project/src' })).toBe(SFC)
    expect(callViaGetOptions('/project/src/a.vue', SFC, { include: /\/project\/src\// })).not.toBe(SFC)
  })

  it('exclude 优先级高于 include', () => {
    const options: TaroWebpackScopedLoaderOptions = { include: SRC_ROOT, exclude: /index\.vue$/ }
    expect(callViaGetOptions(PAGE_PATH, SFC, options)).toBe(SFC)
    expect(callViaGetOptions(path.join(SRC_ROOT, 'pages', 'login.vue'), SFC, options)).not.toBe(SFC)
  })

  it('classPrefix / wrapperTag / generateClassName / transformPseudoSelectors 透传', () => {
    expect(callViaGetOptions(PAGE_PATH, SFC, { classPrefix: 'myapp' })).toContain('.myapp-index-')
    expect(callViaGetOptions(PAGE_PATH, SFC, { wrapperTag: 'cover-view' })).toContain('<cover-view class=')
    expect(callViaGetOptions(PAGE_PATH, SFC, { generateClassName: () => 'pageScope' })).toContain(
      '<view class="pageScope">'
    )
    const deepSfc = `<template><view /></template>\n<style lang="scss" scoped>.a :deep(.b) {}</style>\n`
    expect(callViaGetOptions(PAGE_PATH, deepSfc, { transformPseudoSelectors: true })).toContain('.a .b {}')
  })

  it('无 getOptions 时回退到对象形式 query (webpack 4 兼容)', () => {
    const out = callViaQuery(PAGE_PATH, SFC, { classPrefix: 'w4' })
    expect(out).toContain('.w4-index-')
  })

  it('字符串形式的 query 视为无选项 (不崩溃)', () => {
    const out = callViaQuery(PAGE_PATH, SFC, '?classPrefix=x')
    expect(out).toContain(`<view class="${wrapperClassNameFor(PAGE_PATH)}">`)
  })
})
