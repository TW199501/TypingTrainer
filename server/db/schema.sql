-- TypeLab — SQLite schema
--
-- GENERATED FILE. Do not edit by hand.
-- Source of truth: server/TypeLab.Api/Models/Entities.cs
-- Regenerate:     npm run db:schema
--
-- SqlSugar CodeFirst creates these at start-up, so applying this file is only
-- needed to inspect, review or provision a database out of band.

PRAGMA foreign_keys = ON;

-- 17 tables

CREATE TABLE "Achievements"(
"Id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
"Code" varchar(64) NOT NULL  ,
"Name" varchar(128) NOT NULL  ,
"Threshold" integer NOT NULL    );

CREATE UNIQUE INDEX ux_achievements_code ON `Achievements`(`Code` Asc);

CREATE TABLE "Categories"(
"Id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
"ParentId" integer NULL  ,
"Name" varchar(128) NOT NULL  ,
"I18nKey" varchar(64) NULL  ,
"Color" varchar(32) NULL  ,
"Layout" varchar(32) NULL  ,
"Kind" varchar(32) NOT NULL  ,
"SortOrder" integer NOT NULL    );

CREATE TABLE "ErrorBook"(
"Id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
"UserId" integer NOT NULL  ,
"KeyChar" varchar(8) NOT NULL  ,
"Total" integer NOT NULL  ,
"Box" integer NOT NULL  ,
"DueAt" datetime NOT NULL    );

CREATE UNIQUE INDEX ux_errorbook_user_key ON `ErrorBook`(`UserId` Asc,`KeyChar` Asc);

CREATE TABLE "KeyErrors"(
"Id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
"SessionId" integer NOT NULL  ,
"KeyChar" varchar(8) NOT NULL  ,
"Count" integer NOT NULL    );

CREATE TABLE "LocalModels"(
"Id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
"Code" varchar(64) NOT NULL  ,
"Name" varchar(128) NOT NULL  ,
"Kind" varchar(16) NOT NULL  ,
"Note" varchar(256) NOT NULL  ,
"SizeMb" integer NOT NULL  ,
"SourceUrl" varchar(512) NULL  ,
"Sha256" varchar(64) NULL  ,
"SortOrder" integer NOT NULL  ,
"Installed" bit NOT NULL  ,
"InstalledAt" datetime NULL    );

CREATE UNIQUE INDEX ux_localmodels_code ON `LocalModels`(`Code` Asc);

CREATE TABLE "PromptTemplates"(
"Id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
"Code" varchar(64) NOT NULL  ,
"Name" varchar(128) NOT NULL  ,
"Description" varchar(512) NULL  ,
"Content" text NOT NULL  ,
"ModelHint" varchar(64) NULL  ,
"Revision" integer NOT NULL  ,
"IsBuiltIn" bit NOT NULL  ,
"CreatedBy" integer NULL  ,
"UpdatedAt" datetime NOT NULL    );

CREATE UNIQUE INDEX ux_prompts_code_owner ON `PromptTemplates`(`Code` Asc,`CreatedBy` Asc);

CREATE TABLE "SessionKeystrokes"(
"Id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
"SessionId" integer NOT NULL  ,
"Seq" integer NOT NULL  ,
"KeyChar" varchar(8) NOT NULL  ,
"OffsetMs" integer NOT NULL  ,
"IsCorrect" bit NOT NULL    );

CREATE UNIQUE INDEX ux_keystrokes_session_seq ON `SessionKeystrokes`(`SessionId` Asc,`Seq` Asc);

CREATE TABLE "Sessions"(
"Id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
"UserId" integer NOT NULL  ,
"TextId" integer NULL  ,
"Mode" varchar(32) NOT NULL  ,
"Speed" real NOT NULL  ,
"Unit" varchar(8) NOT NULL  ,
"Accuracy" real NOT NULL  ,
"DurationSec" integer NOT NULL  ,
"ErrorCount" integer NOT NULL  ,
"CreatedAt" datetime NOT NULL    );

