import type { OverlayRequest, SavePasswordChoice } from '@shared/types'
import { t } from '@shared/i18n'

const api = window.zak

/** « Enregistrer le mot de passe ? » after a login (src/main/passwords/), top right like Chrome's. */
export function SavePasswordPrompt({ request }: { request: Extract<OverlayRequest, { kind: 'save-password' }> }): JSX.Element {
  const answer = (choice: SavePasswordChoice): void => void api.invoke('passwords:answer', request.promptId, choice)
  const host = request.origin.replace(/^https?:\/\//, '')

  return (
    <div
      role="dialog"
      aria-label={request.update ? t('Mettre à jour le mot de passe') : t('Enregistrer le mot de passe')}
      data-testid="save-password-prompt"
      onKeyDown={(e) => e.key === 'Escape' && answer('dismiss')}
      className="fixed inset-x-1 top-1 bottom-2 flex flex-col gap-2 rounded-[16px] border border-title/12 bg-white p-4 text-ink shadow-[0_2px_8px_rgb(0_0_0/0.16)]"
    >
      <p className="m-0 flex items-center gap-2 text-[14px] font-semibold">
        <span aria-hidden>🔑</span>
        {request.update ? t('Mettre à jour le mot de passe ?') : t('Enregistrer le mot de passe ?')}
      </p>
      <p className="m-0 truncate text-[13px] text-sub">
        <span className="font-mono text-title">{host}</span>
        {request.username ? ` · ${request.username}` : ''}
      </p>
      <div className="mt-auto flex items-center justify-end gap-2">
        {!request.update && (
          <button type="button" onClick={() => answer('never')} className="mr-auto h-9 rounded-xl px-2 text-[12.5px] text-sub hover:bg-violet/8">
            {t('Jamais pour ce site')}
          </button>
        )}
        <button
          type="button"
          onClick={() => answer('dismiss')}
          className="h-9 rounded-xl border border-track px-3 font-semibold text-sub hover:bg-violet/8"
        >
          {t('Plus tard')}
        </button>
        <button
          type="button"
          autoFocus
          onClick={() => answer('save')}
          className="h-9 rounded-xl bg-pink-button px-4 font-bold text-white hover:bg-pink"
        >
          {request.update ? t('Mettre à jour') : t('Enregistrer')}
        </button>
      </div>
    </div>
  )
}
