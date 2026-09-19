<script setup lang="ts">
import { computed } from 'vue'
import { MODELS, type Provider } from '@/data/constants'
import { useAiStore } from '@/stores/ai'
import { useGridLayout } from '@/composables/useGridLayout'
import ToggleSwitch from '@/components/ToggleSwitch.vue'

const ai = useAiStore()
const { aiCols } = useGridLayout()

const tabs: { id: 'conn' | 'param' | 'auto'; label: string }[] = [
  { id: 'conn', label: 'Connection' },
  { id: 'param', label: 'Parameters' },
  { id: 'auto', label: 'Automation' },
]

const providers: Provider[] = ['Claude', 'OpenAI', 'Gemini', 'Custom']

const statusText = computed(() => (ai.cfg.status === 'connected'
  ? 'Connected · last call 2 min ago'
  : 'Not tested yet'))

/** The field shows the current model id until the user starts searching. */
const modelQuery = computed({
  get: () => (ai.modelQuery === null ? ai.cfg.model : ai.modelQuery),
  set: (v: string) => { ai.modelQuery = v; ai.modelOpen = true },
})

const filteredModels = computed(() => {
  const q = (ai.modelQuery || '').trim().toLowerCase()
  return (MODELS[ai.cfg.provider] || []).filter(
    (m) => !q || m[0].toLowerCase().includes(q) || m[1].toLowerCase().includes(q))
})

const numFields: [key: 'timeout' | 'retry' | 'concurrency', label: string][] = [
  ['timeout', 'Timeout (s)'],
  ['retry', 'Retries'],
  ['concurrency', 'Concurrency'],
]

const langs = [
  { id: 'en', label: 'English' },
  { id: 'zh-TW', label: '繁體中文' },
  { id: 'zh-CN', label: '简体中文' },
]

const options: { key: 'offlineFallback' | 'sendStats'; label: string; hint: string }[] = [
  { key: 'offlineFallback', label: 'Fall back to local rules', hint: 'Offline keyword-based categorising' },
  { key: 'sendStats', label: 'Send practice stats', hint: 'Error-key distribution only, never text' },
]

const features: { key: 'autoTitle' | 'autoCat' | 'autoLevel' | 'genSentence' | 'genVocab' | 'rewrite'; label: string; hint: string }[] = [
  { key: 'autoTitle', label: 'Auto title', hint: 'Names pasted text in under 18 characters' },
  { key: 'autoCat', label: 'Auto category', hint: 'Files into group and topic; always overridable' },
  { key: 'autoLevel', label: 'Auto level', hint: 'Scores L1–L6 by symbols, length and rare words' },
  { key: 'genSentence', label: 'Generate examples', hint: 'Writes a drillable sentence when one is missing' },
  { key: 'genVocab', label: 'Extract new words', hint: 'Pulls low-mastery words into the dictionary' },
  { key: 'rewrite', label: 'Rewrite for weak keys', hint: 'Weaves your problem keys into practice text' },
]

const usage = [
  { label: 'Calls this month', value: '286', hint: 'Limit 2,000', color: undefined },
  { label: 'Avg latency', value: '1.4s', hint: 'Incl. network', color: undefined },
  { label: 'Override rate', value: '11%', hint: 'Categorising is accurate', color: '#8a9a5b' },
]

const tempLabel = computed(() => (Number(ai.cfg.temp) / 100).toFixed(2))
const promptText = computed({
  get: () => ai.prompts[ai.promptIdx]?.text || '',
  set: (v: string) => { ai.prompts = ai.prompts.map((p, i) => (i === ai.promptIdx ? { ...p, text: v } : p)) },
})
</script>

