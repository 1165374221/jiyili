import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    // 开发期把 /api、/ws 转发到本地后端，让前端代码始终同源访问。
    // 不这么做的话，前端就得知道"开发时后端在 3001、生产时在别处"，
    // 那正是之前 AppContext 里靠 window.location.port === '5173' 猜的那段。
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/ws': { target: 'ws://127.0.0.1:3001', ws: true },
    },
  },
})
