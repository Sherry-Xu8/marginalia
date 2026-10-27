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

applyTheme()

registerSW({ immediate: true }) // lets the app work offline

loadData().then(() => {
  startAutoSync()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
