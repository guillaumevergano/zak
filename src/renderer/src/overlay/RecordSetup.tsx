import { useEffect, useState } from 'react'
import type { RecordAccess, RecordSource } from '@shared/tools'
import { t } from '@shared/i18n'

const api = window.zak

/** Devices by name: their ids change from one session to the other (CLAUDE.md §6.8). */
type Devices = { cameras: string[]; mics: string[] }

/** Real devices only (Chromium adds « Default » and « Communications » aliases). */
async function listDevices(access: RecordAccess): Promise<Devices> {
  if (!access.camera && !access.mic) return { cameras: [], mics: [] }
  // Names are only given once the page has had a device: open them a moment.
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: access.camera, audio: access.mic })
    stream.getTracks().forEach((track) => track.stop())
  } catch {
    /* no device of that kind: the list says so */
  }
  const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.deviceId !== 'default' && d.deviceId !== 'communications' && d.label)
  const names = (kind: MediaDeviceKind): string[] => [...new Set(all.filter((d) => d.kind === kind).map((d) => d.label))]
  return { cameras: access.camera ? names('videoinput') : [], mics: access.mic ? names('audioinput') : [] }
}

/**
 * Screen recording's setup (CLAUDE.md §6.8), over the dimmed page: the screen or window to record,
 * the camera (a round bubble in the video) and the microphone. Esc cancels, Enter records.
 */
