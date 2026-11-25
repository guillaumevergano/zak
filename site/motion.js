(() => {
  'use strict';
  const EN = document.documentElement.lang === 'en';
  const body = document.body;
  const header = document.querySelector('.site-header');
  const navigation = document.querySelector('#navigation');
  const menuButton = document.querySelector('.menu-toggle');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const toggle = document.querySelector('#motion-toggle');
  const stage = document.querySelector('#character-stage');
  const bird = document.querySelector('#bird-button');
  const finale = document.querySelector('#finale');
  const finalSticky = document.querySelector('.finale-sticky');
  const finalCopy = document.querySelector('.final-copy');
  const finalBird = document.querySelector('.landing-bird');
  const finalPanel = document.querySelector('.final-panel');
  let pausedByUser = false;
  let switchTimer = null;
  let blinkTimer = null;
  let automaticBlinkTimer = null;
  let keyboardFinale = false;
  let frame = null;
  let inView = false;
  const motionAllowed = () => !pausedByUser && !reducedMotion.matches;

  function switchAssistant() {
    body.dataset.assistant = body.dataset.assistant === 'claude' ? 'chatgpt' : 'claude';
  }
  function restartAlternation() {
    clearInterval(switchTimer);
    if (motionAllowed() && !document.hidden) switchTimer = setInterval(switchAssistant, 5200);
  }
  document.querySelector('#change-assistant').addEventListener('click', () => {
    switchAssistant();
    restartAlternation();
  });
  function blink() {
    if (!motionAllowed() || bird.classList.contains('blink')) return;
    bird.classList.add('blink');
    clearTimeout(blinkTimer);
    blinkTimer = setTimeout(() => bird.classList.remove('blink'), 750);
  }
  bird.addEventListener('click', blink);
  function restartBlinking() {
    clearInterval(automaticBlinkTimer);
    if (motionAllowed() && !document.hidden && inView) {
      automaticBlinkTimer = setInterval(() => blink(), 6800);
    }
  }
  const clamp = value => Math.max(0, Math.min(1, value));
  const smoothstep = (start, end, value) => {
    const x = clamp((value - start) / (end - start));
    return x * x * (3 - 2 * x);
  };
  function updateScroll() {
    frame = null;
    if (document.hidden) return;
    const showHeader = scrollY > 24;
    header.classList.toggle('is-visible', showHeader);
    header.inert = !showHeader;
    if (!showHeader) {
      navigation.classList.remove('open');
      menuButton.setAttribute('aria-expanded', 'false');
      menuButton.setAttribute('aria-label', (EN ? 'Open the menu' : 'Ouvrir le menu'));
    }
    const rect = finale.getBoundingClientRect();
    const travel = Math.max(1, finale.offsetHeight - finalSticky.offsetHeight);
    const rawProgress = clamp(-rect.top / travel);
    const progress = motionAllowed() && !keyboardFinale ? rawProgress : 1;
    const arrival = smoothstep(0, .88, progress);
    const birdSize = finalBird.offsetWidth;
    const initialScale = Math.max(1, finalCopy.clientWidth * 1.13 / birdSize);
    const initialY = finalSticky.clientHeight * .68 + birdSize * initialScale * .3;
    const scale = 1 + (initialScale - 1) * (1 - arrival);
    const flightY = initialY * (1 - arrival);
    // Anchor the shared surface at y=418/600. The SVG preserves the curved
    // negative space below this line; the compact panel finishes flush with the scene.
    const surfaceY = flightY - birdSize * .2 * (scale - 1);
    finale.style.setProperty('--flight-scale', scale.toFixed(4));
    finale.style.setProperty('--landing-y', `${surfaceY.toFixed(2)}px`);
    finale.style.setProperty('--copy-opacity', smoothstep(.74, .96, progress).toFixed(4));
    finale.dataset.progress = progress.toFixed(3);
  }
  function scheduleFrame() { if (frame === null && !document.hidden) frame = requestAnimationFrame(updateScroll); }
  addEventListener('scroll', scheduleFrame, {passive:true});
  addEventListener('resize', scheduleFrame, {passive:true});
  // Keyboard navigation exposes the final action immediately, regardless of scroll position.
  finalPanel.addEventListener('focusin', event => {
    if (event.target.matches(':focus-visible')) { keyboardFinale = true; updateScroll(); }
  });
  const stageObserver = new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting;
    restartBlinking();
    if (inView) blink();
  }, {threshold:.35});
  stageObserver.observe(stage);
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); revealObserver.unobserve(entry.target); }
    });
  }, {threshold:.08});
  document.querySelectorAll('.essentials .section-heading,.benefits article,.mcp-copy,.prompt-examples,.everyday-copy,.favorites-art,.open-source-heading,.open-source-copy,.faq .section-heading').forEach(element => {
    if (motionAllowed() && element.getBoundingClientRect().top > innerHeight) {
      element.classList.add('reveal');
      revealObserver.observe(element);
    }
  });
  function syncMotion() {
    const enabled = motionAllowed();
    body.classList.toggle('motion-paused', !enabled);
    body.classList.toggle('motion-ready', enabled);
    body.classList.toggle('finale-enhanced', !reducedMotion.matches);
    toggle.hidden = reducedMotion.matches;
    toggle.setAttribute('aria-pressed', String(!enabled));
    const label = enabled ? (EN ? 'Pause the animations' : 'Mettre les animations en pause') : (EN ? 'Resume the animations' : 'Réactiver les animations');
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    toggle.querySelector('use').setAttribute('href', enabled ? '#i-pause' : '#i-play');
    if (!enabled) {
      bird.classList.remove('blink');
      clearTimeout(blinkTimer);
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    }
    restartAlternation();
    restartBlinking();
    updateScroll();
  }
  toggle.addEventListener('click', () => { pausedByUser = !pausedByUser; syncMotion(); });
  reducedMotion.addEventListener('change', syncMotion);
  document.addEventListener('visibilitychange', () => { restartAlternation(); restartBlinking(); if (!document.hidden) scheduleFrame(); });
  syncMotion();
})();
