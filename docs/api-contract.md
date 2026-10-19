# API contract

Base URL comes from `VITE_API_BASE_URL` (the Docker deployment sets it to `/api`
and lets nginx proxy). All request and response shapes are typed in
`apps/src/api/types.ts` — change both sides together.
Authentication is a bearer JWT stored under `typelab.token`.

Implementation lives in `server/TypeLab.Api`. Routes that are pure plumbing come
from `MapCrud<T>` (see `Api/CrudEndpoints.cs`); the ones below with real
behaviour are hand-written.

## Endpoints

| Method        | Path                           | Purpose                                                          |
| ------------- | ------------------------------ | ---------------------------------------------------------------- |
| POST          | `/auth/login`                  | `LoginRequest` → `AuthUserDto`                                   |
| POST          | `/auth/register`               | same shape as login                                              |
| GET           | `/categories`                  | two-level category tree (`CategoryDto[]`)                        |
| POST          | `/categories`                  | create a top-level or sub category (`CreateCategoryRequest`)     |
| PUT · DELETE  | `/categories/{id}`             | rename / delete a user category (built-in → 409)                 |
| GET           | `/texts`                       | text list without `content`, total in `X-Total-Count`            |
| GET           | `/texts/{id}`                  | one text, with `content`                                         |
| POST          | `/texts`                       | store a pasted text (`CreateTextRequest` → `TextDto`)            |
| POST          | `/texts/import`                | store several texts atomically (`{ texts: [...] }`)              |
| DELETE        | `/texts/{id}`                  | delete a user text (built-in → 409)                              |
| GET           | `/words?topic=&q=&page=&size=` | dictionary page (`DictEntryDto[]`), total in `X-Total-Count`     |
| POST          | `/words/import/preview`        | multipart `file` → `{ headers, sample, format }`                 |
| POST          | `/words/import/file`           | multipart `file`, `map`, `skipDuplicates` → `{ added, skipped }` |
| POST          | `/sessions`                    | submit a run (`SessionSubmitDto` → `SessionResultDto`)           |
| GET           | `/sessions/me`                 | recent history (`HistoryItemDto[]`)                              |
| GET           | `/stats/summary`               | headline numbers (`StatsSummaryDto`)                             |
| GET           | `/stats/trend?lang=&days=30`   | trend series (`TrendPointDto[]`)                                 |
| GET           | `/stats/keys`                  | per-key error rate for the heatmap                               |
| GET           | `/stats/compare?period=`       | this period vs previous                                          |
| GET           | `/stats/bests`                 | personal best per text                                           |
| GET           | `/leaderboard?lang=&period=`   | leaderboard rows                                                 |
| GET           | `/coach`                       | level, targets and today's recommendations                       |
| GET · PUT     | `/book`                        | error book (spaced repetition state)                             |
| GET           | `/models?locale=`              | model catalogue + the install directory for this runtime         |
| POST · DELETE | `/models/{code}/install`       | mark a model installed / remove it                               |
| GET           | `/prompts?locale=`             | built-in prompt catalogue (Name/Description localised)           |
| GET           | `/translate/providers`         | registered translators and whether each is configured            |
| POST          | `/translate/locales`           | one locale in, the remaining UI locales out                      |

Writes are checked against the page that sent them: a `POST`, `PUT`, `PATCH`
or `DELETE` whose `Origin` header is present but neither in the CORS allowlist
(`Cors:Origins`, the same list the CORS policy uses) nor the API's own host is
a `403` ProblemDetails. This covers requests CORS lets through without a
preflight, such as a multipart form. Reads, preflights and requests without an
`Origin` (the desktop shell, curl, tests) are not checked. Same-origin compares
the host name, and the port only when the `Host` header carries one, so the
Docker image works behind nginx's `proxy_set_header Host $host`.

### Library: categories and texts

Hand-written in `Api/LibraryEndpoints.cs`, backed by `Data/LibraryService.cs`.
JSON is camelCase.