CREATE INDEX ix_sessions_user_created ON `Sessions`(`UserId` Asc,`CreatedAt` Desc);

CREATE TABLE "TextSegmentations"(
"Id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
"TextId" integer NOT NULL  ,
"Engine" varchar(32) NOT NULL  ,
"ModelVersion" varchar(64) NULL  ,
"IsPrimary" bit NOT NULL  ,
"CreatedAt" datetime NOT NULL    );

CREATE INDEX ix_segmentations_text ON `TextSegmentations`(`TextId` Asc);

CREATE TABLE "TextSegments"(
"Id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
"SegmentationId" integer NOT NULL  ,
"Seq" integer NOT NULL  ,
"Token" varchar(64) NOT NULL  ,
"Pos" varchar(16) NULL  ,
"CharStart" integer NOT NULL  ,
"CharLength" integer NOT NULL  ,
"Reading" varchar(64) NULL  ,
"WordId" integer NULL    );

CREATE INDEX ix_segments_token ON `TextSegments`(`Token` Asc);
CREATE UNIQUE INDEX ux_segments_pass_seq ON `TextSegments`(`SegmentationId` Asc,`Seq` Asc);

CREATE TABLE "Texts"(
"Id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
"CategoryId" integer NOT NULL  ,
"Title" varchar(256) NOT NULL  ,
"Content" text NOT NULL  ,
"Level" integer NOT NULL  ,
"Chars" integer NOT NULL  ,
"Language" varchar(16) NOT NULL  ,
"CreatedBy" integer NULL  ,
"CreatedAt" datetime NOT NULL    );

CREATE TABLE "Translations"(
"Id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
"EntityType" varchar(32) NOT NULL  ,
"EntityId" integer NOT NULL  ,
"Field" varchar(32) NOT NULL  ,
"Locale" varchar(16) NOT NULL  ,
"Value" text NOT NULL  ,
"UpdatedAt" datetime NOT NULL    );

CREATE UNIQUE INDEX ux_translations ON `Translations`(`EntityType` Asc,`EntityId` Asc,`Field` Asc,`Locale` Asc);

CREATE TABLE "UserAchievements"(
"Id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
"UserId" integer NOT NULL  ,
"AchievementId" integer NOT NULL  ,
"UnlockedAt" datetime NOT NULL    );

CREATE UNIQUE INDEX ux_userachievements ON `UserAchievements`(`UserId` Asc,`AchievementId` Asc);

CREATE TABLE "UserWordMastery"(
"Id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
"UserId" integer NOT NULL  ,
"WordId" integer NOT NULL  ,
"Mastery" integer NOT NULL  ,
"NextReviewAt" datetime NULL    );

CREATE UNIQUE INDEX ux_mastery_user_word ON `UserWordMastery`(`UserId` Asc,`WordId` Asc);

CREATE TABLE "Users"(
"Id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
"Username" varchar(64) NOT NULL  ,
"PasswordHash" varchar(256) NOT NULL  ,
"KeyboardLayout" varchar(32) NOT NULL  ,
"UiLanguage" varchar(16) NOT NULL  ,
"CreatedAt" datetime NOT NULL    );

CREATE UNIQUE INDEX ux_users_username ON `Users`(`Username` Asc);

CREATE TABLE "WordExamples"(
"Id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
"WordId" integer NOT NULL  ,
"Sentence" text NOT NULL  ,
"Translation" text NULL    );

CREATE TABLE "Words"(
"Id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
"Text" varchar(128) NOT NULL  ,
"Phonetic" varchar(128) NULL  ,
"Pos" varchar(32) NULL  ,
"Zh" varchar(512) NULL  ,
"Topic" varchar(64) NULL  ,
"Freq" integer NOT NULL    );

CREATE INDEX ix_words_text ON `Words`(`Text` Asc);
