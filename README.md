# prisma-normalize

Rewrite snake_case identifiers in Prisma schema files to PascalCase / camelCase while preserving the original database names via `@map` and `@@map`.

Useful after `prisma db pull` against a snake_case database when you want idiomatic camelCase TypeScript without touching the schema by hand.

## Install

```bash
npm install -D prisma-normalize
```

## Use

```bash
# walk a directory for .prisma files and rewrite in place
prisma-normalize ./prisma

# or a specific file
prisma-normalize ./prisma/schema.prisma

# CI mode: don't write, exit 1 if anything would change
prisma-normalize --check ./prisma

# print what would change without writing
prisma-normalize --dry-run ./prisma
```

Wire into your workflow:

```json
{
  "scripts": {
    "prisma:pull": "prisma db pull && prisma-normalize ./prisma && prisma format",
    "lint:prisma": "prisma-normalize --check ./prisma"
  }
}
```

## What it does

Given:

```prisma
model blog_post {
  id          Int      @id @default(autoincrement())
  author_id   Int
  created_at  DateTime @default(now())
  title       String   @db.VarChar(255)
  author      user     @relation(fields: [author_id], references: [id])

  @@index([author_id])
}
```

It produces:

```prisma
model BlogPost {
  id        Int      @id @default(autoincrement())
  authorId  Int      @map("author_id")
  createdAt DateTime @default(now()) @map("created_at")
  title     String   @db.VarChar(255)
  author    User     @relation(fields: [authorId], references: [id])

  @@index([authorId])
  @@map("blog_post")
}
```

The database schema is untouched — Prisma translates camelCase ↔ snake_case at query time.

## Rules

- `model` / `view` / `enum` names in snake_case → PascalCase, with `@@map("original_name")` appended.
- Scalar field names in snake_case → camelCase, with `@map("original_name")` appended.
- Relation field names → camelCase, **no** `@map` (relations are not DB columns).
- Field type references update to the renamed type.
- `@relation(fields: [...])`, `@@index([...])`, `@@unique([...])`, `@@id([...])` field lists update to the renamed field names.
- Already-normalized blocks are left alone — the transform is idempotent.
- Constraint names inside attributes (`@id(map: "pk_…")`, `@@index([…], map: "idx_…")`) are preserved untouched.

## Multiple files

When you pass a directory, the CLI does a two-pass walk: first it scans every `.prisma` file to learn all model/enum/view names, then it transforms each file using that shared map. This is what makes cross-file type references rename correctly — e.g. a `user` relation field in `post.prisma` becomes `User` because `model user` was discovered in `user.prisma`.

After running, you'll usually want to chain `prisma format` to tidy column alignment:

```bash
prisma-normalize ./prisma && prisma format
```

## Library API

```ts
import { normalizeSchema, buildTypeMap } from 'prisma-normalize'

// Single file — local typeMap built automatically:
const { output, changed } = normalizeSchema(schemaText)

// Multiple files sharing a typeMap (recommended for projects split across files):
const typeMap = buildTypeMap(allFileContents)
for (const content of allFileContents) {
  const { output } = normalizeSchema(content, typeMap)
  // write output back...
}
```

## License

MIT
