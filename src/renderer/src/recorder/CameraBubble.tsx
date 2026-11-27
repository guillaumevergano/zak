import { useEffect, useRef, useState } from 'react'
import { t } from '@shared/i18n'

/**
 * The camera in a round bubble (`#recorder-camera=<name>`, CLAUDE.md §6.8), above everything and
 * in the recording, like Loom. Drag it anywhere.
 */
export function CameraBubble({ label }: { label: string }): JSX.Element {
  const video = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let live = true
    void (async () => {
      try {
        // The camera chosen by its name: ids differ from the setup panel's session.
        const devices = await navigator.mediaDevices.enumerateDevices()
        const chosen = label ? devices.find((d) => d.kind === 'videoinput' && d.label === label) : undefined
        stream = await navigator.mediaDevices.getUserMedia({
          video: { ...(chosen ? { deviceId: { exact: chosen.deviceId } } : {}), width: { ideal: 640 }, height: { ideal: 640 } },
          audio: false
        })
        if (!live) stream.getTracks().forEach((track) => track.stop())
        else if (video.current) video.current.srcObject = stream
      } catch {
        if (live) setFailed(true)
      }
    })()
    return () => {
      live = false
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [label])

  return (
    <div data-testid="recorder-camera" className="drag fixed inset-1.5 cursor-grab overflow-hidden rounded-full border-[3px] border-white/90 bg-frame shadow-[0_4px_14px_rgb(0_0_0/0.35)]">
      {failed ? (
        <p className="m-0 flex h-full items-center justify-center p-6 text-center text-[12px] text-frame-text">{t('Caméra indisponible')}</p>
      ) : (
        // Mirrored, as one sees oneself.
        <video ref={video} autoPlay muted playsInline className="size-full scale-x-[-1] object-cover" />
      )}
    </div>
  )
}
