import { parse } from '@vue/compiler-sfc'

// ============================================================
// 类型定义
// ============================================================

/** 文件过滤器: 字符串(路径前缀) / 数组(任一命中) / 正则 / 自定义函数 */
export type FilterPattern = string | Array<string | RegExp> | RegExp | ((id: string) => boolean)

export interface ConvertOptions {
  /**
   * 包装类名前缀, 默认 'taro-scoped', 最终类名形如 `${prefix}-{fileName}-{hash}`。
   * 传入非法值 (空/含空白或非法 CSS 标识符字符) 时警告并回退默认前缀。
   */
  classPrefix?: string
  /**
   * 完全定制包装类名 (传入后优先级高于 classPrefix)。
   * 返回值非法或函数抛错时, 警告并回退默认生成规则。
   */
  generateClassName?: (filePath: string) => string
  /**
   * 模板包装节点标签名, 默认 'view'。
   * 非法标签名 (含空白/特殊字符) 时警告并回退 'view'。
   */
  wrapperTag?: string
  /**
   * 是否展开 :deep() / ::v-deep / :slotted() / :global() 等 scoped 专有伪类
   * 为普通选择器, 默认 false (包裹后整页样式已在本文件作用域内, 多数场景无需展开)。
   */
  transformPseudoSelectors?: boolean
}

export interface ConvertResult {
  /** 转换后的源码 (未命中转换条件时等于入参) */
  code: string
  /** 是否发生了转换 */
  changed: boolean
  /** 生成的包装类名 (未转换时无) */
  className?: string
}

interface Edit {
  start: number
  end: number
  text: string
}

// ============================================================
// 内部工具
// ============================================================

const PLUGIN_TAG = '[taro-vite-vue-scoped-adapter]'

/** 统一警告出口: 所有降级行为都明确说明原因与回退结果 */
function warn(message: string): void {
  console.warn(`${PLUGIN_TAG} ${message}`)
}

/** djb2 字符串哈希, 输出 6 位十六进制 */
function hash6(input: string): string {
  let h = 5381
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0
  }
  return h.toString(16).padStart(8, '0').slice(-6)
}

const DEFAULT_PREFIX = 'taro-scoped'

/** 类名要求: CSS 合法标识符 (首字符为字母), 避免生成不可用的选择器 */
const VALID_CLASS_NAME = /^[A-Za-z][\w-]*$/
/** 标签名要求: 小写字母开头的简单标签, 防止把属性/表达式注入模板 */
const VALID_TAG = /^[a-z][a-z0-9-]*$/

function defaultClassName(filePath: string, prefix: string): string {
  const base = filePath.split(/[\\/]/).pop()?.replace(/\.vue$/, '') ?? 'component'
  return `${prefix}-${base}-${hash6(filePath)}`
}

/**
 * 生成包装类名, 对用户的 classPrefix / generateClassName 定制做校验与兜底。
 */
function resolveClassName(filePath: string, options: ConvertOptions): string {
  if (typeof options.generateClassName === 'function') {
    let name = ''
    try {
      name = String(options.generateClassName(filePath) ?? '')
    } catch (err) {
      warn(
        `generateClassName() threw an error for "${filePath}" ` +
          `(${(err as Error).message}), falling back to the default class name rule.`
      )
    }
    if (VALID_CLASS_NAME.test(name)) return name
    if (name) {
      warn(
        `generateClassName() returned an invalid CSS class name "${name}" for "${filePath}", ` +
          'falling back to the default class name rule.'
      )
    }
  }

  let prefix = DEFAULT_PREFIX
  if (options.classPrefix !== undefined) {
    if (typeof options.classPrefix === 'string' && VALID_CLASS_NAME.test(options.classPrefix)) {
      prefix = options.classPrefix
    } else {
      warn(
        `classPrefix "${String(options.classPrefix)}" is not a valid CSS identifier ` +
          `(expected ${VALID_CLASS_NAME}), falling back to "${DEFAULT_PREFIX}".`
      )
    }
  }
  return defaultClassName(filePath, prefix)
}

