<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useDictionaryStore } from '@/stores/dictionary'
import { useLibraryStore } from '@/stores/library'
import { useSessionStore } from '@/stores/session'
import { useGridLayout } from '@/composables/useGridLayout'
import ToggleSwitch from '@/components/ToggleSwitch.vue'

const { t } = useI18n()
const router = useRouter()
const dictionary = useDictionaryStore()
const library = useLibraryStore()
const session = useSessionStore()
const { libCols, libRows } = useGridLayout()

onMounted(() => dictionary.load())

const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)

const vocabCat = computed(
  () => library.categories.find((c) => c.kind === 'bilingual') || library.categories[0],
)

/** The topic list doubles as the chapters of a thematic dictionary. */
const topics = computed(() =>
  [{ name: t('dict.all'), count: dictionary.entries.length }].concat(
    vocabCat.value.children.map((x) => ({
      name: x.name,
      count: dictionary.entries.filter((d) => d.cat === x.name).length,
    })),
  ),
)

const rows = computed(() => {
  const q = dictionary.query.trim().toLowerCase()
  const tp = dictionary.topic
  return dictionary.entries
    .filter(
      (d) =>
        (!tp || tp === t('dict.all') || d.cat === tp) &&
        (!q || d.w.includes(q) || d.zh.includes(q) || d.cat.includes(q)),
    )
    .map((d) => ({
      ...d,
      masteryLabel: d.mastery + '%',
      bar: d.mastery + '%',
      barColor: d.mastery >= 70 ? '#8a9a5b' : d.mastery >= 45 ? '#c4922f' : '#bc4b3c',
    }))
})

/** "Drill" rotates the vocabulary run so it starts on the clicked word. */
function drill(word: string, cat: string) {
  const subId = (vocabCat.value.children.find((x) => x.name === cat) || vocabCat.value.children[0])?.id || ''
  session.reset({ mode: vocabCat.value.id, sub: subId, dictStart: word, idx: 0 })
  router.push({ name: 'practice' })
}

const allLabel = computed(() => t('dict.all'))

const sources = computed(() => [
  { id: 'ecdict', name: 'ECDICT', note: t('dict.importModal.ecdict') },
  { id: 'cedict', name: 'CC-CEDICT', note: t('dict.importModal.cedict') },
  { id: 'wordnet', name: 'WordNet', note: t('dict.importModal.wordnet') },
  { id: 'custom', name: t('dict.importModal.customFile'), note: t('dict.importModal.customNote') },
])

const mapFields = computed<[key: string, label: string][]>(() => [
  ['w', t('dict.importModal.colWord')],
  ['zh', t('dict.importModal.colMeaning')],
  ['ph', t('dict.importModal.colPhonetic')],
  ['cat', t('dict.importModal.colTopic')],
])

const dropTitle = computed(() =>
  dragOver.value
    ? t('dict.importModal.release')
    : dictionary.file
      ? t('dict.importModal.another')
      : t('dict.importModal.drop'),
)

const importBtn = computed(() =>
  dictionary.file
    ? t('dict.importModal.submit', { count: dictionary.file.rows })
    : t('dict.importModal.submitEmpty'),
)

function onDrop(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
  dictionary.loadFile(e.dataTransfer?.files?.[0])
}
function onFile(e: Event) {
  dictionary.loadFile((e.target as HTMLInputElement).files?.[0])
}
function closeImport() {
  dictionary.closeImport()
  dragOver.value = false
}
</script>