**Ids.** A built-in top-level category is addressed by its code (`basic`,
`english`, `chinese`, `zhuyin`, `bilingual`, `code`, `timed`, `custom`); every
other category and every sub-category by its numeric row id as a string. The
server tries an integer first, then a top-level code.

```ts
CategoryDto    { id, name, color, layout, kind, isBuiltIn, children: SubCategoryDto[] }
SubCategoryDto { id, name, count, isBuiltIn }
TextDto        { id, title, category, sub, categoryId, subId, level /* "L3" */, chars,
                 best /* null for now */, lastPractisedAt /* null for now */,
                 isBuiltIn, content? /* omitted in lists */ }
```

`isBuiltIn` is true for rows that ship with the app (they carry a `Code`).
`categoryId` / `subId` are the ids of the top-level category and the sub-category
a text sits under; `category` / `sub` are their names.

**`GET /texts`** query: `category` (top-level id), `sub` (sub id), `level`
(`L3` or `3`), `builtIn` (`true` / `false`), `page` (from 1), `size` (1-500,
default 50). The body is an array of `TextDto` with no `content`; the total
before paging is in the `X-Total-Count` header (exposed through CORS). Order:
the user's texts newest first, then built-in texts in shipped order.

**Requests**

```ts
CreateCategoryRequest { level: 'top' | 'sub', parentId?: string, name: string, color?: string }
RenameCategoryRequest { name: string }
CreateTextRequest     { title, content, categoryId?, sub?, level?, fileName? }
ImportTextsRequest    { texts: CreateTextRequest[] }
```

`POST /categories` answers `201 { id }`. A new top-level category is `kind:
"custom"`, `layout: "en"`. `POST /texts` answers `201 TextDto`;
`POST /texts/import` answers `200 TextDto[]` in request order.

A text goes into the sub-category of `categoryId` whose name matches `sub`
(case-insensitive); a missing sub is created with the parent's kind, layout and
colour, and a blank `sub` goes to the first sub-category. `categoryId` may also
name a sub-category, which then takes the text and `sub` is ignored. A missing
or unknown `categoryId` files it under `custom` -> Uncategorised. `level`
defaults to 3.

Text content is normalised on every write (`POST /texts` and
`POST /texts/import`), and once on start for user texts saved before: CRLF and
lone CR become LF, a tab becomes one space, trailing whitespace is stripped from
each line, and blank lines at the start and end are removed. `chars` is the
length of the normalised content.

The tree lists top-level categories in shipped order, then the user's in the
order they were created, with `custom` (Uncategorised) always last.

**Errors** are ProblemDetails (`{ type, title, status }`, `title` carries the
reason). `400` blank title/content, blank category name, or a category `level`
other than `top` / `sub`; `404` unknown id (including `GET /texts/{id}`); `409`
renaming or deleting a built-in row. For a rejected text the body carries a
top-level `failed` array: the `fileName` of each bad text, or its 1-based
position when it has none. An import saves all texts or none.

Deleting a category deletes its sub-categories and moves their texts to
Uncategorised; deleting a text also deletes its segmentations.

### Dictionary

Hand-written in `Api/WordEndpoints.cs`, backed by `Data/DictionaryService.cs`.
JSON is camelCase. The 14 words of `DICTIONARY` in the mock fixtures are seeded
on first start (matched on word + topic, so a restart adds nothing).

`GET /words` answers an array of `{ id, word, phonetic, pos, zh, topic, example,
mastery }` in id order, with the total in `X-Total-Count`. `topic` is an exact
match; `q` matches `word` or `zh`, ignoring case. `page` defaults to 1 and
`size` to 50 (1 to 500). `mastery` is the local user's value, 0 if none;
`example` is the first stored sentence, or an empty string.

Both import endpoints take `multipart/form-data` with the file in a `file`
field; the server reads it with `ELF.Modules.Excel`. The format comes from the
file name: `.xlsx` (read by its signature), `.csv` (comma), `.tsv` (tab) and
`.txt` (tab if the first non-empty line has one, else comma). Any other
extension, `.json` and `.xls` included, is a `400`. Text files may be UTF-8,
with or without a BOM, or Big5; quoted fields (RFC 4180, commas and line breaks
inside quotes) are read as one value. The first row is the header row; in a
text file, blank lines (nothing but spaces or tabs) above it are skipped, so the
first non-empty line is the header. Rows whose cells are all empty are skipped.

