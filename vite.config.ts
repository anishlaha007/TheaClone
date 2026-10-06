import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // NEXT_PUBLIC_* is accepted so the same env names work on Vercel as in
  // the Supabase dashboard. Only prefixed (public) variables reach the browser;
  // GEMINI_API_KEY has no prefix and stays on the server.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 1500,
  },
})
