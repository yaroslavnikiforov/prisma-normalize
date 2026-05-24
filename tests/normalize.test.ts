import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildTypeMap, normalizeSchema } from '../src/normalize.ts'

describe('normalizeSchema', () => {
  it('renames a snake_case model to PascalCase and adds @@map', () => {
    const input = `model blog_post {
  id Int @id
}
`
    const { output, changed } = normalizeSchema(input)
    assert.equal(changed, true)
    assert.match(output, /model BlogPost \{/)
    assert.match(output, /@@map\("blog_post"\)/)
  })

  it('renames a single-word lowercase model', () => {
    const input = `model user {
  id Int @id
}
`
    const { output } = normalizeSchema(input)
    assert.match(output, /model User \{/)
    assert.match(output, /@@map\("user"\)/)
  })

  it('renames snake_case scalar fields and adds @map', () => {
    const input = `model post {
  id Int @id
  author_id Int
  created_at DateTime
}
`
    const { output } = normalizeSchema(input)
    assert.match(output, /authorId\s+Int\s+@map\("author_id"\)/)
    assert.match(output, /createdAt\s+DateTime\s+@map\("created_at"\)/)
  })

  it('renames relation field type without adding @map on the relation field', () => {
    const input = `model post {
  id Int @id
  author_id Int
  author user @relation(fields: [author_id], references: [id])
}

model user {
  id Int @id
}
`
    const { output } = normalizeSchema(input)
    assert.match(output, /author\s+User\s+@relation\(fields: \[authorId\]/)
    assert.doesNotMatch(output, /author\s+User\s+@relation[^\n]*@map\(/)
    assert.match(output, /authorId\s+Int\s+@map\("author_id"\)/)
  })

  it('leaves already-PascalCase models alone', () => {
    const input = `model User {
  id Int @id
  email String
}
`
    const { output, changed } = normalizeSchema(input)
    assert.equal(changed, false)
    assert.equal(output, input)
  })

  it('is idempotent', () => {
    const input = `model blog_post {
  id Int @id
  author_id Int
  author user @relation(fields: [author_id], references: [id])
}

model user {
  id Int @id
}
`
    const once = normalizeSchema(input).output
    const twice = normalizeSchema(once).output
    assert.equal(twice, once)
  })

  it('updates @@index field references', () => {
    const input = `model post {
  id Int @id
  author_id Int

  @@index([author_id])
}
`
    const { output } = normalizeSchema(input)
    assert.match(output, /@@index\(\[authorId\]\)/)
  })

  it('updates @@unique field references', () => {
    const input = `model member {
  id Int @id
  org_id Int
  user_id Int

  @@unique([org_id, user_id])
}
`
    const { output } = normalizeSchema(input)
    assert.match(output, /@@unique\(\[orgId, userId\]\)/)
  })

  it('preserves constraint map: names inside attributes', () => {
    const input = `model post {
  id Int @id(map: "pk_post_id") @default(autoincrement())

  @@index([id], map: "idx_post_id")
}
`
    const { output } = normalizeSchema(input)
    assert.match(output, /@id\(map: "pk_post_id"\)/)
    assert.match(output, /map: "idx_post_id"/)
  })

  it('renames enum types and adds @@map', () => {
    const input = `enum user_status {
  ACTIVE
  INACTIVE
}

model account {
  id Int @id
  status user_status
}
`
    const { output } = normalizeSchema(input)
    assert.match(output, /enum UserStatus \{/)
    assert.match(output, /@@map\("user_status"\)/)
    assert.match(output, /status\s+UserStatus/)
  })

  it('handles optional and list type annotations', () => {
    const input = `model post {
  id Int @id
  parent_id Int?
  tag_ids Int[]
}
`
    const { output } = normalizeSchema(input)
    assert.match(output, /parentId\s+Int\?\s+@map\("parent_id"\)/)
    assert.match(output, /tagIds\s+Int\[\]\s+@map\("tag_ids"\)/)
  })

  it('renames cross-file type references when given a shared typeMap', () => {
    const fileA = `model post {
  id Int @id
  author_id Int
  author user @relation(fields: [author_id], references: [id])
}
`
    const fileB = `model user {
  id Int @id
}
`
    const typeMap = buildTypeMap([fileA, fileB])
    const outA = normalizeSchema(fileA, typeMap).output

    assert.match(outA, /author\s+User\s+@relation/)
  })

  it('preserves doc comments and blank lines', () => {
    const input = `/// A blog post.
model post {
  id Int @id
  /// The author id.
  author_id Int
}
`
    const { output } = normalizeSchema(input)
    assert.match(output, /\/\/\/ A blog post\./)
    assert.match(output, /\/\/\/ The author id\./)
  })
})
