import './lib/lang'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { OverlayApp } from './overlay/OverlayApp'
import { MiniPlayerControls } from './miniplayer/MiniPlayerControls'
import { RecorderControls } from './recorder/RecorderControls'
import { CameraBubble } from './recorder/CameraBubble'
import { isPrivateWindow } from './lib/env'
import './styles.css'

// Same bundle for the chrome UI and the overlay view that hosts popovers above the page.
const isOverlay = location.hash === '#overlay'
// Zak's floating player: its buttons, over the video (transparent too).
const isMiniPlayer = location.hash === '#miniplayer'
// The screen recorder's windows (CLAUDE.md §6.8): its controls, and the camera bubble.
const isRecorder = location.hash === '#recorder-controls'
const cameraLabel = location.hash.startsWith('#recorder-camera=') ? decodeURIComponent(location.hash.slice('#recorder-camera='.length)) : null

if (isOverlay || isMiniPlayer || isRecorder || cameraLabel !== null) document.body.classList.add('overlay')
// Private window: forced dark theme.
else if (isPrivateWindow) document.body.classList.add('private')

const root = isRecorder ? (
  <RecorderControls />
) : cameraLabel !== null ? (
  <CameraBubble label={cameraLabel} />
) : isMiniPlayer ? (
  <MiniPlayerControls />
) : isOverlay ? (
  <OverlayApp />
) : (
  <App />
)
// No StrictMode for the recorder: its effects (the screen, the recording) must run once.
createRoot(document.getElementById('root')!).render(isRecorder || cameraLabel !== null ? root : <StrictMode>{root}</StrictMode>)
