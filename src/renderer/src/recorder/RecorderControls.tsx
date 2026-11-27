import { useEffect, useRef, useState } from 'react'
import type { RecorderCommand, RecorderSetup } from '@shared/tools'
import { t } from '@shared/i18n'

const api = window.zak

/** Formats MediaRecorder can write, best first: MP4 opens everywhere (QuickTime, messages). */
const FORMATS: { mime: string; extension: 'mp4' | 'webm' }[] = [
  { mime: 'video/mp4;codecs=avc1.640028,mp4a.40.2', extension: 'mp4' },
  { mime: 'video/mp4;codecs=avc1,opus', extension: 'mp4' },
  { mime: 'video/mp4', extension: 'mp4' },
  { mime: 'video/webm;codecs=vp9,opus', extension: 'webm' },
  { mime: 'video/webm', extension: 'webm' }
]

const COUNTDOWN = 3

type Phase = 'starting' | 'countdown' | 'recording' | 'paused' | 'saving' | 'error'

/** E2E tests: a moving picture in place of the screen. */
function fakeScreen(): MediaStream {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 400
  const ctx = canvas.getContext('2d')!
  let frame = 0
  const draw = (): void => {
    ctx.fillStyle = `hsl(${(frame++ * 4) % 360} 60% 50%)`
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    requestAnimationFrame(draw)
  }
  draw()
  return canvas.captureStream(30)
}

async function microphone(label: string | null): Promise<MediaStreamTrack | null> {
  if (label === null) return null
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const chosen = label ? devices.find((d) => d.kind === 'audioinput' && d.label === label) : undefined
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: chosen ? { deviceId: { exact: chosen.deviceId } } : true,
      video: false
    })
    return stream.getAudioTracks()[0] ?? null
  } catch {
    // No microphone after all: the video is recorded without sound.
    return null
  }
}

/** The video's first picture, for the thumbnail shown at the end. */
function snapshot(track: MediaStreamTrack): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.muted = true
    video.srcObject = new MediaStream([track])
    const done = (value: string | null): void => {
      video.srcObject = null
      resolve(value)
    }
    video.onloadeddata = () => {
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, 640 / (video.videoWidth || 640))
      canvas.width = Math.round((video.videoWidth || 640) * scale)
      canvas.height = Math.round((video.videoHeight || 400) * scale)
      canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
      done(canvas.toDataURL('image/jpeg', 0.8))
    }
    void video.play().catch(() => done(null))
    setTimeout(() => done(null), 1500)
  })
}

const clock = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

/**
 * The recorder (`#recorder-controls`, CLAUDE.md §6.8): a small pill kept out of the video. It gets
 * the screen and the microphone, counts down, records (MediaRecorder) and sends each piece to main,
 * which writes the file. Pause, stop, throw away; drag it anywhere.
 */