/**
 * 根据文件绝对路径生成确定性的包装类名。
 * 可通过 classPrefix 定制前缀, 非法值会警告并回退默认。
 */
export function wrapperClassNameFor(filePath: string, options: Pick<ConvertOptions, 'classPrefix'> = {}): string {
  return resolveClassName(filePath, options)
}

/**
 * 将 FilterPattern 归一化为判断函数; 非法条目跳过并警告,
 * include 全部非法时回退"全不处理", exclude 全部非法时回退"不排除"。
 */
export function createMatcher(pattern: FilterPattern | undefined, kind: 'include' | 'exclude'): (id: string) => boolean {
  if (pattern === undefined) return () => kind === 'include'

  const items = Array.isArray(pattern) ? pattern : [pattern]
  const fns: Array<(id: string) => boolean> = []
  for (const item of items) {
    if (typeof item === 'string') {
      fns.push((id) => id.includes(item))
    } else if (item instanceof RegExp) {
      fns.push((id) => item.test(id))
    } else if (typeof item === 'function') {
      fns.push((id) => {
        try {
          return Boolean(item(id))
        } catch (err) {
          warn(`${kind} matcher function threw an error for "${id}" (${(err as Error).message}), treating as no match.`)
          return false
        }
      })
    } else {
      warn(`invalid ${kind} entry "${String(item)}" (${typeof item}), skipped.`)
    }
  }
  if (fns.length === 0) {
    warn(`${kind} has no valid entry, ${kind === 'include' ? 'no file will be transformed' : 'no file will be excluded'}.`)
    return () => kind !== 'include'
  }
  return (id) => fns.some((fn) => fn(id))
}

/** 校验包装标签名, 非法时回退 'view' */
function resolveWrapperTag(options: ConvertOptions): string {
  const tag = options.wrapperTag
  if (tag === undefined) return 'view'
  if (typeof tag === 'string' && VALID_TAG.test(tag)) return tag
  warn(`wrapperTag "${String(tag)}" is not a valid tag name (expected ${VALID_TAG}), falling back to "view".`)
  return 'view'
}

// ============================================================
// 伪类展开 (:deep / :slotted / :global)
// ============================================================

const PSEUDO_NAMES = [':deep', '::v-deep', ':slotted', '::v-slotted', ':global', '::v-global']

/**
 * 展开 scoped 专有伪类为普通选择器: `.a :deep(.b)` -> `.a .b`。
 * 手工括号配对以正确处理 `:deep(.a:not(.b))` 等嵌套场景;
 * 括号不配对时返回原内容并明确警告原因。
 */
export function expandScopedPseudoSelectors(css: string, filePath: string): string {
  let result = ''
  let i = 0
  while (i < css.length) {
    const hit = PSEUDO_NAMES.find((name) => css.startsWith(name, i))
    if (!hit) {
      result += css[i]
      i++
      continue
    }
    // 伪类后必须紧跟 '(', 否则视为普通文本 (如 :deeply)
    if (css[i + hit.length] !== '(') {
      result += css[i]
      i++
      continue
    }
    let depth = 0
    let end = -1
    for (let j = i + hit.length; j < css.length; j++) {
      if (css[j] === '(') depth++
      else if (css[j] === ')') {
        depth--
        if (depth === 0) {
          end = j
          break
        }
      }
    }
    if (end === -1) {
      warn(`unbalanced parentheses for "${hit}(" in "${filePath}", keeping this style block untouched.`)
      return css
    }
    result += css.slice(i + hit.length + 1, end)
    i = end + 1
  }
  return result
}

// ============================================================
// 主转换函数
// ============================================================

/** 仅这些预处理器支持选择器嵌套, 才做内容包裹; 其余只移除 scoped 属性 */
const NESTABLE_LANGS = ['scss', 'less']

