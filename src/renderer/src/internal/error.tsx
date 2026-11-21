import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles.css'

const params = new URLSearchParams(location.search)
const failedUrl = params.get('url') ?? ''
const code = Number(params.get('code') ?? 0)
const description = params.get('desc') ?? ''

const host = (() => {
  try {
    return new URL(failedUrl).host
  } catch {
    return failedUrl
  }
})()

/** What went wrong, in words (Chromium net error codes). */
function explain(): { title: string; detail: string } {
  if (code === -106) return { title: "Vous n'êtes pas connecté à Internet", detail: 'Vérifiez votre connexion Wi-Fi ou réseau, puis réessayez.' }
  if (code === -105 || code === -137)
    return { title: 'Ce site est inaccessible', detail: `Impossible de trouver l'adresse du serveur de ${host}.` }
  if (code === -102) return { title: 'Ce site est inaccessible', detail: `${host} a refusé la connexion.` }
  if (code === -118 || code === -7) return { title: 'Ce site est inaccessible', detail: `${host} a mis trop de temps à répondre.` }
  if (code === -109 || code === -101 || code === -100)
    return { title: 'Ce site est inaccessible', detail: `La connexion à ${host} a été interrompue.` }
  if (code <= -200 && code > -300)
    return {
      title: "Votre connexion n'est pas privée",
      detail: `Le certificat de sécurité de ${host} n'est pas valide : quelqu'un pourrait essayer d'intercepter vos données.`
    }
  return { title: 'Cette page ne peut pas être affichée', detail: `Le chargement de ${host || 'la page'} a échoué.` }
}

/** zak://error (CLAUDE.md §6.7): DNS, offline, refused, certificate… with a retry button. */
function ErrorPage(): JSX.Element {
  const { title, detail } = explain()
  return (
    <main className="mx-auto flex min-h-full max-w-[620px] flex-col justify-center gap-4 px-6 pb-[12vh] text-cream-ink">
      <div className="text-[44px] leading-none" aria-hidden>
        {code <= -200 && code > -300 ? '🔒' : code === -106 ? '📡' : '🌫️'}
      </div>
      <h1 className="m-0 font-serif text-[34px] leading-tight font-semibold">{title}</h1>
      <p className="m-0 text-[15px] text-cream-sub">{detail}</p>
      <p className="m-0 font-mono text-[12px] text-cream-dim" data-testid="error-code">
        {description || 'ERR'} ({code})
      </p>
      <div>
        <button
          type="button"
          autoFocus
          onClick={() => location.replace(failedUrl)}
          className="mt-2 h-10 cursor-pointer rounded-full border-0 bg-pink-button px-5 text-[14px] font-bold text-white outline-none hover:bg-pink focus-visible:ring-2 focus-visible:ring-pink-soft"
        >
          Réessayer
        </button>
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorPage />
  </StrictMode>
)
