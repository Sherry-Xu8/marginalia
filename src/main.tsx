import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource-variable/hanken-grotesk/wght.css'
import '@fontsource-variable/newsreader/opsz.css'
import './index.css'
import App from './App.tsx'
import { loadData } from './lib/store'
import { applyTheme } from './lib/theme'
import { startAutoSync } from './lib/sync'
import { toast } from './lib/toast'

applyTheme()

// Lets the app work offline. When a newer version has been downloaded, say so instead of
// quietly carrying on with the old one; and look for new versions now and then.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    toast('A new version of Marginalia is ready.', { sticky: true, action: { label: 'Refresh', run: () => void updateSW(true) } })
  },
  onRegisteredSW(_url, reg) {
    if (!reg) return
    const check = () => void reg.update().catch(() => {})
    setInterval(check, 60 * 60 * 1000)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
  },
})

loadData().then(() => {
  startAutoSync()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