/**
 * 将含 scoped 样式的 .vue 源码转换为包根类方案。
 *
 * @param source   .vue 文件源码
 * @param filePath 文件绝对路径 (用于生成稳定类名)
 * @param options  可选项, 见 ConvertOptions
 * @throws SFC 解析失败时抛出带文件路径与原因的错误, 由调用方决定如何处理
 */
export function convertVueScoped(source: string, filePath: string, options: ConvertOptions = {}): ConvertResult {
  let descriptor
  try {
    descriptor = parse(source, { filename: filePath }).descriptor
  } catch (err) {
    throw new Error(
      `${PLUGIN_TAG} failed to parse SFC "${filePath}": ${(err as Error).message}. ` +
        'Please check the file syntax (template/script/style blocks).'
    )
  }

  const scopedStyles = descriptor.styles.filter((style) => style.scoped)
  if (!descriptor.template || scopedStyles.length === 0) {
    return { code: source, changed: false }
  }

  const className = resolveClassName(filePath, options)
  const wrapperTag = resolveWrapperTag(options)
  const expandPseudo = options.transformPseudoSelectors === true
  const edits: Edit[] = []

  // ---------- 模板: 内容首尾插入包装节点 ----------
  // 类名由路径确定性生成, 若源码中已出现同类名 (重复执行/手动书写) 则跳过
  const { content, loc } = descriptor.template
  if (!content.includes(className)) {
    edits.push({ start: loc.start.offset, end: loc.start.offset, text: `\n<${wrapperTag} class="${className}">` })
    // 闭合节点排版: 模板内容以换行结尾时直接接在其后 (输出 </view>\n</template>),
    // 行内模板 (内容无尾部换行) 则先补换行再闭合
    const closing = content.endsWith('\n') ? `</${wrapperTag}>\n` : `\n</${wrapperTag}>\n`
    edits.push({ start: loc.end.offset, end: loc.end.offset, text: closing })
  }

  // ---------- 样式: 移除 scoped 属性 + 内容嵌套进包装选择器 ----------
  for (const style of scopedStyles) {
    // 1. 定位 <style> 标签头并移除 scoped 属性 (保留 lang 等其他属性)
    const tagStart = source.lastIndexOf('<style', style.loc.start.offset)
    const tagHeaderEnd = source.indexOf('>', tagStart)
    if (tagStart !== -1 && tagHeaderEnd !== -1) {
      const header = source.slice(tagStart, tagHeaderEnd + 1)
      const newHeader = header.replace(/\s+scoped(?:=(?:'[^']*'|"[^"]*"|[^\s>]+))?/, '')
      if (newHeader !== header) {
        edits.push({ start: tagStart, end: tagHeaderEnd + 1, text: newHeader })
      }
    }

    // 2. 内联样式内容包裹 (通过 src 引入的外部样式文件不在此处理)
    const lang = typeof style.attrs.lang === 'string' ? style.attrs.lang : ''
    if (!style.src && style.content.trim() && NESTABLE_LANGS.includes(lang)) {
      let styleContent = style.content
      if (expandPseudo) {
        const expanded = expandScopedPseudoSelectors(styleContent, filePath)
        // 展开内部已对不可解析内容告警并原样返回; 结果必须仍为非空才采用
        if (expanded.trim()) styleContent = expanded
      }
      edits.push({
        start: style.loc.start.offset,
        end: style.loc.end.offset,
        text: `\n.${className} {${styleContent}}\n`
      })
    }
    // 说明: 无 lang (纯 css) 或 sass 缩进语法不做内容包裹 —— 前者小程序不支持
    // 原生嵌套语法风险不可控, 后者缩进语法无法用大括号包裹; 只移除 scoped 属性
  }

  // ---------- 从后往前应用编辑, 避免偏移量失效 ----------
  edits.sort((a, b) => b.start - a.start)
  let code = source
  for (const edit of edits) {
    code = code.slice(0, edit.start) + edit.text + code.slice(edit.end)
  }

  return { code, changed: true, className }
}
