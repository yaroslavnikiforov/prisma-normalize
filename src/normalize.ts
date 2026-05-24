export type NormalizeResult = {
  output: string
  changed: boolean
}

export type TypeMap = {
  renameMap: Map<string, string>
  modelNames: Set<string>
}

export function buildTypeMap(inputs: string[]): TypeMap {
  const renameMap = new Map<string, string>()
  const modelNames = new Set<string>()
  for (const input of inputs) {
    const local = collectBlockNames(input)
    for (const [k, v] of local.renameMap) renameMap.set(k, v)
    for (const n of local.modelNames) modelNames.add(n)
  }
  return { renameMap, modelNames }
}

export function normalizeSchema(
  input: string,
  typeMap?: TypeMap,
): NormalizeResult {
  const { renameMap, modelNames } = typeMap ?? collectBlockNames(input)

  const output = input.replace(
    /^(model|enum|view|type)\s+(\w+)\s*\{([\s\S]*?)^\}/gm,
    (_match, kind: string, name: string, body: string) => {
      const newName = renameMap.get(name) ?? name
      const wasRenamed = newName !== name

      const isModelLike = kind === 'model' || kind === 'view' || kind === 'type'
      const newBody = isModelLike
        ? transformModelBody(body, renameMap, modelNames)
        : body

      const finalBody =
        wasRenamed && !/@@map\(/.test(body)
          ? appendMapDirective(newBody, name)
          : newBody

      return `${kind} ${newName} {${finalBody}}`
    },
  )

  return { output, changed: output !== input }
}

function collectBlockNames(input: string): TypeMap {
  const renameMap = new Map<string, string>()
  const modelNames = new Set<string>()

  const blockHeaderRe = /^(model|enum|view|type)\s+(\w+)\s*\{/gm
  let m: RegExpExecArray | null
  while ((m = blockHeaderRe.exec(input)) !== null) {
    const kind = m[1] as string
    const name = m[2] as string

    if (kind === 'model' || kind === 'view' || kind === 'type') {
      modelNames.add(name)
    }

    if (needsRename(name)) {
      renameMap.set(name, toPascal(name))
    }
  }

  return { renameMap, modelNames }
}

function transformModelBody(
  body: string,
  renameMap: Map<string, string>,
  modelNames: Set<string>,
): string {
  return body
    .split('\n')
    .map(line => transformLine(line, renameMap, modelNames))
    .join('\n')
}

function transformLine(
  line: string,
  renameMap: Map<string, string>,
  modelNames: Set<string>,
): string {
  const trimmed = line.trim()
  if (!trimmed) return line
  if (trimmed.startsWith('//')) return line
  if (trimmed.startsWith('@@')) return transformBlockAttr(line)

  const fieldRe = /^(\s*)(\w+)(\s+)(\w+(?:\?|\[\])?)([ \t].*)?$/
  const m = fieldRe.exec(line)
  if (!m) return line

  const indent = m[1] as string
  const fieldName = m[2] as string
  const sep = m[3] as string
  const typeAnno = m[4] as string
  const rest = m[5] ?? ''

  const baseType = typeAnno.replace(/(\?|\[\])$/, '')
  const typeSuffix = typeAnno.slice(baseType.length)
  const renamedBase = renameMap.get(baseType)
  const newType = renamedBase ? `${renamedBase}${typeSuffix}` : typeAnno

  const isRelationField = modelNames.has(baseType)

  let newFieldName = fieldName
  let mapAttr = ''
  if (fieldName.includes('_') && needsRename(fieldName)) {
    newFieldName = toCamel(fieldName)
    if (!isRelationField && !/@map\(/.test(rest)) {
      mapAttr = ` @map("${fieldName}")`
    }
  }

  const newRest = rewriteRelationFieldRefs(rest)

  const newSep = adjustSep(sep, fieldName.length, newFieldName.length)

  return `${indent}${newFieldName}${newSep}${newType}${newRest}${mapAttr}`
}

function transformBlockAttr(line: string): string {
  return line.replace(
    /(@@(?:index|unique|id))\(\[([^\]]+)\]/g,
    (_full, prefix: string, list: string) => {
      const items = list.split(',').map(s => s.trim())
      const newItems = items.map(f =>
        f.includes('_') && needsRename(f) ? toCamel(f) : f,
      )
      return `${prefix}([${newItems.join(', ')}]`
    },
  )
}

function rewriteRelationFieldRefs(rest: string): string {
  return rest.replace(/@relation\(([^)]*)\)/g, (_full, args: string) => {
    const updated = args
      .replace(
        /fields:\s*\[([^\]]*)\]/g,
        (_a: string, list: string) => `fields: [${renameFieldList(list)}]`,
      )
      .replace(
        /references:\s*\[([^\]]*)\]/g,
        (_a: string, list: string) => `references: [${renameFieldList(list)}]`,
      )
    return `@relation(${updated})`
  })
}

function renameFieldList(list: string): string {
  return list
    .split(',')
    .map(s => s.trim())
    .map(f => (f.includes('_') && needsRename(f) ? toCamel(f) : f))
    .join(', ')
}

function appendMapDirective(body: string, originalName: string): string {
  const trimmed = body.replace(/\s+$/, '')
  return `${trimmed}\n\n  @@map("${originalName}")\n`
}

function adjustSep(sep: string, oldLen: number, newLen: number): string {
  const diff = newLen - oldLen
  if (diff === 0) return sep
  if (diff > 0) {
    if (sep.length > diff) return ' '.repeat(sep.length - diff)
    return ' '
  }
  return sep + ' '.repeat(-diff)
}

function needsRename(name: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(name)
}

function toCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

function toPascal(s: string): string {
  const camel = toCamel(s)
  return camel.charAt(0).toUpperCase() + camel.slice(1)
}
