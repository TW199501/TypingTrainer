<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ExportOutlined } from '@ant-design/icons-vue'
import { catTotal, TAG_BY_CAT } from '@/data/constants'
import { useLibraryStore } from '@/stores/library'
import { useGridLayout } from '@/composables/useGridLayout'

const { t } = useI18n()
const library = useLibraryStore()
const { libCols, libRows } = useGridLayout()

const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)
const page = ref(1)

/** Texts the user added themselves have no personal best yet. */
const customCount = computed(() => library.texts.filter((x) => x.best === '—').length)

const rows = computed(() =>
  library.texts.map((t) => ({
    ...t,
    tagColor: TAG_BY_CAT[t.category] || 'magenta',
    levelColor: t.level >= 'L5' ? '#c4922f' : '#8a9a5b',
  })),
)

const aiFields = computed(() => {
  const a = library.ai
  return [
    {
      label: t('library.fieldTitle'),
      value: a ? a.title : t('common.pending'),
      color: a ? '#1f1e1d' : '#b8b3a8',
    },
    {
      label: t('library.fieldCategory'),
      value: a ? `${a.category} › ${a.sub}` : t('common.pending'),
      color: a ? '#d97757' : '#b8b3a8',
    },
    {
      label: t('library.fieldLevel'),
      value: a ? a.level : t('common.pending'),
      color: a ? '#a8763e' : '#b8b3a8',
    },
    { label: t('library.fieldChars'), value: a ? String(a.chars) : t('common.dash'), color: '#1f1e1d' },
  ]
})

const aiReason = computed(() => library.ai?.reason || t('library.aiIdle'))

const importModes: { id: 'ai' | 'manual'; label: string }[] = [
  { id: 'ai', label: t('library.import.modeAi') },
  { id: 'manual', label: t('library.import.modeManual') },
]
const importHint = computed(() =>
  library.importMode === 'ai' ? t('library.import.hintAi') : t('library.import.hintManual'),
)
const importBtn = computed(() =>
  library.importFiles.length
    ? t('library.import.submit', { count: library.importFiles.length })
    : t('library.import.submitEmpty'),
)

const dropTitle = computed(() => (dragOver.value ? t('library.import.release') : t('library.import.drop')))

function onDrop(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
  library.addFiles(Array.from(e.dataTransfer?.files || []))
}
function onFiles(e: Event) {
  library.addFiles(Array.from((e.target as HTMLInputElement).files || []))
}
function closeImport() {
  library.importOpen = false
  dragOver.value = false
}

const modalLevels: { id: 'sub' | 'top'; label: string }[] = [
  { id: 'sub', label: t('library.catModal.topic') },
  { id: 'top', label: t('library.catModal.group') },
]
const modalPlaceholder = computed(() =>
  library.catModal?.level === 'top'
    ? t('library.catModal.placeholderGroup')
    : t('library.catModal.placeholderTopic'),
)
</script>

