import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import { ErrorBox, Logo, Spinner } from './components/ui'
import { useStore } from './lib/store'
import { supabaseConfigured } from './lib/supabase'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'

const CreateKit = lazy(() => import('./pages/CreateKit'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const KitLayout = lazy(() => import('./pages/kit/KitLayout'))
const KitOverview = lazy(() => import('./pages/kit/Overview'))
const SmartStudy = lazy(() => import('./pages/kit/SmartStudy'))
const Flashcards = lazy(() => import('./pages/kit/Flashcards'))
const PracticeTest = lazy(() => import('./pages/kit/PracticeTest'))
const StudyGuide = lazy(() => import('./pages/kit/StudyGuide'))
const Summary = lazy(() => import('./pages/kit/Summary'))
const Podcast = lazy(() => import('./pages/kit/Podcast'))
const Games = lazy(() => import('./pages/kit/Games'))
const MatchGame = lazy(() => import('./pages/games/MatchGame'))
const StackerGame = lazy(() => import('./pages/games/StackerGame'))
const TermBuilder = lazy(() => import('./pages/games/TermBuilder'))
const Chat = lazy(() => import('./pages/kit/Chat'))
const CardsEditor = lazy(() => import('./pages/kit/CardsEditor'))

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-full place-items-center p-6">
      <div className="flex flex-col items-center gap-6">
        <Logo />
        {children}
      </div>
    </div>
  )
}

/** Signed-in area: waits for auth + the user's data before rendering. */
function RequireAuth({ children }: { children: ReactNode }) {
  const ready = useStore((s) => s.ready)
  const user = useStore((s) => s.user)
  const loaded = useStore((s) => s.loaded)
  const loadError = useStore((s) => s.loadError)
  const location = useLocation()
  if (!ready) return <FullScreen><Spinner label="Loading…" /></FullScreen>
  if (!user) return location.pathname === '/' ? <Landing /> : <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!loaded) return <FullScreen><Spinner label="Loading your study kits…" /></FullScreen>
  if (loadError)
    return (
      <FullScreen>
        <div className="max-w-md">
          <ErrorBox error={loadError} onRetry={() => window.location.reload()} />
        </div>
      </FullScreen>
    )
  return <>{children}</>
}

function MissingConfig() {
  return (
    <FullScreen>
      <div className="max-w-lg space-y-3 text-sm">
        <h1 className="font-display text-2xl font-bold">Almost there</h1>
        <p className="text-muted">
          This deployment has no Supabase configuration. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> (and the server-only <code>GEMINI_API_KEY</code>) in your
          environment, e.g. Vercel → Project → Settings → Environment Variables, then redeploy. See the README.
        </p>
      </div>
    </FullScreen>
  )
}

export default function App() {
  if (!supabaseConfigured) return <MissingConfig />
  const fallback = <Spinner className="py-20 justify-center" label="Loading…" />
  return (
    <BrowserRouter>
      <Suspense fallback={fallback}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="new" element={<CreateKit />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="kit/:id" element={<KitLayout />}>
              <Route index element={<KitOverview />} />
              <Route path="smart" element={<SmartStudy />} />
              <Route path="flashcards" element={<Flashcards />} />
              <Route path="test" element={<PracticeTest />} />
              <Route path="guide" element={<StudyGuide />} />
              <Route path="summary" element={<Summary />} />
              <Route path="podcast" element={<Podcast />} />
              <Route path="games" element={<Games />} />
              <Route path="games/match" element={<MatchGame />} />
              <Route path="games/stacker" element={<StackerGame />} />
              <Route path="games/builder" element={<TermBuilder />} />
              <Route path="chat" element={<Chat />} />
              <Route path="cards" element={<CardsEditor />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
