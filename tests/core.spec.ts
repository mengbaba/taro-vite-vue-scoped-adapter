import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  convertVueScoped,
  createMatcher,
  expandScopedPseudoSelectors,
  wrapperClassNameFor
} from '../src/core'

const FILE_PATH = '/project/src/pages/index.vue'

const BASIC_SFC = `<template>
  <view class="home">hello</view>
</template>

<script setup lang="ts">
const a = 1
</script>

<style lang="scss" scoped>
.home { padding: 24px; }
</style>
`

afterEach(() => {
  vi.restoreAllMocks()
})

/** 静默并收集 console.warn, 用于断言兜底警告 */
function spyWarn() {
  return vi.spyOn(console, 'warn').mockImplementation(() => {})
}

// ============================================================
// wrapperClassNameFor: 确定性类名生成
// ============================================================
describe('wrapperClassNameFor', () => {
  it('同一文件路径多次生成结果一致 (确定性)', () => {
    const a = wrapperClassNameFor(FILE_PATH)
    const b = wrapperClassNameFor(FILE_PATH)
    expect(a).toBe(b)
    expect(a).toMatch(/^taro-scoped-index-[a-f0-9]{6}$/)
  })

  it('不同文件路径生成不同类名', () => {
    expect(wrapperClassNameFor('/project/src/pages/index.vue')).not.toBe(
      wrapperClassNameFor('/project/src/pages/login.vue')
    )
  })

  it('classPrefix 定制生效', () => {
    expect(wrapperClassNameFor(FILE_PATH, { classPrefix: 'myapp' })).toMatch(/^myapp-index-[a-f0-9]{6}$/)
  })

  it.each([[''], ['1abc'], ['a b'], ['中文']])('非法 classPrefix %j 警告并回退默认', (bad) => {
    const warn = spyWarn()
    const name = wrapperClassNameFor(FILE_PATH, { classPrefix: bad })
    expect(name).toMatch(/^taro-scoped-index-[a-f0-9]{6}$/)
    expect(warn).toHaveBeenCalled()
  })
})

// ============================================================
// createMatcher: include / exclude 过滤器归一化
// ============================================================
describe('createMatcher', () => {
  it('undefined: include 默认全放行, exclude 默认不排除', () => {
    expect(createMatcher(undefined, 'include')('anything')).toBe(true)
    expect(createMatcher(undefined, 'exclude')('anything')).toBe(false)
  })

  it('字符串按包含匹配', () => {
    const match = createMatcher('/src/pages', 'include')
    expect(match('/project/src/pages/index.vue')).toBe(true)
    expect(match('/project/src/components/x.vue')).toBe(false)
  })

  it('正则匹配', () => {
    const match = createMatcher(/pages\/.*\.vue$/, 'include')
    expect(match('/project/src/pages/index.vue')).toBe(true)
    expect(match('/project/src/components/x.vue')).toBe(false)
  })

  it('自定义函数', () => {
    const match = createMatcher((id) => id.endsWith('.vue'), 'include')
    expect(match('/a/b.vue')).toBe(true)
    expect(match('/a/b.ts')).toBe(false)
  })

  it('数组任一命中即可 (混合字符串/正则)', () => {
    const match = createMatcher(['/src/pages', /components/], 'include')
    expect(match('/x/src/pages/a.vue')).toBe(true)
    expect(match('/x/src/components/b.vue')).toBe(true)
    expect(match('/x/src/utils/c.vue')).toBe(false)
  })

  it('自定义函数抛错时按未命中处理并警告', () => {
    const warn = spyWarn()
    const match = createMatcher(() => {
      throw new Error('boom')
    }, 'include')
    expect(match('/a.vue')).toBe(false)
    expect(warn).toHaveBeenCalled()
  })

  it('非法条目跳过并警告, 合法条目仍生效', () => {
    const warn = spyWarn()
    const match = createMatcher([123 as unknown as string, '/src/pages'], 'include')
    expect(match('/project/src/pages/index.vue')).toBe(true)
    expect(warn).toHaveBeenCalled()
  })

  it('include 全部非法时不处理任何文件', () => {
    const warn = spyWarn()
    const match = createMatcher([123, null] as unknown as string[], 'include')
    expect(match('/project/src/pages/index.vue')).toBe(false)
    expect(warn).toHaveBeenCalled()
  })

  it('exclude 全部非法时不排除任何文件', () => {
    const warn = spyWarn()
    const match = createMatcher([{}] as unknown as string[], 'exclude')
    expect(match('/project/src/pages/index.vue')).toBe(true)
    expect(warn).toHaveBeenCalled()
  })
})