export function RecordSetup(): JSX.Element {
  const [sources, setSources] = useState<RecordSource[] | null>(null)
  const [access, setAccess] = useState<RecordAccess | null>(null)
  const [devices, setDevices] = useState<Devices | null>(null)
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [camera, setCamera] = useState(true)
  const [cameraLabel, setCameraLabel] = useState('')
  const [mic, setMic] = useState(true)
  const [micLabel, setMicLabel] = useState('')

  useEffect(() => {
    void api.invoke('record:settings').then((s) => {
      setCamera(s.camera)
      setCameraLabel(s.cameraLabel)
      setMic(s.mic)
      setMicLabel(s.micLabel)
    })
    void api.invoke('record:access', true).then(async (granted) => {
      setAccess(granted)
      setDevices(await listDevices(granted))
      const list = await api.invoke('record:sources')
      setSources(list)
      setSourceId((current) => current ?? list[0]?.id ?? null)
    })
  }, [])

  const cancel = (): void => void api.invoke('overlay:close')
  const canRecord = sourceId !== null && access?.screen !== 'denied' && access?.screen !== 'restricted'
  const useCamera = camera && (devices?.cameras.length ?? 0) > 0
  const useMic = mic && (devices?.mics.length ?? 0) > 0
  const record = (): void => {
    if (!canRecord) return
    // A device no longer there: the system's.
    const pick = (label: string, list: string[]): string => (list.includes(label) ? label : '')
    void api.invoke('record:start', {
      sourceId: sourceId!,
      camera: useCamera ? pick(cameraLabel, devices!.cameras) : null,
      mic: useMic ? pick(micLabel, devices!.mics) : null
    })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') cancel()
      else if (e.key === 'Enter' && !(e.target instanceof HTMLSelectElement)) record()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const isMac = navigator.platform.startsWith('Mac')
  const screens = sources?.filter((s) => s.kind === 'screen') ?? []
  const windows = sources?.filter((s) => s.kind === 'window') ?? []

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/35 p-4" onMouseDown={(e) => e.target === e.currentTarget && cancel()}>
      <div
        role="dialog"
        aria-label={t('Enregistrer l’écran')}
        data-testid="record-setup"
        className="flex max-h-full w-[560px] max-w-full flex-col gap-4 overflow-hidden rounded-[20px] border border-title/12 bg-cream p-5 text-ink shadow-[0_8px_30px_rgb(0_0_0/0.25)]"
      >
        <div>
          <h2 className="m-0 text-[18px] font-bold text-title">{t('Enregistrer l’écran')}</h2>
          <p className="m-0 mt-0.5 text-[12.5px] text-sub">{t('La vidéo est enregistrée dans Téléchargements. Rien ne quitte votre ordinateur.')}</p>
        </div>

        {access && access.screen !== 'granted' && isMac && (
          <div role="alert" className="flex items-center gap-3 rounded-[12px] bg-white/80 px-3.5 py-2.5 text-[12.5px] text-ink">
            <span className="flex-1">
              {t('Autorisez Zak dans Réglages Système → Confidentialité et sécurité → Enregistrement de l’écran, puis relancez Zak.')}
            </span>
            <button
              type="button"
              onClick={() => void api.invoke('record:openPrivacy', 'screen')}
              className="h-8 shrink-0 rounded-xl border border-track bg-white px-3 text-[12.5px] font-semibold text-violet hover:bg-violet/8"
            >
              {t('Ouvrir les Réglages')}
            </button>
          </div>
        )}

        <div className="min-h-0 overflow-y-auto" role="radiogroup" aria-label={t('Que voulez-vous enregistrer ?')}>
          {!sources && <p className="m-0 py-6 text-center text-[13px] text-sub">{t('Recherche des écrans et des fenêtres…')}</p>}
          {sources && (
            <div className="grid grid-cols-3 gap-2.5">
              {[...screens, ...windows].map((source) => (
                <button
                  key={source.id}
                  type="button"
                  role="radio"
                  aria-checked={source.id === sourceId}
                  data-testid="record-source"
                  onClick={() => setSourceId(source.id)}
                  className={`flex min-w-0 flex-col gap-1.5 rounded-[12px] border-2 bg-white p-1.5 text-left ${
                    source.id === sourceId ? 'border-violet' : 'border-transparent hover:border-violet/30'
                  }`}
                >
                  {source.thumbnail ? (
                    <img src={source.thumbnail} alt="" className="aspect-[16/10] w-full rounded-[8px] bg-[#EBE2E2] object-contain" />
                  ) : (
                    <span className="aspect-[16/10] w-full rounded-[8px] bg-[#EBE2E2]" />
                  )}
                  <span className="flex min-w-0 items-center gap-1.5 px-0.5 text-[12px] font-semibold text-title">
                    {source.appIcon && <img src={source.appIcon} alt="" className="size-4 shrink-0" />}
                    <span className="truncate">{source.name}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <DeviceRow
            label={t('Caméra')}
            on={camera}
            onToggle={setCamera}
            names={devices?.cameras ?? null}
            value={cameraLabel}
            onChange={setCameraLabel}
            denied={access !== null && !access.camera}
            onOpenPrivacy={() => void api.invoke('record:openPrivacy', 'camera')}
          />
          <DeviceRow
            label={t('Micro')}
            on={mic}
            onToggle={setMic}
            names={devices?.mics ?? null}
            value={micLabel}
            onChange={setMicLabel}
            denied={access !== null && !access.mic}
            onOpenPrivacy={() => void api.invoke('record:openPrivacy', 'mic')}
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={cancel}
            className="h-9 rounded-xl border border-track bg-white px-4 text-[13px] font-semibold text-sub hover:bg-violet/8"
          >
            {t('Annuler')}
          </button>
          <button
            type="button"
            disabled={!canRecord}
            onClick={record}
            className="flex h-9 items-center gap-2 rounded-xl border-0 bg-violet px-4 text-[13px] font-semibold text-white hover:bg-title disabled:opacity-40"
          >
            <span aria-hidden className="size-2.5 rounded-full bg-[#FF5A5F]" />
            {t('Enregistrer')}
          </button>
        </div>
      </div>
    </div>
  )
}

function DeviceRow(props: {
  label: string
  on: boolean
  onToggle: (on: boolean) => void
  names: string[] | null
  value: string
  onChange: (name: string) => void
  denied: boolean
  onOpenPrivacy: () => void
}): JSX.Element {
  const none = props.names !== null && props.names.length === 0
  return (
    <div className="flex min-h-9 items-center gap-3 rounded-[12px] bg-white/70 px-3 py-1.5">
      <label className="flex w-[92px] shrink-0 cursor-pointer items-center gap-2 text-[13px] font-semibold text-title">
        <input
          type="checkbox"
          checked={props.on && !none}
          disabled={none}
          onChange={(e) => props.onToggle(e.target.checked)}
          className="size-4 cursor-pointer accent-violet"
        />
        {props.label}
      </label>
      {props.denied ? (
        <button type="button" onClick={props.onOpenPrivacy} className="min-w-0 truncate text-left text-[12.5px] font-semibold text-violet">
          {t('Autoriser Zak dans les Réglages')}
        </button>
      ) : none ? (
        <span className="text-[12.5px] text-sub">{t('Aucun appareil trouvé')}</span>
      ) : (
        <select
          aria-label={props.label}
          value={props.names?.includes(props.value) ? props.value : ''}
          disabled={!props.on || props.names === null}
          onChange={(e) => props.onChange(e.target.value)}
          className="h-8 min-w-0 flex-1 rounded-lg border border-track bg-white px-2 text-[12.5px] text-title disabled:opacity-50"
        >
          <option value="">{t('Celui du système')}</option>
          {props.names?.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
