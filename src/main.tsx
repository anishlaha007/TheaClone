import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/bricolage-grotesque'
import './index.css'
import App from './App'
import { applyTheme, initStore } from './lib/store'
import { supabaseConfigured } from './lib/supabase'

applyTheme()
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme())
if (supabaseConfigured) initStore()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
