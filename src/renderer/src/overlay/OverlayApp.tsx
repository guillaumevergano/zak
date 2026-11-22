import { useEffect, useState, type FormEvent } from 'react'
import type { FolderInfo, OverlayRequest } from '@shared/types'
import { Actions, Field, inputClass, Popover } from './Popover'
import { EmojiField } from './EmojiField'
import { Suggestions } from './Suggestions'
import { FindBar } from './FindBar'
import { PermissionPrompt } from './PermissionPrompt'
import { SavePasswordPrompt } from './SavePasswordPrompt'
import { DownloadsPanel } from './DownloadsPanel'
import { t } from '@shared/i18n'

const api = window.zak

/**
 * Root of the overlay view (`#overlay`): a transparent layer over the whole window that shows one
 * popover at a time. A click outside it, or Esc, closes it.
 */
export function OverlayApp(): JSX.Element {
  const [request, setRequest] = useState<OverlayRequest | null>(null)
  // Bumped on each request so the form starts fresh.
  const [serial, setSerial] = useState(0)
  const [folders, setFolders] = useState<FolderInfo[]>([])

  useEffect(
    () =>
      api.on('overlay:show', (next) => {
        setRequest(next)
        // Suggestions update while typing: keep the same component.
        if (next?.kind !== 'suggestions') setSerial((n) => n + 1)
        if (next?.kind === 'favorite-editor') void api.invoke('sidebar:getState').then((s) => setFolders(s.folders))
      }),
    []
  )

  const close = (): void => {
    setRequest(null)
    void api.invoke('overlay:close')
  }

  useEffect(() => {
    // The permission prompt answers Esc itself (dismissed, not hidden: it would come back).
    if (!request || request.kind === 'permission' || request.kind === 'save-password' || request.kind === 'suggestions') return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [request])

  if (!request) return <div className="fixed inset-0" onMouseDown={close} />

  // Framed panels: the view is exactly their size, nothing around to click.
  if (request.kind === 'suggestions') return <Suggestions request={request} />
  if (request.kind === 'find') return <FindBar key={serial} request={request} />
  if (request.kind === 'permission') return <PermissionPrompt key={serial} request={request} />
  if (request.kind === 'save-password') return <SavePasswordPrompt key={serial} request={request} />

  return (
    <div className="fixed inset-0" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      {/* Key: a new request starts from a fresh form. */}
      {request.kind === 'favorite-editor' ? (
        <FavoriteEditor key={serial} request={request} folders={folders} onDone={close} />
      ) : request.kind === 'folder-editor' ? (
        <FolderEditor key={serial} request={request} onDone={close} />
      ) : (
        <DownloadsPanel key={serial} request={request} />
      )}
    </div>
  )
}

/** Adds http(s) when missing, like the omnibox. */
function normalizeUrl(input: string): string {
  const text = input.trim()
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return text
  return `https://${text}`
}

function FavoriteEditor(props: {
  request: Extract<OverlayRequest, { kind: 'favorite-editor' }>
  folders: FolderInfo[]
  onDone: () => void
}): JSX.Element {
  const { favoriteId, draft, anchor } = props.request
  const [emoji, setEmoji] = useState(draft.emoji)
  const [title, setTitle] = useState(draft.title)
  const [url, setUrl] = useState(draft.url)
  const [folderId, setFolderId] = useState(draft.folderId)

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    if (!url.trim()) return
    const input = { title: title.trim() || url.trim(), url: normalizeUrl(url), emoji, folderId, favicon: draft.favicon ?? null }
    void (favoriteId ? api.invoke('favorites:update', favoriteId, input) : api.invoke('favorites:add', input)).then(props.onDone)
  }

  return (
    <Popover anchor={anchor}>
      <form className="flex flex-col gap-3" onSubmit={submit} data-testid="favorite-editor">
        <span className="text-[15px] font-bold text-title">{favoriteId ? t('Modifier le favori') : t('Ajouter aux favoris')}</span>
        <EmojiField emoji={emoji} favicon={draft.favicon} allowNone onChange={setEmoji} />
        <Field label={t('Titre')}>
          <input
            autoFocus
            data-testid="favorite-title"
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={(e) => e.target.select()}
          />
        </Field>
        <Field label={t('Adresse')}>
          <input
            data-testid="favorite-url"
            className={`${inputClass} font-mono text-[12px]`}
            value={url}
            placeholder={t('exemple.com')}
            onChange={(e) => setUrl(e.target.value)}
            spellCheck={false}
          />
        </Field>
        <Field label={t('Dossier')}>
          <select
            className={inputClass}
            value={folderId ?? ''}
            onChange={(e) => setFolderId(e.target.value === '' ? null : e.target.value)}
          >
            <option value="">{t('Aucun (racine)')}</option>
            {props.folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.emoji ? `${f.emoji} ` : ''}
                {f.name}
              </option>
            ))}
          </select>
        </Field>
        <Actions
          submitLabel={favoriteId ? t('Enregistrer') : t('Ajouter')}
          onCancel={props.onDone}
          onDelete={favoriteId ? () => void api.invoke('favorites:remove', favoriteId).then(props.onDone) : undefined}
        />
      </form>
    </Popover>
  )
}

function FolderEditor(props: { request: Extract<OverlayRequest, { kind: 'folder-editor' }>; onDone: () => void }): JSX.Element {
  const { folderId, draft, anchor } = props.request
  const [emoji, setEmoji] = useState(draft.emoji)
  const [name, setName] = useState(draft.name)

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    if (!name.trim()) return
    const input = { name: name.trim(), emoji }
    void (folderId ? api.invoke('folders:update', folderId, input) : api.invoke('folders:add', input)).then(props.onDone)
  }

  return (
    <Popover anchor={anchor}>
      <form className="flex flex-col gap-3" onSubmit={submit} data-testid="folder-editor">
        <span className="text-[15px] font-bold text-title">{folderId ? t('Renommer le dossier') : t('Nouveau dossier')}</span>
        <EmojiField emoji={emoji} allowNone={false} onChange={setEmoji} />
        <Field label={t('Nom')}>
          <input
            autoFocus
            data-testid="folder-name"
            className={inputClass}
            value={name}
            placeholder={t('Travail, À lire…')}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Actions submitLabel={folderId ? t('Enregistrer') : t('Créer')} onCancel={props.onDone} />
      </form>
    </Popover>
  )
}
