# API contract

Base URL comes from `VITE_API_BASE_URL` (the Docker deployment sets it to `/api`
and lets nginx proxy). All request and response shapes are typed in
`apps/src/api/types.ts` — change both sides together.
Authentication is a bearer JWT stored under `typelab.token`.

Implementation lives in `server/TypeLab.Api`. Routes that are pure plumbing come
from `MapCrud<T>` (see `Api/CrudEndpoints.cs`); the ones below with real
behaviour are hand-written.

## Endpoints

| Method        | Path                         | Purpose                                                  |
| ------------- | ---------------------------- | -------------------------------------------------------- |
| POST          | `/auth/login`                | `LoginRequest` → `AuthUserDto`                           |
| POST          | `/auth/register`             | same shape as login                                      |
| GET           | `/categories`                | two-level category tree (`CategoryDto[]`)                |
| GET           | `/texts?category=&level=`    | practice texts (`TextDto[]`)                             |
| POST          | `/texts`                     | store a pasted or imported text                          |
| GET           | `/words?topic=&q=`           | dictionary entries (`DictEntryDto[]`)                    |
| POST          | `/words/import`              | dictionary import (ECDICT / CC-CEDICT / custom)          |
| POST          | `/sessions`                  | submit a run (`SessionSubmitDto` → `SessionResultDto`)   |
| GET           | `/sessions/me`               | recent history (`HistoryItemDto[]`)                      |
| GET           | `/stats/summary`             | headline numbers (`StatsSummaryDto`)                     |
| GET           | `/stats/trend?lang=&days=30` | trend series (`TrendPointDto[]`)                         |
| GET           | `/stats/keys`                | per-key error rate for the heatmap                       |
| GET           | `/stats/compare?period=`     | this period vs previous                                  |
| GET           | `/stats/bests`               | personal best per text                                   |
| GET           | `/leaderboard?lang=&period=` | leaderboard rows                                         |
| GET           | `/coach`                     | level, targets and today's recommendations               |
| GET · PUT     | `/book`                      | error book (spaced repetition state)                     |
| GET           | `/models?locale=`            | model catalogue + the install directory for this runtime |
| POST · DELETE | `/models/{code}/install`     | mark a model installed / remove it                       |
| GET           | `/prompts?locale=`           | built-in prompt catalogue (Name/Description localised)   |
| GET           | `/translate/providers`       | registered translators and whether each is configured    |
| POST          | `/translate/locales`         | one locale in, the remaining UI locales out              |

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

| Table                               | Columns                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `Users`                             | Id, Username, PasswordHash, KeyboardLayout, UiLanguage, CreatedAt                        |
| `Categories`                        | Id, ParentId, Name, I18nKey, Color, Layout, Kind, SortOrder                              |
| `Texts`                             | Id, CategoryId, Title, Content, Level, Chars, Language, CreatedBy, CreatedAt             |
| `Sessions`                          | Id, UserId, TextId, Mode, Speed, Unit, Accuracy, DurationSec, ErrorCount, CreatedAt      |
| `SessionKeystrokes`                 | SessionId, Seq, KeyChar, OffsetMs, IsCorrect                                             |
| `KeyErrors`                         | SessionId, KeyChar, Count                                                                |
| `ErrorBook`                         | UserId, KeyChar, Total, Box, DueAt                                                       |
| `TextSegmentations`                 | Id, TextId, Engine, ModelVersion, IsPrimary, CreatedAt                                   |
| `TextSegments`                      | Id, SegmentationId, Seq, Token, Pos, CharStart, CharLength, Reading, WordId              |
| `PromptTemplates`                   | Id, Code, Name, Description, Content, ModelHint, Revision, IsBuiltIn, CreatedBy          |
| `LocalModels`                       | Id, Code, Name, Kind, Note, SizeMb, SourceUrl, Sha256, SortOrder, Installed, InstalledAt |
| `Translations`                      | Id, EntityType, EntityId, Field, Locale, Value, UpdatedAt                                |
| `Words`                             | Id, Text, Phonetic, Pos, Zh, Topic, Freq                                                 |
| `WordExamples`                      | WordId, Sentence, Translation                                                            |
| `UserWordMastery`                   | UserId, WordId, Mastery, NextReviewAt                                                    |
| `Achievements` / `UserAchievements` | Id, Code, Name, Threshold / UserId, AchievementId, UnlockedAt                            |

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