<template>
  <div class="page">
    <div class="head">
      <div class="counts">
        <span
          >{{ t('library.texts') }} <b>{{ library.texts.length }}</b>
        </span>
        <span
          >{{ t('library.custom') }} <b>{{ customCount }}</b>
        </span>
        <a-badge status="success" :text="t('shell.synced', { minutes: 2 })" />
      </div>
      <div class="head-actions">
        <div class="btn-slot" style="width: 96px" @click="library.importOpen = true">
          <a-button>{{ t('library.importFiles') }}</a-button>
        </div>
        <div class="btn-slot" style="width: 118px" @click="library.composerOpen = !library.composerOpen">
          <a-button type="primary">{{
            library.composerOpen ? t('common.close') : t('library.addText')
          }}</a-button>
        </div>
      </div>
    </div>

    <div v-if="library.composerOpen" class="card composer">
      <div class="composer-left">
        <span class="card-title">{{ t('library.pasteTitle') }}</span>
        <textarea
          v-model="library.draft"
          class="textarea composer-input"
          :placeholder="t('library.pastePlaceholder')"
        />
        <div class="composer-actions">
          <div class="btn-slot" style="width: 96px" @click="library.analyzeDraft()">
            <a-button>{{ t('library.analyse') }}</a-button>
          </div>
          <div class="btn-slot" style="width: 96px" @click="library.saveDraft()">
            <a-button type="primary">{{ t('common.save') }}</a-button>
          </div>
        </div>
      </div>
      <div class="composer-right">
        <span class="card-sub">{{ t('library.aiResult') }}</span>
        <div v-for="a in aiFields" :key="a.label" class="ai-field">
          <span class="dim">{{ a.label }}</span>
          <span :style="{ color: a.color, fontWeight: 500 }">{{ a.value }}</span>
        </div>
        <span class="ai-reason">{{ aiReason }}</span>
      </div>
    </div>

    <div class="grid" :style="{ gridTemplateColumns: libCols, gridTemplateRows: libRows }">
      <div class="card card--flush cats">
        <div class="cats-head">
          <span class="card-title">{{ t('library.categories') }}</span>
          <span class="card-sub">{{ t('library.catCount', library.catCount) }}</span>
        </div>
        <div class="scroll-y cats-body">
          <div v-for="c in library.categories" :key="c.id" class="cat">
            <div class="cat-row">
              <span class="caret" @click="library.toggleExpanded(c.id)">
                {{ library.expanded[c.id] ? '▼' : '▶' }}
              </span>
              <span class="cat-color" :style="{ background: c.color }" />
              <input
                class="input-ghost cat-name"
                :value="c.name"
                @input="library.renameGroup(c.id, ($event.target as HTMLInputElement).value)"
              />
              <span class="cat-layout">{{ t(`layoutLabel.${c.layout}`) }}</span>
              <span class="cat-count">{{ catTotal(c) }}</span>
              <span class="remove" :title="t('library.deleteGroup')" @click="library.removeGroup(c.id)"
                >×</span
              >
            </div>
            <div v-if="library.expanded[c.id]" class="children">
              <div v-for="x in c.children" :key="x.id" class="child-row">
                <span class="child-dash" />
                <input
                  class="input-ghost child-name"
                  :value="x.name"
                  @input="library.renameTopic(c.id, x.id, ($event.target as HTMLInputElement).value)"
                />
                <span class="cat-count">{{ x.count }}</span>
                <span
                  class="remove"
                  :title="t('library.deleteTopic')"
                  @click="library.removeTopic(c.id, x.id)"
                  >×</span
                >
              </div>
            </div>
          </div>
        </div>
        <div class="cats-foot" @click="library.openCatModal()">{{ t('library.newCategory') }}</div>
      </div>

      <div class="card card--flush texts">
        <div class="texts-head">
          <span class="col-title">{{ t('library.colTitle') }}</span>
          <span class="col-level">{{ t('library.colLevel') }}</span>
          <span class="col-best">{{ t('library.colBest') }}</span>
          <span class="col-action" />
        </div>
        <div class="scroll-y">
          <div v-for="row in rows" :key="row.title" class="text-row">
            <div class="col-title text-main">
              <span class="ell">{{ row.title }}</span>
              <span class="text-meta">
                <a-tag :color="row.tagColor">{{ row.category }}</a-tag>
                <span class="ell">{{ row.sub }} · {{ row.last }}</span>
              </span>
            </div>
            <span class="col-level" :style="{ color: row.levelColor, fontWeight: 500 }">{{ row.level }}</span>
            <span class="col-best nums">{{ row.best }}</span>
            <span class="col-action drill">{{ t('common.drill') }}</span>
          </div>
        </div>
        <div class="texts-foot">
          <a-pagination v-model:current="page" :total="library.texts.length" :page-size="10" />
        </div>
      </div>
    </div>

    <!-- Import files -->
    <Teleport to="body">
      <div v-if="library.importOpen" class="mask">
        <div class="modal" style="width: 560px">
          <div class="modal-head">
            <span class="card-title">{{ t('library.import.title') }}</span>
            <span class="modal-close" @click="closeImport()">×</span>
          </div>
          <div
            class="drop drop--files"
            :class="{ 'is-over': dragOver }"
            @dragover.prevent="dragOver = true"
            @dragleave="dragOver = false"
            @drop="onDrop"
            @click="fileInput?.click()"
          >
            <span class="drop-icon"><ExportOutlined :style="{ fontSize: '18px' }" /></span>
            <span style="font-size: 14px">{{ dropTitle }}</span>
            <span class="card-sub">{{ t('library.import.accepts') }}</span>
            <input
              ref="fileInput"
              type="file"
              multiple
              accept=".txt,.md,.csv,.json"
              style="display: none"
              @change="onFiles"
            />
          </div>
          <div v-if="library.importFiles.length" class="file-list">
            <div v-for="(fl, i) in library.importFiles" :key="fl.name + i" class="file-row">
              <span class="file-ext">{{ fl.ext }}</span>
              <div class="file-main">
                <div class="file-name ell">{{ fl.name }}</div>
                <div class="file-note">{{ fl.size }}　{{ fl.note || t('library.import.emptyFile') }}</div>
              </div>
              <span class="remove" @click="library.removeImportFile(i)">×</span>
            </div>
          </div>
          <div class="after-import">
            <span class="card-sub" style="white-space: nowrap">{{ t('library.import.after') }}</span>
            <div class="seg">
              <div
                v-for="im in importModes"
                :key="im.id"
                class="seg-item seg-item--sm"
                :class="{ 'is-on': library.importMode === im.id }"
                @click="library.importMode = im.id"
              >
                {{ im.label }}
              </div>
            </div>
            <span class="card-sub">{{ importHint }}</span>
          </div>
          <div class="modal-foot">
            <div class="btn-slot" style="width: 80px" @click="closeImport()">
              <a-button>{{ t('common.cancel') }}</a-button>
            </div>
            <div class="btn-slot" style="width: 96px" @click="library.confirmImport()">
              <a-button type="primary">{{ importBtn }}</a-button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- New category -->
    <Teleport to="body">
      <div v-if="library.catModal" class="mask">
        <div class="modal" style="width: 440px">
          <div class="modal-head">
            <span class="card-title">{{ t('library.catModal.title') }}</span>
            <span class="modal-close" @click="library.closeCatModal()">×</span>
          </div>
          <div class="field">
            <label>{{ t('library.catModal.level') }}</label>
            <div class="seg" style="width: fit-content">
              <div
                v-for="l in modalLevels"
                :key="l.id"
                class="seg-item"
                :class="{ 'is-on': library.catModal.level === l.id }"
                @click="library.catModal.level = l.id"
              >
                {{ l.label }}
              </div>
            </div>
          </div>
          <div v-if="library.catModal.level === 'sub'" class="field">
            <label>{{ t('library.catModal.parent') }}</label>
            <div class="parents">
              <div
                v-for="c in library.categories"
                :key="c.id"
                class="pill pill--parent"
                :class="{ 'is-on': library.catModal.parent === c.id }"
                @click="library.catModal.parent = c.id"
              >
                <span class="dot" :style="{ background: c.color }" />{{ c.name }}
              </div>
            </div>
          </div>
          <div class="field">
            <label>{{ t('library.catModal.name') }}</label>
            <input
              v-model="library.catModal.name"
              class="input"
              style="height: 36px"
              :placeholder="modalPlaceholder"
              autofocus
            />
          </div>
          <div class="modal-foot">
            <div class="btn-slot" style="width: 80px" @click="library.closeCatModal()">
              <a-button>{{ t('common.cancel') }}</a-button>
            </div>
            <div class="btn-slot" style="width: 80px" @click="library.submitCat()">
              <a-button type="primary">{{ t('common.create') }}</a-button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
