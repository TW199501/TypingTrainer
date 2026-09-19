import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

// Hash history keeps deep links working when the build is wrapped by Tauri.
const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/practice' },
  { path: '/practice', name: 'practice', component: () => import('@/views/PracticeView.vue') },
  { path: '/result', name: 'result', component: () => import('@/views/ResultView.vue') },
  { path: '/coach', name: 'coach', component: () => import('@/views/CoachView.vue') },
  { path: '/library', name: 'library', component: () => import('@/views/LibraryView.vue') },
  { path: '/dictionary', name: 'dict', component: () => import('@/views/DictionaryView.vue') },
  { path: '/stats', name: 'stats', component: () => import('@/views/StatsView.vue') },
  { path: '/progress', name: 'leaderboard', component: () => import('@/views/ProgressView.vue') },
  { path: '/ai', name: 'ai', component: () => import('@/views/AiView.vue') },
  { path: '/models', name: 'models', component: () => import('@/views/ModelsView.vue') },
  { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue') },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
