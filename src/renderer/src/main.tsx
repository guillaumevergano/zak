import './lib/lang'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { OverlayApp } from './overlay/OverlayApp'
import { isPrivateWindow } from './lib/env'
import './styles.css'

// Same bundle for the chrome UI and the overlay view that hosts popovers above the page.
const isOverlay = location.hash === '#overlay'

if (isOverlay) document.body.classList.add('overlay')
// Private window: forced dark theme.
else if (isPrivateWindow) document.body.classList.add('private')

createRoot(document.getElementById('root')!).render(<StrictMode>{isOverlay ? <OverlayApp /> : <App />}</StrictMode>)