// ============================================================
// expandScopedPseudoSelectors: 伪类展开
// ============================================================
describe('expandScopedPseudoSelectors', () => {
  it('展开 :deep()', () => {
    expect(expandScopedPseudoSelectors('.a :deep(.b) { color: red; }', FILE_PATH)).toBe(
      '.a .b { color: red; }'
    )
  })

  it('正确处理嵌套括号 :deep(.a:not(.b))', () => {
    expect(expandScopedPseudoSelectors(':deep(.a:not(.b)) {}', FILE_PATH)).toBe('.a:not(.b) {}')
  })

  it('展开 ::v-deep / :slotted / :global 及变体', () => {
    expect(expandScopedPseudoSelectors('::v-deep(.x) {}', FILE_PATH)).toBe('.x {}')
    expect(expandScopedPseudoSelectors(':slotted(.s) {}', FILE_PATH)).toBe('.s {}')
    expect(expandScopedPseudoSelectors('::v-slotted(.s) {}', FILE_PATH)).toBe('.s {}')
    expect(expandScopedPseudoSelectors(':global(.g) {}', FILE_PATH)).toBe('.g {}')
    expect(expandScopedPseudoSelectors('::v-global(.g) {}', FILE_PATH)).toBe('.g {}')
  })

  it('同一段出现多个伪类全部展开', () => {
    expect(expandScopedPseudoSelectors(':deep(.b), :global(.g) {}', FILE_PATH)).toBe('.b, .g {}')
  })

  it('不带括号的相似文本不误伤 (:deeply / :deep 裸写)', () => {
    expect(expandScopedPseudoSelectors('.deeply { color: red; }', FILE_PATH)).toBe('.deeply { color: red; }')
    expect(expandScopedPseudoSelectors('/* :deep */ .a {}', FILE_PATH)).toBe('/* :deep */ .a {}')
  })

  it('括号不配对时保持原样并警告', () => {
    const warn = spyWarn()
    const css = '.a :deep(.b { color: red; }'
    expect(expandScopedPseudoSelectors(css, FILE_PATH)).toBe(css)
    expect(warn).toHaveBeenCalled()
  })
})

