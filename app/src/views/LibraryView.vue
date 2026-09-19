<script setup lang="ts">
import { computed, ref } from 'vue'
import { ExportOutlined } from '@ant-design/icons-vue'
import { catTotal, LAYOUT_LABEL, TAG_BY_CAT } from '@/data/constants'
import { useLibraryStore } from '@/stores/library'
import { useGridLayout } from '@/composables/useGridLayout'

const library = useLibraryStore()
const { libCols, libRows } = useGridLayout()

const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)
const page = ref(1)

const rows = computed(() => library.texts.map((t) => ({
  ...t,
  tagColor: TAG_BY_CAT[t.category] || 'magenta',
  levelColor: t.level >= 'L5' ? '#c4922f' : '#8a9a5b',
})))

const aiFields = computed(() => {
  const a = library.ai
  return [
    { label: 'Title', value: a ? a.title : 'Pending', color: a ? '#1f1e1d' : '#b8b3a8' },
    { label: 'Category', value: a ? a.category + ' › ' + a.sub : 'Pending', color: a ? '#d97757' : '#b8b3a8' },
    { label: 'Level', value: a ? a.level : 'Pending', color: a ? '#a8763e' : '#b8b3a8' },
    { label: 'Chars', value: a ? String(a.chars) : '—', color: '#1f1e1d' },
  ]
})

const aiReason = computed(() => library.ai
  ? library.ai.reason
  : 'Paste content and hit Analyse; title, category and level are filled in and stay editable.')

const importModes: { id: 'ai' | 'manual'; label: string }[] = [
  { id: 'ai', label: 'AI categorise' },
  { id: 'manual', label: 'All to Custom' },
]
const importHint = computed(() => (library.importMode === 'ai'
  ? 'Each file gets a title, category and level'
  : 'Everything lands in Custom for manual filing'))
const importBtn = computed(() => (library.importFiles.length
  ? 'Import ' + library.importFiles.length + ' files'
  : 'Import'))

const dropTitle = computed(() => (dragOver.value ? 'Release to add' : 'Drop files here, or click to choose'))

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
  { id: 'sub', label: 'Topic' },
  { id: 'top', label: 'Group' },
]
const modalPlaceholder = computed(() => (library.catModal?.level === 'top'
  ? 'e.g. Japanese, Decks'
  : 'e.g. Finance, Banking, SQL'))
</script>

<template>
  <div class="page">
    <div class="head">
      <div class="counts">
        <span>Texts <b>128</b> </span>
        <span>Custom <b>46</b> </span>
        <a-badge status="success" text="Synced 2 min ago" />
      </div>
      <div class="head-actions">
        <div class="btn-slot" style="width: 96px" @click="library.importOpen = true">
          <a-button>Import files</a-button>
        </div>
        <div class="btn-slot" style="width: 118px" @click="library.composerOpen = !library.composerOpen">
          <a-button type="primary">{{ library.composerOpen ? 'Close' : 'Add text' }}</a-button>
        </div>
      </div>
    </div>

    <div v-if="library.composerOpen" class="card composer">
      <div class="composer-left">
        <span class="card-title">Paste text — AI names and files it</span>
        <textarea
          v-model="library.draft"
          class="textarea composer-input"
          placeholder="Paste any paragraph, code or Chinese article; language, category and level are detected"
        />
        <div class="composer-actions">
          <div class="btn-slot" style="width: 96px" @click="library.analyzeDraft()">
            <a-button>Analyse</a-button>
          </div>
          <div class="btn-slot" style="width: 96px" @click="library.saveDraft()">
            <a-button type="primary">Save</a-button>
          </div>
        </div>
      </div>
      <div class="composer-right">
        <span class="card-sub">AI result (editable)</span>
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
          <span class="card-title">Categories</span>
          <span class="card-sub">{{ library.catCount }}</span>
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
              >
              <span class="cat-layout">{{ LAYOUT_LABEL[c.layout] }}</span>
              <span class="cat-count">{{ catTotal(c) }}</span>
              <span class="remove" title="Delete group" @click="library.removeGroup(c.id)">×</span>
            </div>
            <div v-if="library.expanded[c.id]" class="children">
              <div v-for="x in c.children" :key="x.id" class="child-row">
                <span class="child-dash" />
                <input
                  class="input-ghost child-name"
                  :value="x.name"
                  @input="library.renameTopic(c.id, x.id, ($event.target as HTMLInputElement).value)"
                >
                <span class="cat-count">{{ x.count }}</span>
                <span class="remove" title="Delete topic" @click="library.removeTopic(c.id, x.id)">×</span>
              </div>
            </div>
          </div>
        </div>
        <div class="cats-foot" @click="library.openCatModal()">＋ New category</div>
      </div>

      <div class="card card--flush texts">
        <div class="texts-head">
          <span class="col-title">Title</span>
          <span class="col-level">Level</span>
          <span class="col-best">Best</span>
          <span class="col-action" />
        </div>
        <div class="scroll-y">
          <div v-for="t in rows" :key="t.title" class="text-row">
            <div class="col-title text-main">
              <span class="ell">{{ t.title }}</span>
              <span class="text-meta">
                <a-tag :color="t.tagColor">{{ t.category }}</a-tag>
                <span class="ell">{{ t.sub }} · {{ t.last }}</span>
              </span>
            </div>
            <span class="col-level" :style="{ color: t.levelColor, fontWeight: 500 }">{{ t.level }}</span>
            <span class="col-best nums">{{ t.best }}</span>
            <span class="col-action drill">Drill</span>
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
            <span class="card-title">Import files</span>
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
            <span class="card-sub">.txt / .md / .csv / .json · up to 2 MB each · multiple files</span>
            <input
              ref="fileInput"
              type="file"
              multiple
              accept=".txt,.md,.csv,.json"
              style="display: none"
              @change="onFiles"
            >
          </div>
          <div v-if="library.importFiles.length" class="file-list">
            <div v-for="(fl, i) in library.importFiles" :key="fl.name + i" class="file-row">
              <span class="file-ext">{{ fl.ext }}</span>
              <div class="file-main">
                <div class="file-name ell">{{ fl.name }}</div>
                <div class="file-note">{{ fl.size }}　{{ fl.note }}</div>
              </div>
              <span class="remove" @click="library.removeImportFile(i)">×</span>
            </div>
          </div>
          <div class="after-import">
            <span class="card-sub" style="white-space: nowrap">After import</span>
            <div class="seg">
              <div
                v-for="im in importModes"
                :key="im.id"
                class="seg-item seg-item--sm"
                :class="{ 'is-on': library.importMode === im.id }"
                @click="library.importMode = im.id"
              >{{ im.label }}</div>
            </div>
            <span class="card-sub">{{ importHint }}</span>
          </div>
          <div class="modal-foot">
            <div class="btn-slot" style="width: 80px" @click="closeImport()">
              <a-button>Cancel</a-button>
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
            <span class="card-title">New category</span>
            <span class="modal-close" @click="library.closeCatModal()">×</span>
          </div>
          <div class="field">
            <label>Level</label>
            <div class="seg" style="width: fit-content">
              <div
                v-for="l in modalLevels"
                :key="l.id"
                class="seg-item"
                :class="{ 'is-on': library.catModal.level === l.id }"
                @click="library.catModal.level = l.id"
              >{{ l.label }}</div>
            </div>
          </div>
          <div v-if="library.catModal.level === 'sub'" class="field">
            <label>Parent group</label>
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
            <label>Name</label>
            <input
              v-model="library.catModal.name"
              class="input"
              style="height: 36px"
              :placeholder="modalPlaceholder"
              autofocus
            >
          </div>
          <div class="modal-foot">
            <div class="btn-slot" style="width: 80px" @click="library.closeCatModal()">
              <a-button>Cancel</a-button>
            </div>
            <div class="btn-slot" style="width: 80px" @click="library.submitCat()">
              <a-button type="primary">Create</a-button>
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
.counts b { font-size: 14px; font-weight: 600; color: var(--text); }
.head-actions { display: flex; gap: 8px; align-items: center; }