export function RecorderControls(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('starting')
  const [count, setCount] = useState(COUNTDOWN)
  const [seconds, setSeconds] = useState(0)
  const recorder = useRef<MediaRecorder | null>(null)
  const tracks = useRef<MediaStreamTrack[]>([])
  const thumbnail = useRef<Promise<string | null>>(Promise.resolve(null))
  /** The pieces go out one after the other, in order. */
  const sending = useRef<Promise<void>>(Promise.resolve())
  const discarding = useRef(false)
  const stopped = useRef(false)

  const release = (): void => tracks.current.forEach((track) => track.stop())

  const stop = (discard: boolean): void => {
    if (stopped.current) return
    stopped.current = true
    discarding.current = discard
    const rec = recorder.current
    if (rec && rec.state !== 'inactive') {
      setPhase('saving')
      rec.stop()
    } else {
      // Not started yet: nothing to keep.
      release()
      void api.invoke('record:discard')
    }
  }

  const command = (cmd: RecorderCommand): void => {
    const rec = recorder.current
    if (cmd === 'stop') stop(false)
    else if (cmd === 'cancel') stop(true)
    else if (cmd === 'pause' && rec?.state === 'recording') {
      rec.pause()
      setPhase('paused')
    } else if (cmd === 'resume' && rec?.state === 'paused') {
      rec.resume()
      setPhase('recording')
    }
  }

  useEffect(() => api.on('record:command', command), [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const setup: RecorderSetup | null = await api.invoke('record:setup')
      if (!setup) return
      let screenTrack: MediaStreamTrack | undefined
      try {
        const screen = setup.fake ? fakeScreen() : await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false })
        screenTrack = screen.getVideoTracks()[0]
      } catch {
        /* refused, or the source is gone */
      }
      if (!screenTrack) {
        setPhase('error')
        return
      }
      const mic = await microphone(setup.mic)
      tracks.current = [screenTrack, ...(mic ? [mic] : [])]
      // The system's « stop sharing », or the window recorded closed: the video ends there.
      screenTrack.onended = () => stop(false)
      if (cancelled || stopped.current) {
        release()
        return
      }

      setPhase('countdown')
      for (let n = COUNTDOWN; n > 0; n--) {
        setCount(n)
        await new Promise((resolve) => setTimeout(resolve, 1000))
        if (stopped.current) return
      }

      const format = FORMATS.find((f) => MediaRecorder.isTypeSupported(f.mime)) ?? FORMATS.at(-1)!
      const rec = new MediaRecorder(new MediaStream(tracks.current), { mimeType: format.mime, videoBitsPerSecond: 6_000_000 })
      recorder.current = rec
      await api.invoke('record:begin', format.extension)
      rec.ondataavailable = (e) => {
        if (e.data.size === 0) return
        sending.current = sending.current.then(async () => api.send('record:chunk', await e.data.arrayBuffer()))
      }
      rec.onstop = () => {
        void (async () => {
          await sending.current
          const picture = await thumbnail.current
          release()
          if (discarding.current) await api.invoke('record:discard')
          else await api.invoke('record:finish', picture)
        })()
      }
      rec.start(1000)
      thumbnail.current = snapshot(screenTrack)
      setPhase('recording')
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // The time recorded, paused while paused.
  useEffect(() => {
    if (phase !== 'recording') return
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [phase])

  const recording = phase === 'recording' || phase === 'paused'
  return (
    <div
      data-testid="recorder-controls"
      data-phase={phase}
      className="drag fixed inset-1 flex cursor-grab items-center gap-1.5 rounded-full bg-frame/95 px-2 text-frame-text shadow-[0_2px_10px_rgb(0_0_0/0.35)] select-none"
    >
      {phase === 'error' ? (
        <>
          <span className="min-w-0 flex-1 truncate pl-2 text-[12.5px]">{t('Impossible d’enregistrer l’écran')}</span>
          <PillButton label={t('Fermer')} onClick={() => void api.invoke('record:discard')}>
            ✕
          </PillButton>
        </>
      ) : (
        <>
          <span className="flex min-w-[76px] items-center gap-2 pl-2 font-mono text-[13px] tabular-nums" aria-live="polite">
            <span
              aria-hidden
              className={`size-2.5 shrink-0 rounded-full ${phase === 'recording' ? 'animate-pulse bg-[#FF5A5F]' : phase === 'paused' ? 'bg-frame-sub' : 'bg-[#FF5A5F]/60'}`}
            />
            {phase === 'countdown' ? (
              <span data-testid="recorder-countdown" className="font-sans text-[15px] font-bold">
                {count}
              </span>
            ) : phase === 'starting' ? (
              '…'
            ) : (
              <span data-testid="recorder-time">{clock(seconds)}</span>
            )}
          </span>
          <span className="flex-1" />
          <PillButton
            label={phase === 'paused' ? t('Reprendre') : t('Pause')}
            disabled={!recording}
            onClick={() => command(phase === 'paused' ? 'resume' : 'pause')}
          >
            {phase === 'paused' ? <PlayGlyph /> : <PauseGlyph />}
          </PillButton>
          <PillButton label={t('Arrêter et enregistrer')} disabled={phase === 'saving'} onClick={() => stop(false)} primary>
            <span className="size-3 rounded-[3px] bg-current" />
          </PillButton>
          <PillButton label={t('Jeter l’enregistrement')} disabled={phase === 'saving'} onClick={() => stop(true)}>
            <TrashGlyph />
          </PillButton>
        </>
      )}
    </div>
  )
}

function PillButton(props: { label: string; onClick: () => void; disabled?: boolean; primary?: boolean; children: React.ReactNode }): JSX.Element {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className={`no-drag grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border-0 disabled:cursor-default disabled:opacity-40 ${
        props.primary ? 'bg-[#FF5A5F] text-white hover:bg-[#ff3d43]' : 'bg-transparent text-frame-text hover:bg-white/10'
      }`}
    >
      {props.children}
    </button>
  )
}

const PauseGlyph = (): JSX.Element => (
  <svg viewBox="0 0 16 16" width={15} height={15} fill="currentColor" aria-hidden>
    <rect x="3.5" y="2.5" width="3" height="11" rx="1" />
    <rect x="9.5" y="2.5" width="3" height="11" rx="1" />
  </svg>
)
const PlayGlyph = (): JSX.Element => (
  <svg viewBox="0 0 16 16" width={15} height={15} fill="currentColor" aria-hidden>
    <path d="M4.5 2.8v10.4a.8.8 0 0 0 1.2.7l8.3-5.2a.8.8 0 0 0 0-1.4L5.7 2.1a.8.8 0 0 0-1.2.7z" />
  </svg>
)
const TrashGlyph = (): JSX.Element => (
  <svg viewBox="0 0 16 16" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2.5 4.5h11M6.5 4.5V3h3v1.5M4 4.5l.7 9h6.6l.7-9M6.8 7v4.5M9.2 7v4.5" />
  </svg>
)