.counts {
  display: flex;
  gap: 16px;
  align-items: center;
  font-size: 12px;
  color: var(--text-3);
}
.counts b {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.head-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.composer {
  flex-shrink: 0;
  display: flex;
  gap: 16px;
  align-items: stretch;
}
.composer-left {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.composer-input {
  flex: 1;
  min-height: 88px;
}
.composer-actions {
  display: flex;
  gap: 8px;
}
.composer-right {
  width: 280px;
  flex-shrink: 0;
  border-left: 1px solid var(--line);
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ai-field {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  padding: 6px 0;
  border-bottom: 1px solid var(--line);
}
.ai-reason {
  font-size: 12px;
  color: var(--text-3);
  line-height: 18px;
  margin-top: auto;
}

.grid {
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 12px;
}

.cats {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding-bottom: 12px;
}
.cats-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 0 10px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.cats-body {
  padding: 4px 0;
}
.cat {
  display: flex;
  flex-direction: column;
  padding: 2px 0;
}
.cat-row {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  font-size: 14px;
  border-radius: 4px;
}
.caret {
  width: 16px;
  flex-shrink: 0;
  text-align: center;
  cursor: pointer;
  color: var(--text-3);
  font-size: 10px;
}
.cat-color {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
}
.cat-name {
  font-size: 14px;
  font-weight: 600;
}
.cat-layout {
  font-size: 11px;
  color: var(--text-3);
  white-space: nowrap;
}
.cat-count {
  font-size: 12px;
  color: var(--text-3);
  width: 26px;
  text-align: right;
}
.remove {
  cursor: pointer;
  color: var(--muted);
  font-size: 14px;
  width: 14px;
  text-align: center;
}

.children {
  margin-left: 11px;
  padding-left: 12px;
  border-left: 1px dashed var(--line-2);
  display: flex;
  flex-direction: column;
}
.child-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 26px;
  font-size: 13px;
}
.child-dash {
  width: 8px;
  height: 1px;
  background: var(--line-2);
  flex-shrink: 0;
  margin-left: -12px;
}
.child-name {
  font-size: 13px;
  color: var(--text-2);
}

.cats-foot {
  padding-top: 10px;
  border-top: 1px solid var(--line);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 42px;
  cursor: pointer;
  color: var(--primary);
  font-size: 13px;
}

.texts {
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.texts-head {
  display: flex;
  gap: 12px;
  padding: 14px 0 12px;
  color: var(--text-3);
  border-bottom: 1px solid var(--line);
  font-size: 14px;
  flex-shrink: 0;
}
.text-row {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--line);
  font-size: 14px;
}
.col-title {
  flex: 1 1 0;
  min-width: 0;
}
.col-level {
  width: 40px;
  flex-shrink: 0;
}
.col-best {
  width: 52px;
  flex-shrink: 0;
  text-align: right;
  font-weight: 500;
}
.col-action {
  width: 40px;
  flex-shrink: 0;
  text-align: right;
}
.text-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}
.text-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  color: var(--text-3);
}
.text-meta :deep(.ant-tag) {
  margin-inline-end: 0;
}
.drill {
  color: var(--primary);
  cursor: pointer;
  white-space: nowrap;
}
.texts-foot {
  display: flex;
  justify-content: flex-end;
  padding-top: 12px;
  flex-shrink: 0;
}

/* ---- modals ---- */
.drop--files {
  padding: 28px 20px;
}
.drop-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(217, 119, 87, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary);
}
.file-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 160px;
  overflow-y: auto;
}
.file-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
}
.file-ext {
  width: 26px;
  height: 26px;
  border-radius: 4px;
  flex-shrink: 0;
  background: var(--key-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: var(--text-3);
}
.file-main {
  flex: 1;
  min-width: 0;
}
.file-name {
  font-size: 13px;
}
.file-note {
  font-size: 11px;
  color: var(--text-3);
}
.after-import {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.seg-item--sm {
  padding: 4px 12px;
  font-size: 13px;
}

.parents {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.pill--parent {
  padding: 4px 12px;
  font-size: 13px;
  background: var(--surface);
}
.pill--parent.is-on {
  background: rgba(217, 119, 87, 0.08);
  color: var(--primary-active);
  border-color: var(--primary);
}
</style>
