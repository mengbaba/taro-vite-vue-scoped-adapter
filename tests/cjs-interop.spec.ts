import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// CJS 互操作回归测试 (针对构建产物, 需先执行 pnpm build; 未构建时跳过):
// require() 必须直接拿到可调用的插件工厂, 命名导出挂载其上

const distCjs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/index.cjs')
const distWebpackCjs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/webpack.cjs')
const requireDist = createRequire(import.meta.url)

describe.skipIf(!fs.existsSync(distCjs) || !fs.existsSync(distWebpackCjs))('CJS 产物互操作 (dist)', () => {
  it('require() 直接得到可调用的插件工厂', () => {
    const plugin = requireDist(distCjs)
    expect(typeof plugin).toBe('function')
    const instance = plugin()
    expect(instance.name).toBe('taro-vite-vue-scoped-adapter')
    expect(instance.enforce).toBe('pre')
  })

  it('命名导出挂载在工厂函数上', () => {
    const mod = requireDist(distCjs)
    expect(typeof mod.convertVueScoped).toBe('function')
    expect(typeof mod.wrapperClassNameFor).toBe('function')
    expect(typeof mod.createMatcher).toBe('function')
    expect(typeof mod.expandScopedPseudoSelectors).toBe('function')
    // default 属性保留 (兼容 require().default 写法)
    expect(mod.default).toBe(mod)
  })

  it('require().convertVueScoped 功能可用', () => {
    const { convertVueScoped } = requireDist(distCjs)
    const sfc = `<template>\n<view class="a">x</view>\n</template>\n<style lang="scss" scoped>\n.a {}\n</style>\n`
    const result = convertVueScoped(sfc, '/project/src/pages/t.vue')
    expect(result.changed).toBe(true)
    expect(result.code).toContain(`<view class="${result.className}">`)
  })

  it('webpack loader 产物: require() 直接得到 loader 函数 (module.exports 即函数)', () => {
    const loader = requireDist(distWebpackCjs)
    expect(typeof loader).toBe('function')
    // 模拟 webpack 调用, 验证产物在真实消费路径下可工作
    const ctx = {
      resourcePath: path.resolve(process.cwd(), 'src/pages/t.vue'),
      getOptions: () => ({})
    }
    const sfc = `<template>\n<view class="a">x</view>\n</template>\n<style lang="scss" scoped>\n.a {}\n</style>\n`
    const out = loader.call(ctx, sfc)
    expect(out).toContain('<view class="taro-scoped-t-')
    expect(loader.default).toBe(loader)
  })
})
