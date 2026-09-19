import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { Badge, Button, ConfigProvider, Pagination, Tag } from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'

import App from './App.vue'
import router from './router'
import './styles/app.css'

createApp(App)
  .use(createPinia())
  .use(router)
  .use(ConfigProvider)
  .use(Button)
  .use(Tag)
  .use(Badge)
  .use(Pagination)
  .mount('#app')