.composer { flex-shrink: 0; display: flex; gap: 16px; align-items: stretch; }
.composer-left { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.composer-input { flex: 1; min-height: 88px; }
.composer-actions { display: flex; gap: 8px; }
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
.ai-reason { font-size: 12px; color: var(--text-3); line-height: 18px; margin-top: auto; }

.grid { flex: 1; min-height: 0; display: grid; gap: 12px; }

.cats { display: flex; flex-direction: column; min-height: 0; overflow: hidden; padding-bottom: 12px; }
.cats-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 0 10px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.cats-body { padding: 4px 0; }
.cat { display: flex; flex-direction: column; padding: 2px 0; }
.cat-row { display: flex; align-items: center; gap: 6px; height: 30px; font-size: 14px; border-radius: 4px; }
.caret {
  width: 16px;
  flex-shrink: 0;
  text-align: center;
  cursor: pointer;
  color: var(--text-3);
  font-size: 10px;
}
.cat-color { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
.cat-name { font-size: 14px; font-weight: 600; }
.cat-layout { font-size: 11px; color: var(--text-3); white-space: nowrap; }
.cat-count { font-size: 12px; color: var(--text-3); width: 26px; text-align: right; }
.remove { cursor: pointer; color: var(--muted); font-size: 14px; width: 14px; text-align: center; }

.children {
  margin-left: 11px;
  padding-left: 12px;
  border-left: 1px dashed var(--line-2);
  display: flex;
  flex-direction: column;
}
.child-row { display: flex; align-items: center; gap: 8px; height: 26px; font-size: 13px; }
.child-dash {
  width: 8px;
  height: 1px;
  background: var(--line-2);
  flex-shrink: 0;
  margin-left: -12px;
}
.child-name { font-size: 13px; color: var(--text-2); }

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

.texts { min-height: 0; display: flex; flex-direction: column; }
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
.col-title { flex: 1 1 0; min-width: 0; }
.col-level { width: 40px; flex-shrink: 0; }
.col-best { width: 52px; flex-shrink: 0; text-align: right; font-weight: 500; }
.col-action { width: 40px; flex-shrink: 0; text-align: right; }
.text-main { display: flex; flex-direction: column; gap: 2px; overflow: hidden; }
.text-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  color: var(--text-3);
}
.text-meta :deep(.ant-tag) { margin-inline-end: 0; }
.drill { color: var(--primary); cursor: pointer; white-space: nowrap; }
.texts-foot { display: flex; justify-content: flex-end; padding-top: 12px; flex-shrink: 0; }

/* ---- modals ---- */
.drop--files { padding: 28px 20px; }
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
.file-main { flex: 1; min-width: 0; }
.file-name { font-size: 13px; }
.file-note { font-size: 11px; color: var(--text-3); }
.after-import { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.seg-item--sm { padding: 4px 12px; font-size: 13px; }

.parents { display: flex; gap: 6px; flex-wrap: wrap; }
.pill--parent { padding: 4px 12px; font-size: 13px; background: var(--surface); }
.pill--parent.is-on {
  background: rgba(217, 119, 87, 0.08);
  color: var(--primary-active);
  border-color: var(--primary);
}
</style>
