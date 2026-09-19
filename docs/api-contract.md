# API contract

Base URL comes from `VITE_API_BASE_URL`. All request and response shapes are
typed in `apps/web/src/api/types.ts` — change both sides together.
Authentication is a bearer JWT stored under `typelab.token`.

## Endpoints

| Method    | Path                         | Purpose                                                |
| --------- | ---------------------------- | ------------------------------------------------------ |
| POST      | `/auth/login`                | `LoginRequest` → `AuthUserDto`                         |
| POST      | `/auth/register`             | same shape as login                                    |
| GET       | `/categories`                | two-level category tree (`CategoryDto[]`)              |
| GET       | `/texts?category=&level=`    | practice texts (`TextDto[]`)                           |
| POST      | `/texts`                     | store a pasted or imported text                        |
| GET       | `/words?topic=&q=`           | dictionary entries (`DictEntryDto[]`)                  |
| POST      | `/words/import`              | dictionary import (ECDICT / CC-CEDICT / custom)        |
| POST      | `/sessions`                  | submit a run (`SessionSubmitDto` → `SessionResultDto`) |
| GET       | `/sessions/me`               | recent history (`HistoryItemDto[]`)                    |
| GET       | `/stats/summary`             | headline numbers (`StatsSummaryDto`)                   |
| GET       | `/stats/trend?lang=&days=30` | trend series (`TrendPointDto[]`)                       |
| GET       | `/stats/keys`                | per-key error rate for the heatmap                     |
| GET       | `/stats/compare?period=`     | this period vs previous                                |
| GET       | `/stats/bests`               | personal best per text                                 |
| GET       | `/leaderboard?lang=&period=` | leaderboard rows                                       |
| GET       | `/coach`                     | level, targets and today's recommendations             |
| GET · PUT | `/book`                      | error book (spaced repetition state)                   |

### Anti-cheat

`POST /sessions` carries the full keystroke array (`{ k, t, ok }[]`). The server
recomputes speed and accuracy from it and rejects a submission whose client-side
numbers disagree, or whose inter-key timings are implausible.

## MSSQL tables

| Table                               | Columns                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| `Users`                             | Id, Username, PasswordHash, KeyboardLayout, UiLanguage, CreatedAt                   |
| `Categories`                        | Id, ParentId, Name, Color, Layout, Kind, SortOrder                                  |
| `Texts`                             | Id, CategoryId, Title, Content, Level, Chars, Language, CreatedBy, CreatedAt        |
| `Sessions`                          | Id, UserId, TextId, Mode, Speed, Unit, Accuracy, DurationSec, ErrorCount, CreatedAt |
| `SessionKeystrokes`                 | SessionId, Seq, KeyChar, OffsetMs, IsCorrect                                        |
| `KeyErrors`                         | SessionId, KeyChar, Count                                                           |
| `ErrorBook`                         | UserId, KeyChar, Total, Box, DueAt                                                  |
| `Words`                             | Id, Word, Phonetic, Pos, Zh, Topic, Freq                                            |
| `WordExamples`                      | WordId, Sentence, Translation                                                       |
| `UserWordMastery`                   | UserId, WordId, Mastery, NextReviewAt                                               |
| `Achievements` / `UserAchievements` | Id, Code, Name, Threshold / UserId, AchievementId, UnlockedAt                       |

Layering: Controller → Service → Repository, EF Core or SqlSugar, SQL Server.

## Desktop (Tauri)

The desktop build keeps a local SQLite file as the primary store so practice
works offline, and pushes finished runs when the connection returns — the sync
badge in the top bar already reflects that state. Window minimum size 900×640.