<template>
  <div class="page">
    <div class="head">
      <div class="head-left">
        <input v-model="dictionary.query" class="input search" :placeholder="t('dict.search')" />
        <span class="card-sub">{{ t('dict.count', { count: dictionary.entries.length }) }}</span>
      </div>
      <!-- Wider than the 96px used elsewhere so the label is not clipped. -->
      <div class="btn-slot" style="width: 152px" @click="dictionary.importOpen = true">
        <a-button type="primary">{{ t('dict.import') }}</a-button>
      </div>
    </div>

    <div class="grid" :style="{ gridTemplateColumns: libCols, gridTemplateRows: libRows }">
      <div class="card card--flush topics">
        <div class="topics-head">{{ t('dict.topics') }}</div>
        <div class="scroll-y" style="padding: 4px 0">
          <div
            v-for="topic in topics"
            :key="topic.name"
            class="topic"
            :class="{ 'is-on': (dictionary.topic || allLabel) === topic.name }"
            @click="dictionary.topic = topic.name"
          >
            <span class="ell" style="flex: 1; min-width: 0">{{ topic.name }}</span>
            <span class="topic-count">{{ topic.count }}</span>
          </div>
        </div>
      </div>

      <div class="card card--flush words">
        <div class="words-head">
          <span class="col-word">{{ t('dict.colWord') }}</span>
          <span class="col-zh">{{ t('dict.colChinese') }}</span>
          <span class="col-mastery">{{ t('dict.colMastery') }}</span>
          <span class="col-action" />
        </div>
        <div class="scroll-y">
          <div v-for="d in rows" :key="d.w" class="word-row">
            <span class="col-word word-main">
              <span class="ell" style="font-weight: 500">
                {{ d.w }}<span class="word-pos">{{ d.pos }}</span>
              </span>
              <span class="word-ph ell">{{ d.ph }}</span>
            </span>
            <span class="col-zh dim-2 ell">{{ d.zh }}</span>
            <span class="col-mastery mastery">
              <span class="small dim">{{ d.masteryLabel }}</span>
              <span class="mastery-bar"><i :style="{ width: d.bar, background: d.barColor }" /></span>
            </span>
            <span class="col-action drill" @click="drill(d.w, d.cat)">{{ t('common.drill') }}</span>
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="dictionary.importOpen" class="mask">
        <div class="modal" style="width: 600px">
          <div class="modal-head">
            <span style="font-size: 16px; font-weight: 600">{{ t('dict.importModal.title') }}</span>
            <span class="modal-close" @click="closeImport()">×</span>
          </div>

          <div class="field">
            <label>{{ t('dict.importModal.source') }}</label>
            <div class="sources">
              <div
                v-for="s in sources"
                :key="s.id"
                class="source"
                :class="{ 'is-on': dictionary.source === s.id }"
                @click="dictionary.source = s.id"
              >
                <div class="source-name ell">{{ s.name }}</div>
                <div class="source-note ell">{{ s.note }}</div>
              </div>
            </div>
          </div>

          <div
            class="drop drop--dict"
            :class="{ 'is-over': dragOver }"
            @dragover.prevent="dragOver = true"
            @dragleave="dragOver = false"
            @drop="onDrop"
            @click="fileInput?.click()"
          >
            <span style="font-size: 13px">{{ dropTitle }}</span>
            <span style="font-size: 11px; color: var(--text-3)">{{ t('dict.importModal.accepts') }}</span>
            <input
              ref="fileInput"
              type="file"
              accept=".csv,.tsv,.json,.txt"
              style="display: none"
              @change="onFile"
            />
          </div>

          <div v-if="dictionary.file" class="mapping">
            <div class="mapping-head">
              <span class="ell">{{ dictionary.file.name }}</span>
              <span style="white-space: nowrap">
                {{ t('dict.importModal.detected', { count: dictionary.file.rows }) }}
              </span>
            </div>
            <div class="mapping-fields">
              <div v-for="[key, label] in mapFields" :key="key" class="field">
                <span class="mapping-label ell">{{ label }}</span>
                <select v-model="dictionary.map[key]" class="mapping-select">
                  <option v-for="co in dictionary.file.cols" :key="co" :value="co">{{ co }}</option>
                </select>
              </div>
            </div>
            <div class="preview">
              <div class="preview-head">
                <span style="flex: 1; min-width: 0">{{ t('dict.colWord') }}</span>
                <span style="flex: 1; min-width: 0">{{ t('dict.colChinese') }}</span>
                <span style="width: 76px; flex-shrink: 0">{{ t('dict.importModal.previewTopic') }}</span>
              </div>
              <div v-for="(pv, i) in dictionary.file.preview" :key="i" class="preview-row">
                <span class="ell" style="flex: 1; min-width: 0">{{ pv.w }}</span>
                <span class="ell dim-2" style="flex: 1; min-width: 0">{{ pv.zh }}</span>
                <span class="ell dim" style="width: 76px; flex-shrink: 0">{{ pv.cat }}</span>
              </div>
            </div>
          </div>

          <div class="dict-foot">
            <div class="dedupe" @click="dictionary.dedupe = !dictionary.dedupe">
              <ToggleSwitch :model-value="dictionary.dedupe" size="sm" />
              <span class="small dim-2">{{ t('dict.importModal.keepMastery') }}</span>
            </div>
            <div style="display: flex; gap: 8px">
              <div class="btn-slot" style="width: 80px" @click="closeImport()">
                <a-button>{{ t('common.cancel') }}</a-button>
              </div>
              <div class="btn-slot" style="width: 96px" @click="dictionary.confirmImport()">
                <a-button type="primary">{{ importBtn }}</a-button>
              </div>
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
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
}
.head-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.search {
  width: 240px;
  max-width: 44vw;
  height: 32px;
}