<template>
  <div class="page">
    <div class="seg tabs">
      <div
        v-for="t in tabs"
        :key="t.id"
        class="seg-item"
        :class="{ 'is-on': ai.tab === t.id }"
        @click="ai.tab = t.id"
      >{{ t.label }}</div>
    </div>

    <!-- Connection -->
    <div v-if="ai.tab === 'conn'" class="single">
      <div class="card panel">
        <div class="panel-head">
          <span class="card-title" style="white-space: nowrap">Connection</span>
          <span class="card-sub ell">{{ statusText }}</span>
        </div>
        <div class="two-col">
          <div class="field">
            <label>Provider</label>
            <div class="seg">
              <div
                v-for="p in providers"
                :key="p"
                class="seg-item seg-item--fill"
                :class="{ 'is-on': ai.cfg.provider === p }"
                @click="ai.pickProvider(p)"
              >{{ p }}</div>
            </div>
          </div>

          <div class="field">
            <label>Model</label>
            <div class="model-picker">
              <input
                v-model="modelQuery"
                class="input model-input"
                :class="{ 'is-open': ai.modelOpen }"
                placeholder="Search models"
                @focus="ai.modelOpen = true; ai.modelQuery = ''"
              >
              <span class="model-caret" @click="ai.modelOpen = !ai.modelOpen; ai.modelQuery = ai.modelOpen ? '' : null" />
              <div v-if="ai.modelOpen" class="model-menu">
                <div
                  v-for="m in filteredModels"
                  :key="m[0]"
                  class="model-item"
                  :class="{ 'is-on': ai.cfg.model === m[0] }"
                  @click="ai.pickModel(m[0])"
                >
                  <div class="model-label ell">{{ m[1] }}</div>
                  <div class="model-id mono ell">{{ m[0] }}</div>
                </div>
                <div v-if="!filteredModels.length" class="model-empty">No matching model</div>
              </div>
            </div>
          </div>

          <div class="field">
            <label>API base URL</label>
            <input v-model="ai.cfg.url" class="input input--code" placeholder="https://api.anthropic.com/v1">
          </div>

          <div class="field">
            <label>API key</label>
            <input v-model="ai.cfg.key" class="input input--code">
            <span class="note">Stored locally only</span>
          </div>
        </div>
        <div class="panel-foot">
          <div class="btn-slot" style="width: 96px"><a-button>Test</a-button></div>
          <div class="btn-slot" style="width: 96px"><a-button type="primary">Save</a-button></div>
        </div>
      </div>
    </div>

    <!-- Parameters -->
    <div v-else-if="ai.tab === 'param'" class="single">
      <div class="card panel">
        <div class="card-title" style="flex-shrink: 0">Parameters</div>
        <div class="two-col" style="padding-top: 6px">
          <div class="temp-row">
            <div class="field" style="flex: 1">
              <label>Temperature {{ tempLabel }}</label>
              <input v-model="ai.cfg.temp" type="range" min="0" max="100" class="range">
            </div>
            <div class="field" style="width: 112px; flex-shrink: 0">
              <label>Max chars</label>
              <input v-model="ai.cfg.maxChars" class="input input--sm">
            </div>
          </div>

          <div class="nums-grid">
            <div v-for="[key, label] in numFields" :key="key" class="field">
              <label class="ell">{{ label }}</label>
              <input v-model="ai.cfg[key]" class="input input--sm">
            </div>
          </div>

          <div class="field">
            <label>Output language</label>
            <div class="seg">
              <div
                v-for="l in langs"
                :key="l.id"
                class="seg-item seg-item--fill"
                :class="{ 'is-on': ai.cfg.lang === l.id }"
                @click="ai.cfg.lang = l.id"
              >{{ l.label }}</div>
            </div>
          </div>

          <div class="opts">
            <div v-for="o in options" :key="o.key" class="opt">
              <div style="min-width: 0">
                <div style="font-size: 13px">{{ o.label }}</div>
                <div class="note ell">{{ o.hint }}</div>
              </div>
              <ToggleSwitch v-model="ai.cfg[o.key]" size="sm" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Automation -->
    <div v-else class="split" :style="{ gridTemplateColumns: aiCols }">
      <div class="card panel">
        <div class="card-title" style="flex-shrink: 0">Automation</div>
        <div class="scroll-y" style="padding-top: 4px">
          <div v-for="f in features" :key="f.key" class="feature">
            <div style="min-width: 0">
              <div style="font-size: 14px">{{ f.label }}</div>
              <div class="card-sub ell">{{ f.hint }}</div>
            </div>
            <ToggleSwitch v-model="ai.cfg[f.key]" />
          </div>
        </div>
      </div>

      <div class="card panel" style="gap: 8px">
        <div class="prompts-head">
          <span class="card-title" style="white-space: nowrap">Prompts</span>
          <span class="add-prompt" @click="ai.addPrompt()">+ New prompt</span>
        </div>
        <div class="prompt-tabs">
          <div
            v-for="(p, i) in ai.prompts"
            :key="p.name + i"
            class="pill pill--prompt"
            :class="{ 'is-on': ai.promptIdx === i }"
            @click="ai.promptIdx = i"
          >{{ p.name }}</div>
        </div>
        <textarea v-model="promptText" class="textarea prompt-text" />
        <div class="usage">
          <div v-for="u in usage" :key="u.label" class="usage-card">
            <div class="card-sub ell">{{ u.label }}</div>
            <div class="usage-value" :style="u.color ? { color: u.color } : undefined">{{ u.value }}</div>
            <div class="note ell">{{ u.hint }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tabs { width: fit-content; flex-shrink: 0; }

.single { flex: 1; min-height: 0; display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr); }
.split { flex: 1; min-height: 0; display: grid; gap: 12px; }
.panel { display: flex; flex-direction: column; min-height: 0; }
.panel-head { display: flex; flex-direction: column; gap: 2px; flex-shrink: 0; }