Limits: a request body up to 256 MiB on these two endpoints only (other
endpoints keep the server default); a larger upload is a `413`. A file over the
importer's own limits (256 MiB, 1,000,000 rows) or one it cannot read (a
damaged workbook, an undecodable text file) is a `400`. The server sets no
request timeout; the desktop client waits for the import without one.
Behind the Docker web image, nginx allows the same 256 MiB body and waits up
to 600 s for the answer.

`POST /words/import/preview` answers `200 { headers, sample, format }`:
`headers` are the header names in file order, `sample` holds up to three data
rows as strings in `headers` order (workbook numbers and dates in an invariant
form, an empty cell as `""`), and `format` is `xlsx`, `csv`, `tsv` or `txt`.
Nothing is stored.

`POST /words/import/file` also takes the form fields `map`, JSON
`{ word, zh?, phonetic?, pos?, topic?, example? }` whose values are header
names from the preview, and `skipDuplicates` (`true`/`false`, default `false`).
It answers `200 { added, skipped }`. Only `word` is required; a mapped header
the file does not have is a `400`. Values are trimmed; a blank `topic` becomes
`Uncategorised`, and an `example` becomes one stored sentence. Two words are
duplicates when word and topic both match, ignoring case in the word and
exactly in the topic, whether the earlier one is stored or comes earlier in the
file. With `skipDuplicates` they are skipped and counted; without it they are
written anyway. All or nothing: a row whose `word` is blank makes the whole
import a `400` whose top-level `failed` lists the data-row numbers of such rows
(at most the first 50, as strings) and `failedCount` the total; nothing is
saved. Data rows are numbered from 1, the first row under the header; skipped
blank lines above the header do not count, empty rows between data rows do. In
a text file a quoted line break does not start a new row, so a number can
differ from the editor's line number. Rows are stored in batches inside one
transaction.

The JSON `POST /words/import` of earlier builds is gone; the web build's mock
still parses `.csv`, `.tsv` and `.txt` in the browser and does not import
`.xlsx`.

### Anti-cheat

`POST /sessions` carries the full keystroke array (`{ k, t, ok }[]`). The server
recomputes speed and accuracy from it and rejects a submission whose client-side
numbers disagree, or whose inter-key timings are implausible.

## Tables

SQLite via **SqlSugar** CodeFirst — the entities in
`server/TypeLab.Api/Models/Entities.cs` are the source of truth and the tables
are created on start-up. Two constraints the entities work around: SQLite has no
native `DateTimeOffset` (columns are UTC `DateTime`), and SqlSugar materialises
rows reflectively, so entities use defaults rather than `required` members.

| Table                               | Columns                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `Users`                             | Id, Username, PasswordHash, KeyboardLayout, UiLanguage, CreatedAt                             |
| `Categories`                        | Id, ParentId, Name, I18nKey, Color, Layout, Code, Kind, SortOrder                             |
| `Texts`                             | Id, CategoryId, Code, SortOrder, Title, Content, Level, Chars, Language, CreatedBy, CreatedAt |
| `Sessions`                          | Id, UserId, TextId, Mode, Speed, Unit, Accuracy, DurationSec, ErrorCount, CreatedAt           |
| `SessionKeystrokes`                 | SessionId, Seq, KeyChar, OffsetMs, IsCorrect                                                  |
| `KeyErrors`                         | SessionId, KeyChar, Count                                                                     |
| `ErrorBook`                         | UserId, KeyChar, Total, Box, DueAt                                                            |
| `TextSegmentations`                 | Id, TextId, Engine, ModelVersion, IsPrimary, CreatedAt                                        |
| `TextSegments`                      | Id, SegmentationId, Seq, Token, Pos, CharStart, CharLength, Reading, WordId                   |
| `PromptTemplates`                   | Id, Code, Name, Description, Content, ModelHint, Revision, IsBuiltIn, CreatedBy               |
| `LocalModels`                       | Id, Code, Name, Kind, Note, SizeMb, SourceUrl, Sha256, SortOrder, Installed, InstalledAt      |
| `Translations`                      | Id, EntityType, EntityId, Field, Locale, Value, UpdatedAt                                     |
| `Words`                             | Id, Text, Phonetic, Pos, Zh, Topic, Freq                                                      |
| `WordExamples`                      | WordId, Sentence, Translation                                                                 |
| `UserWordMastery`                   | UserId, WordId, Mastery, NextReviewAt                                                         |
| `Achievements` / `UserAchievements` | Id, Code, Name, Threshold / UserId, AchievementId, UnlockedAt                                 |

