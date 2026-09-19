#!/usr/bin/env node
// Dumps the DDL that SqlSugar's CodeFirst actually produced into
// server/db/schema.sql, so the schema is reviewable and diffable instead of
// existing only as runtime behaviour.
//
//   dotnet run --project server/TypeLab.Api   # creates/updates app.db
//   node scripts/export-schema.mjs            # dump it
//
// The entities in server/TypeLab.Api/Models/Entities.cs stay the source of
// truth; this file is generated from them and should not be hand-edited.

import { DatabaseSync } from 'node:sqlite'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dbPath = process.argv[2] ?? join(root, 'server', 'TypeLab.Api', 'app.db')
const outPath = join(root, 'server', 'db', 'schema.sql')

if (!existsSync(dbPath)) {
  console.error(`no database at ${dbPath}`)
  console.error('run the API once first: dotnet run --project server/TypeLab.Api')
  process.exit(1)
}

const db = new DatabaseSync(dbPath, { readOnly: true })

const objects = db
  .prepare(
    `SELECT type, name, tbl_name, sql
       FROM sqlite_master
      WHERE sql IS NOT NULL
        AND name NOT LIKE 'sqlite_%'
      ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, tbl_name, name`,
  )
  .all()

const tables = objects.filter((o) => o.type === 'table')
const indexes = objects.filter((o) => o.type === 'index')

const lines = [
  '-- TypeLab — SQLite schema',
  '--',
  '-- GENERATED FILE. Do not edit by hand.',
  '-- Source of truth: server/TypeLab.Api/Models/Entities.cs',
  '-- Regenerate:     npm run db:schema',
  '--',
  '-- SqlSugar CodeFirst creates these at start-up, so applying this file is only',
  '-- needed to inspect, review or provision a database out of band.',
  '',
  'PRAGMA foreign_keys = ON;',
  '',
  `-- ${tables.length} tables`,
  '',
]

for (const t of tables) {
  lines.push(`${t.sql.trim()};`, '')
  const own = indexes.filter((i) => i.tbl_name === t.name)
  if (own.length) {
    for (const i of own) lines.push(`${i.sql.trim()};`)
    lines.push('')
  }
}

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, lines.join('\n'))

db.close()
console.log(`wrote ${outPath}: ${tables.length} tables, ${indexes.length} indexes`)
