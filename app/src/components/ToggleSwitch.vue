<script setup lang="ts">
/** The prototype's hand-rolled switch: 40×20 in dialogs, 44×22 in settings rows. */
const props = withDefaults(defineProps<{ modelValue: boolean; size?: 'sm' | 'md' }>(), { size: 'md' })
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()
</script>

<template>
  <span
    class="switch"
    :class="[props.size === 'sm' ? 'switch--sm' : 'switch--md', { 'is-on': props.modelValue }]"
    role="switch"
    :aria-checked="props.modelValue"
    @click="emit('update:modelValue', !props.modelValue)"
  ><i /></span>
</template>

<style scoped>
.switch {
  border-radius: 100px;
  position: relative;
  background: var(--muted);
  flex-shrink: 0;
  display: inline-block;
  cursor: pointer;
}
.switch > i {
  position: absolute;
  top: 2px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 4px rgba(0, 35, 11, 0.2);
  transition: left 0.15s ease-in-out;
}
.switch.is-on { background: var(--primary); }

.switch--sm { width: 40px; height: 20px; }
.switch--sm > i { width: 16px; height: 16px; left: 2px; }
.switch--sm.is-on > i { left: 22px; }

.switch--md { width: 44px; height: 22px; }
.switch--md > i { width: 18px; height: 18px; left: 2px; }
.switch--md.is-on > i { left: 24px; }
</style>
