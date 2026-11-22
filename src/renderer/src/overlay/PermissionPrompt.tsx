import type { OverlayRequest } from '@shared/types'
import { t } from '@shared/i18n'
import { permissionQuestion } from '../lib/permissions'
import { fillNodes } from '../lib/i18n'

const api = window.zak

/** "<site> veut utiliser votre caméra" under the omnibox (CLAUDE.md §6.7). */
export function PermissionPrompt({ request }: { request: Extract<OverlayRequest, { kind: 'permission' }> }): JSX.Element {
  const answer = (granted: boolean | null): void => void api.invoke('permission:answer', request.requestId, granted)
  const host = request.origin.replace(/^https?:\/\//, '')

  return (
    <div
      role="dialog"
      aria-label={t("Demande d'autorisation")}
      data-testid="permission-prompt"
      onKeyDown={(e) => e.key === 'Escape' && answer(null)}
      className="fixed inset-x-1 top-1 bottom-2 flex flex-col gap-3 rounded-[16px] border border-title/12 bg-white p-4 text-ink shadow-[0_2px_8px_rgb(0_0_0/0.16)]"
    >
      <p className="m-0 text-[14px] leading-snug">
        {fillNodes(permissionQuestion(request.permission), {
          host: <strong className="font-mono text-[13px] text-title">{host}</strong>
        })}
      </p>
      <div className="mt-auto flex justify-end gap-2">
        <button
          type="button"
          onClick={() => answer(false)}
          className="h-9 rounded-xl border border-track px-4 font-semibold text-sub hover:bg-violet/8"
        >
          {t('Bloquer')}
        </button>
        <button
          type="button"
          autoFocus
          onClick={() => answer(true)}
          className="h-9 rounded-xl bg-pink-button px-4 font-bold text-white hover:bg-pink"
        >
          {t('Autoriser')}
        </button>
      </div>
    </div>
  )
}