// ============================================================
// convertVueScoped: 基础转换
// ============================================================
describe('convertVueScoped 基础转换', () => {
  it('模板包根节点 + 样式嵌套 + 移除 scoped 属性', () => {
    const result = convertVueScoped(BASIC_SFC, FILE_PATH)
    const cn = wrapperClassNameFor(FILE_PATH)

    expect(result.changed).toBe(true)
    expect(result.className).toBe(cn)
    // 模板首尾插入包装节点
    expect(result.code).toContain(`<template>\n<view class="${cn}">`)
    expect(result.code).toContain(`</view>\n</template>`)
    // 样式内容嵌套进包装选择器
    expect(result.code).toContain(`.${cn} {`)
    expect(result.code).toContain('.home { padding: 24px; }')
    // scoped 属性被移除, lang 保留
    expect(result.code).toContain('<style lang="scss">')
    expect(result.code).not.toMatch(/<style[^>]*scoped/)
    // script 块原样保留
    expect(result.code).toContain('const a = 1')
  })

  it('类名由文件路径确定性生成, 与转换结果一致', () => {
    const r1 = convertVueScoped(BASIC_SFC, FILE_PATH)
    const r2 = convertVueScoped(BASIC_SFC, FILE_PATH)
    expect(r1.className).toBe(r2.className)
    expect(r1.code).toBe(r2.code)
  })

  it('无 scoped 样式的文件不转换', () => {
    const sfc = `<template><view /></template>\n<style lang="scss">.a {}</style>\n`
    const result = convertVueScoped(sfc, FILE_PATH)
    expect(result.changed).toBe(false)
    expect(result.code).toBe(sfc)
    expect(result.className).toBeUndefined()
  })

  it('无 template 的文件不转换', () => {
    const sfc = `<style lang="scss" scoped>.a {}</style>\n`
    const result = convertVueScoped(sfc, FILE_PATH)
    expect(result.changed).toBe(false)
    expect(result.code).toBe(sfc)
  })

  it('幂等: 转换结果再次转换不再变化', () => {
    const once = convertVueScoped(BASIC_SFC, FILE_PATH)
    const twice = convertVueScoped(once.code, FILE_PATH)
    expect(twice.changed).toBe(false)
    expect(twice.code).toBe(once.code)
  })

  it('模板中已含目标类名时不重复插入包装节点', () => {
    const cn = wrapperClassNameFor(FILE_PATH)
    const sfc = `<template>\n<view class="${cn}">already</view>\n</template>\n<style lang="scss" scoped>.a {}</style>\n`
    const result = convertVueScoped(sfc, FILE_PATH)
    expect(result.changed).toBe(true)
    // 包装节点只出现一次 (模板里原有的那个), 样式包裹不算节点
    expect(result.code.match(/<view class="[^"]*"/g)?.length).toBe(1)
  })

  it('多个 scoped 样式块全部嵌套', () => {
    const cn = wrapperClassNameFor(FILE_PATH)
    const sfc = `<template><view /></template>
<style lang="scss" scoped>.a {}</style>
<style lang="less" scoped>.b {}</style>
`
    const result = convertVueScoped(sfc, FILE_PATH)
    expect(result.code.split(`.${cn} {`).length - 1).toBe(2)
    expect(result.code).not.toMatch(/<style[^>]*scoped/)
  })

  it('非 scoped 样式块原样保留', () => {
    const sfc = `<template><view /></template>
<style lang="scss" scoped>.a {}</style>
<style lang="scss">.global {}</style>
`
    const result = convertVueScoped(sfc, FILE_PATH)
    expect(result.code).toContain('<style lang="scss">.global {}</style>')
    // 只有 scoped 块被嵌套 (包装选择器仅出现一次), 全局块未被嵌套
    const cn = wrapperClassNameFor(FILE_PATH)
    expect(result.code.split(`.${cn} {`).length - 1).toBe(1)
  })

  it('scoped="true" 写法也能移除属性', () => {
    const sfc = `<template><view /></template>\n<style lang="scss" scoped="true">.a {}</style>\n`
    const result = convertVueScoped(sfc, FILE_PATH)
    expect(result.code).toContain('<style lang="scss">')
    expect(result.code).not.toMatch(/<style[^>]*scoped/)
  })
})

// ============================================================
// convertVueScoped: 样式语法边界
// ============================================================
describe('convertVueScoped 样式语法边界', () => {
  it('纯 CSS (无 lang) 只移除 scoped, 不做内容包裹', () => {
    const sfc = `<template><view /></template>\n<style scoped>.a { color: red; }</style>\n`
    const result = convertVueScoped(sfc, FILE_PATH)
    expect(result.changed).toBe(true)
    expect(result.code).toContain('<style>.a { color: red; }</style>')
    expect(result.code).not.toMatch(/<style[^>]*scoped/)
    // 未包裹
    expect(result.code).not.toMatch(/\.taro-scoped-index-[a-f0-9]{6} \{/)
  })

  it('lang="sass" 只移除 scoped, 不做内容包裹', () => {
    const sfc = `<template><view /></template>\n<style lang="sass" scoped>.a\n  color: red</style>\n`
    const result = convertVueScoped(sfc, FILE_PATH)
    expect(result.changed).toBe(true)
    expect(result.code).toContain('<style lang="sass">')
    expect(result.code).not.toMatch(/<style[^>]*scoped/)
  })

  it('空内容的 scoped 样式块被 @vue/compiler-sfc 忽略, 整体不参与转换', () => {
    const sfc = `<template><view /></template>\n<style lang="scss" scoped></style>\n`
    const result = convertVueScoped(sfc, FILE_PATH)
    expect(result.changed).toBe(false)
    expect(result.code).toBe(sfc)
  })

  it('src 引入的外部样式只移除属性, 不包裹内容', () => {
    const cn = wrapperClassNameFor(FILE_PATH)
    const sfc = `<template><view /></template>\n<style lang="scss" scoped src="./x.scss"></style>\n`
    const result = convertVueScoped(sfc, FILE_PATH)
    expect(result.changed).toBe(true)
    expect(result.code).toContain('<style lang="scss" src="./x.scss"></style>')
    expect(result.code).not.toContain(`.${cn} {`)
  })
})

// ============================================================
// convertVueScoped: 参数定制
// ============================================================
describe('convertVueScoped 参数定制', () => {
  it('classPrefix 生效于类名与产物', () => {
    const result = convertVueScoped(BASIC_SFC, FILE_PATH, { classPrefix: 'myapp' })
    expect(result.className).toMatch(/^myapp-index-[a-f0-9]{6}$/)
    expect(result.code).toContain(`<view class="${result.className}">`)
    expect(result.code).toContain(`.${result.className} {`)
  })

  it('generateClassName 优先于 classPrefix', () => {
    const result = convertVueScoped(BASIC_SFC, FILE_PATH, {
      classPrefix: 'ignored',
      generateClassName: () => 'customScope'
    })
    expect(result.className).toBe('customScope')
    expect(result.code).toContain('<view class="customScope">')
  })

  it('generateClassName 抛错时回退内置规则并警告', () => {
    const warn = spyWarn()
    const result = convertVueScoped(BASIC_SFC, FILE_PATH, {
      generateClassName: () => {
        throw new Error('oops')
      }
    })
    expect(result.className).toMatch(/^taro-scoped-index-[a-f0-9]{6}$/)
    expect(warn).toHaveBeenCalled()
  })

  it('generateClassName 返回非法类名时回退内置规则并警告', () => {
    const warn = spyWarn()
    const result = convertVueScoped(BASIC_SFC, FILE_PATH, {
      generateClassName: () => '123 bad name'
    })
    expect(result.className).toMatch(/^taro-scoped-index-[a-f0-9]{6}$/)
    expect(warn).toHaveBeenCalled()
  })

  it('wrapperTag 定制生效', () => {
    const result = convertVueScoped(BASIC_SFC, FILE_PATH, { wrapperTag: 'cover-view' })
    expect(result.code).toContain(`<cover-view class="${result.className}">`)
    expect(result.code).toContain('</cover-view>')
  })

  it('非法 wrapperTag 回退 view 并警告', () => {
    const warn = spyWarn()
    const result = convertVueScoped(BASIC_SFC, FILE_PATH, { wrapperTag: 'view onclick=x' })
    expect(result.code).toContain(`<view class="${result.className}">`)
    expect(warn).toHaveBeenCalled()
  })

  it('transformPseudoSelectors 默认 false: :deep 保留原样', () => {
    const sfc = `<template><view /></template>\n<style lang="scss" scoped>.a :deep(.b) {}</style>\n`
    const result = convertVueScoped(sfc, FILE_PATH)
    expect(result.code).toContain(':deep(.b)')
  })

  it('transformPseudoSelectors=true: :deep 展开为普通选择器', () => {
    const sfc = `<template><view /></template>\n<style lang="scss" scoped>.a :deep(.b) {}</style>\n`
    const result = convertVueScoped(sfc, FILE_PATH, { transformPseudoSelectors: true })
    expect(result.code).not.toContain(':deep')
    expect(result.code).toContain('.a .b {}')
  })

  it('transformPseudoSelectors=true 遇到括号不配对: 该块保持原样并警告', () => {
    const warn = spyWarn()
    const cn = wrapperClassNameFor(FILE_PATH)
    const sfc = `<template><view /></template>\n<style lang="scss" scoped>.a :deep(.b {}</style>\n`
    const result = convertVueScoped(sfc, FILE_PATH, { transformPseudoSelectors: true })
    // 内容原样 (含 :deep 文本) 但仍被嵌套包裹, scoped 仍被移除
    expect(result.code).toContain(`.${cn} {`)
    expect(result.code).toContain(':deep(.b {}')
    expect(result.code).not.toMatch(/<style[^>]*scoped/)
    expect(warn).toHaveBeenCalled()
  })
})