The word column is `Text`, not `Word`: C# forbids a member sharing its type's
name.

The generated DDL is dumped to `server/db/schema.sql` (`npm run db:schema`) so
the schema can be reviewed and diffed; the entities remain the source of truth
and that file is never hand-edited.

### AI segmentation

Chinese drills need word boundaries, so a text can carry several segmentation
passes: `TextSegmentations` is one pass by one engine (`jieba`, `ckip`, `llm`,
`manual`) at one model version, and `TextSegments` holds its tokens. The tokens
carry `CharStart`/`CharLength` into the parent text, which is what lets a
keystroke be attributed to the word being typed — per-word accuracy and the
bopomofo prompt both depend on it. Exactly one pass per text has `IsPrimary`.
Keeping passes side by side means a better model can be run later without
destroying what the current drills were scored against.

### Prompts

Prompts live in `PromptTemplates` on the server, never in the client, and the
shipped ones are re-seeded from `Data/PromptSeeds.cs` on every start — editing a
prompt there and bumping `Revision` rolls it out everywhere. A user may save a
row under the same `Code`; lookup prefers the user's row and falls back to the
built-in one, which is never overwritten, so "restore default" always works.

Seeded codes: `categorise`, `examples`, `rewrite` and `level` — carried over
verbatim from the presets the front end used to hard-code — plus `segment.zh`
for Chinese segmentation, which has no front-end counterpart.
`apps/src/lib/analyze.ts` stays as the offline heuristic.

### Localised names

`Categories.I18nKey` marks a row as shipped copy: the UI renders the front-end
translation for that key and ignores `Name`. User-created rows leave it null and
put their translations in `Translations`, keyed by
(`EntityType`, `EntityId`, `Field`, `Locale`). Resolution order is the requested
locale → the row's base column → English.

Shipped prompt names/descriptions and model notes are seeded into
`Translations` on every start from `Data/CatalogueTranslationSeeds.cs` (English
copied from the entity, zh-TW / zh-CN from that file). `GET /models` and
`GET /prompts` take `?locale=` (or `Accept-Language`) and return those fields
already resolved. Prompt `Content` stays English — it is the instruction sent
to the model, not UI copy. A user-owned prompt row is never written by the
seed.

`POST /translate/locales` takes one locale and returns every UI locale, so a
name typed once can be stored in all three. Locales that could not be translated
come back in `failed` and keep the source text, leaving the row complete and the
gap retryable.

### Model storage

`GET /models` reports the directory alongside the catalogue, because it differs
per runtime: a mounted volume under Docker (`Models__Directory=/data/models`), a
per-user data directory on a dev machine, and the OS app-data directory inside
the Tauri shell — where the shell answers instead of this endpoint. The path is
never stored in the database and never assumed by the client.

Layering: minimal-API endpoint → service → SqlSugar. Registering a new entity in
`Data/SqlSugarSetup.cs` creates its table; `api.MapCrud<T>("/...")` in
`Program.cs` gives it REST plumbing.

## Desktop (Tauri)

The desktop build keeps a local SQLite file as the primary store so practice
works offline, and pushes finished runs when the connection returns — the sync
badge in the top bar already reflects that state. Window minimum size 900×640.