.two-col {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px 20px;
  align-content: start;
  padding-top: 10px;
}
.panel-foot {
  display: flex;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
  margin-top: 10px;
  flex-shrink: 0;
}

.seg-item--fill {
  flex: 1;
  min-width: 0;
  padding: 4px 6px;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.input--code { font-size: 13px; font-family: var(--font-mono); }
.note { font-size: 11px; color: var(--text-3); line-height: 16px; }

.model-picker { position: relative; }
.model-input { padding-right: 30px; }
.model-input.is-open { border-color: var(--primary); }
.model-caret {
  position: absolute;
  right: 10px;
  top: 13px;
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 5px solid var(--text-3);
  cursor: pointer;
}
.model-menu {
  position: absolute;
  left: 0;
  right: 0;
  top: 38px;
  z-index: 30;
  max-height: 180px;
  overflow-y: auto;
  background: var(--surface);
  border-radius: 6px;
  box-shadow: var(--overlay-shadow);
  padding: 4px;
}
.model-item {
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  line-height: 18px;
}
.model-item.is-on { background: rgba(217, 119, 87, 0.1); }
.model-item.is-on .model-label { color: var(--primary-active); font-weight: 600; }
.model-id { font-size: 11px; color: var(--text-3); }
.model-empty { padding: 10px; font-size: 12px; color: var(--text-3); text-align: center; }

.temp-row { display: flex; gap: 12px; }
.range { width: 100%; accent-color: var(--primary); }
.nums-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.opts { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 4px 0;
}

.feature {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--line);
}

.prompts-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
}
.add-prompt { font-size: 12px; color: var(--primary); cursor: pointer; white-space: nowrap; }
.prompt-tabs { display: flex; gap: 6px; flex-wrap: wrap; flex-shrink: 0; }
.pill--prompt { padding: 3px 10px; background: var(--surface); }
.pill--prompt.is-on {
  background: rgba(217, 119, 87, 0.1);
  color: var(--primary-active);
  border-color: var(--primary);
}
.prompt-text { flex: 1; min-height: 52px; font-size: 13px; line-height: 20px; padding: 8px 12px; }

.usage {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  flex-shrink: 0;
}
.usage-card { border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; min-width: 0; }
.usage-value { font-size: 18px; line-height: 24px; font-weight: 600; }
</style>
