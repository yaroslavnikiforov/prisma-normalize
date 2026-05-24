#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { buildTypeMap, normalizeSchema } from './normalize.js'

const args = process.argv.slice(2)
const flags = new Set(args.filter(a => a.startsWith('--') || a === '-h'))
const paths = args.filter(a => !a.startsWith('-'))

const isCheck = flags.has('--check')
const isDryRun = flags.has('--dry-run')
const isHelp = flags.has('--help') || flags.has('-h')

if (isHelp || paths.length === 0) {
  printHelp()
  process.exit(isHelp ? 0 : 2)
}

function printHelp(): void {
  process.stdout.write(`Usage: prisma-normalize [options] <path>...

  Walks <path>(s) for .prisma files and rewrites snake_case
  identifiers to PascalCase/camelCase while preserving the
  original DB names via @map / @@map directives.

Options:
  --check     Don't write; exit 1 if any file would change. For CI.
  --dry-run   Don't write; print the normalized output to stdout.
  --help, -h  Show this help.
`)
}

function findPrismaFiles(p: string): string[] {
  const abs = resolve(p)
  const stat = statSync(abs)
  if (stat.isFile()) {
    return abs.endsWith('.prisma') ? [abs] : []
  }
  const out: string[] = []
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = join(abs, entry.name)
    if (entry.isDirectory()) {
      out.push(...findPrismaFiles(full))
    } else if (entry.name.endsWith('.prisma')) {
      out.push(full)
    }
  }
  return out
}

const allFiles = paths.flatMap(findPrismaFiles)

if (allFiles.length === 0) {
  process.stderr.write('No .prisma files found.\n')
  process.exit(2)
}

const fileContents = allFiles.map(file => ({
  file,
  content: readFileSync(file, 'utf8'),
}))
const typeMap = buildTypeMap(fileContents.map(f => f.content))

let changedCount = 0
let unchangedCount = 0

for (const { file, content } of fileContents) {
  const { output, changed } = normalizeSchema(content, typeMap)

  if (!changed) {
    unchangedCount++
    continue
  }

  changedCount++

  if (isCheck) {
    process.stdout.write(`would change: ${file}\n`)
  } else if (isDryRun) {
    process.stdout.write(`--- ${file} ---\n${output}\n`)
  } else {
    writeFileSync(file, output, 'utf8')
    process.stdout.write(`changed: ${file}\n`)
  }
}

process.stdout.write(
  `\n${changedCount} changed, ${unchangedCount} unchanged (${allFiles.length} total)\n`,
)

if (isCheck && changedCount > 0) {
  process.exit(1)
}
