import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { callInternal } from './api'
import '../styles.css'

const params = new URLSearchParams(location.search)
const failedUrl = params.get('url') ?? ''
const code = Number(params.get('code') ?? 0)
const description = params.get('desc') ?? ''
const threat = params.get('threat') as 'phishing' | 'malware' | null

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

/**
 * A known phishing or malware page (src/main/safety/), like Chrome's red warning: back to safety
 * first, « Continuer quand même » for this session behind the details.
 */
function ThreatPage({ kind }: { kind: 'phishing' | 'malware' }): JSX.Element {
  const phishing = kind === 'phishing'
  const leave = (): void => void callInternal('error/leave', { page: location.href })
  return (
    <main className="flex min-h-full items-center justify-center bg-[#b3123e] px-6 pb-[8vh] text-white" data-testid="threat-warning">
      <div className="flex max-w-[640px] flex-col gap-4">
        <div className="text-[48px] leading-none" aria-hidden>
          ⚠️
        </div>
        <h1 className="m-0 font-serif text-[34px] leading-tight font-semibold">
          {phishing ? 'Site trompeur' : 'Ce site contient des logiciels malveillants'}
        </h1>
        <p className="m-0 text-[16px] leading-relaxed text-white/90">
          {phishing ? (
            <>
              <b>{host}</b> est signalé comme un site d'hameçonnage : il peut tenter de vous faire saisir un mot de passe,
              un numéro de carte ou d'autres informations personnelles en se faisant passer pour un site de confiance.
            </>
          ) : (
            <>
              <b>{host}</b> est signalé pour distribuer des logiciels malveillants qui peuvent voler vos données ou
              endommager votre ordinateur.
            </>
          )}
        </p>
        <div className="mt-2 flex flex-col items-start gap-5">
          <button
            type="button"
            autoFocus
            onClick={leave}
            className="h-10 cursor-pointer rounded-full border-0 bg-white px-5 text-[14px] font-bold text-[#b3123e] outline-none hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white/60"
          >
            Retour en lieu sûr
          </button>
          <details className="text-[13px] text-white/80">
            <summary className="cursor-pointer select-none">Détails</summary>
            <p className="mt-2 mb-2 max-w-[460px]">
              Signalement issu des listes publiques {phishing ? 'OpenPhish et PhishTank' : 'URLhaus (abuse.ch)'}, vérifiées sur
              votre ordinateur. Si vous comprenez les risques, vous pouvez ouvrir ce site pour cette session.
            </p>
            <button
              type="button"
              onClick={() => void callInternal('error/proceed', { url: failedUrl }).then(() => location.replace(failedUrl))}
              className="cursor-pointer border-0 bg-transparent p-0 text-[13px] text-white underline"
            >
              Continuer quand même vers {host} (déconseillé)
            </button>
          </details>
        </div>
      </div>
    </main>
  )
}

/** zak://error (CLAUDE.md §6.7): DNS, offline, refused, certificate… with a retry button. */
function ErrorPage(): JSX.Element {
  if (threat === 'phishing' || threat === 'malware') return <ThreatPage kind={threat} />
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
