import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource-variable/hanken-grotesk/wght.css'
import '@fontsource-variable/newsreader/opsz.css'
import './index.css'
import App from './App.tsx'
import { loadData } from './lib/store'

registerSW({ immediate: true }) // lets the app work offline

loadData().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
