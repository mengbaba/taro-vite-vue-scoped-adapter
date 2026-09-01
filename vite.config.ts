import { defineConfig, type Plugin } from 'vite'
import dts from 'vite-plugin-dts'

/**
 * CJS 互操作: 入口同时有默认导出 (插件工厂) 与命名导出,
 * Rollup 产出的 CJS 默认是 `module.exports = { default, ... }` 命名空间,
 * 导致 `require('taro-vite-vue-scoped-adapter')` 拿到对象而非可调用函数。
 * 此处把默认导出提升为 module.exports 本身, 命名导出挂载其上:
 * - require() 直接得到可调用的插件工厂
 * - require().convertVueScoped 等命名导出照常可用
 * 仅处理 .cjs 产物, ESM 产物不受影响
 */
function cjsDefaultInterop(): Plugin {
  return {
    name: 'taro-vite-vue-scoped-adapter:cjs-interop',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk' && file.isEntry && file.fileName.endsWith('.cjs')) {
          file.code += '\nmodule.exports = Object.assign(module.exports.default, module.exports)\n'
        }
      }
    }
  }
}

// lib 模式构建: 双入口 (index = Vite 插件, webpack = webpack loader),
// 各自产出 ESM (*.js) 与 CJS (*.cjs), 并生成类型声明
export default defineConfig({
  plugins: [dts({ include: ['src'] }), cjsDefaultInterop()],
  build: {
    lib: {
      entry: ['src/index.ts', 'src/webpack.ts'],
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'js' : 'cjs'}`
    },
    rollupOptions: {
      // 运行时依赖与 Node 内置模块不打进产物
      external: ['@vue/compiler-sfc', /^node:/],
      output: {
        // 混用默认+命名导出时明确声明导出形式, 消除 Rollup 警告;
        // CJS 的可调用性问题由 cjsDefaultInterop 兜底解决
        exports: 'named'
      }
    }
  }
})