.grid {
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 12px;
}

.topics {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding: 0 12px 10px;
}
.topics-head {
  padding: 14px 4px 10px;
  font-size: 14px;
  font-weight: 600;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.topic {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-2);
}
.topic.is-on {
  background: rgba(217, 119, 87, 0.1);
  color: var(--primary-active);
}
.topic-count {
  font-size: 12px;
  opacity: 0.7;
}

.words {
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.words-head {
  display: flex;
  gap: 12px;
  padding: 14px 0 12px;
  color: var(--text-3);
  border-bottom: 1px solid var(--line);
  font-size: 14px;
  flex-shrink: 0;
}
.word-row {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
  font-size: 14px;
}
.col-word {
  flex: 2 1 0;
  min-width: 0;
}
.col-zh {
  flex: 1.4 1 0;
  min-width: 0;
}
.col-mastery {
  width: 58px;
  flex-shrink: 0;
}
.col-action {
  width: 52px;
  flex-shrink: 0;
  text-align: right;
}
.word-main {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.word-pos {
  font-size: 11px;
  color: var(--text-3);
  margin-left: 6px;
}
.word-ph {
  font-size: 11px;
  color: var(--text-3);
}
.mastery {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}
.mastery-bar {
  width: 100%;
  height: 5px;
  border-radius: 100px;
  background: var(--track);
  overflow: hidden;
}
.mastery-bar > i {
  display: block;
  height: 5px;
  border-radius: 100px;
}
.drill {
  color: var(--primary);
  cursor: pointer;
  white-space: nowrap;
}

/* ---- import dialog ---- */
.sources {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.source {
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid var(--line-2);
  background: var(--surface);
  min-width: 0;
}
.source.is-on {
  border-color: var(--primary);
  background: rgba(217, 119, 87, 0.08);
}
.source-name {
  font-size: 13px;
  font-weight: 500;
}
.source.is-on .source-name {
  color: var(--primary-active);
}
.source-note {
  font-size: 11px;
  color: var(--text-3);
}

.drop--dict {
  padding: 20px;
  gap: 4px;
}

.mapping {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mapping-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-3);
}
.mapping-fields {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.mapping-label {
  font-size: 11px;
  color: var(--text-3);
}
.mapping-select {
  height: 30px;
  border-radius: 6px;
  border: 1px solid var(--line-2);
  padding: 0 6px;
  font-size: 12px;
  font-family: inherit;
  color: var(--text);
  background: var(--surface);
  outline: none;
}
.preview {
  border: 1px solid var(--line);
  border-radius: 6px;
  overflow: hidden;
}
.preview-head {
  display: flex;
  gap: 10px;
  padding: 6px 10px;
  background: var(--bg);
  font-size: 11px;
  color: var(--text-3);
}
.preview-row {
  display: flex;
  gap: 10px;
  padding: 6px 10px;
  font-size: 12px;
  border-top: 1px solid var(--line);
}

.dict-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.dedupe {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
</style>
