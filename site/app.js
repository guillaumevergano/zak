(() => {
  'use strict';
  const $ = (selector, parent = document) => parent.querySelector(selector);
  // The page's texts are French; window.ZAK_I18N (written by site-src/build.mjs) gives the page's language.
  const tr = fr => (window.ZAK_I18N || {})[fr] ?? fr;
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
  const preview = $('#zak-preview');
  const prompt = $('#demo-prompt');
  const response = $('#demo-response p');
  const applyButton = $('#apply-demo');
  const resetButton = $('#reset-demo');
  const favorites = $('#demo-favorites');
  const initialFavorites = favorites.innerHTML;
  const modeData = {
    colors: {
      prompt: tr('Passe Zak dans un thème violet, avec une touche de rose.'),
      idle: tr('Un navigateur qui prend tes couleurs. Regarde le résultat.'),
      result: tr('Le thème violet et les accents roses sont appliqués.'),
      caption: tr('Tes couleurs, dans chaque coin du navigateur.'),
      apply: () => preview.classList.add('theme-violet')
    },
    layout: {
      prompt: tr('Mets ma barre de favoris à gauche.'),
      idle: tr('Ton espace suit tes habitudes. Regarde le résultat.'),
      result: tr('Ta barre de favoris est maintenant à gauche.'),
      caption: tr('Ton organisation, du côté qui te convient.'),
      apply: () => preview.classList.add('sidebar-left')
    },
    favorites: {
      prompt: tr('Ajoute Figma et GitHub à mes favoris.'),
      idle: tr('Tes outils habituels, toujours à portée de clic.'),
      result: tr('Figma et GitHub ont rejoint tes favoris.'),
      caption: tr('Tes sites préférés trouvent leur place.'),
      apply: () => {
        const add = $('.add-favorite', favorites);
        const figma = document.createElement('span');
        figma.textContent = 'Fi'; figma.title = 'Figma'; figma.className = 'favorite-figma demo-highlight';
        const github = document.createElement('span');
        github.textContent = 'GH'; github.title = 'GitHub'; github.className = 'favorite-github demo-highlight';
        favorites.insertBefore(figma, add); favorites.insertBefore(github, add);
      }
    }
  };
  let currentMode = 'colors';
  let timer = null;
  let applied = false;

  function restorePreview() {
    clearTimeout(timer);
    preview.classList.remove('theme-violet', 'sidebar-left');
    favorites.innerHTML = initialFavorites;
    applyButton.disabled = false;
    applyButton.removeAttribute('aria-busy');
    $('span', applyButton).textContent = tr('Voir la transformation');
    $('use', applyButton).setAttribute('href', '#i-play');
    resetButton.hidden = true;
    $('.response-symbol').textContent = '✧';
    $('#demo-state').textContent = tr('Le navigateur, avant ta demande.');
    applied = false;
  }

  function selectMode(mode, shouldApply = false) {
    if (!modeData[mode]) return;
    restorePreview(); currentMode = mode;
    prompt.textContent = modeData[mode].prompt;
    response.textContent = modeData[mode].idle;
    $$('[data-scenario]').forEach(button => {
      const selected = button.dataset.scenario === mode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    if (shouldApply) applyMode();
  }

  function applyMode() {
    if (applied) restorePreview();
    const selectedMode = currentMode;
    applyButton.disabled = true;
    applyButton.setAttribute('aria-busy', 'true');
    $('span', applyButton).textContent = tr('La transformation se prépare…');
    response.textContent = tr('Aperçu du changement en cours…');
    timer = setTimeout(() => {
      if (selectedMode !== currentMode) return;
      modeData[currentMode].apply();
      response.textContent = modeData[currentMode].result;
      $('#demo-state').textContent = modeData[currentMode].caption;
      $('.response-symbol').textContent = '✓';
      applyButton.disabled = false;
      applyButton.removeAttribute('aria-busy');
      $('span', applyButton).textContent = tr('Rejouer la transformation');
      $('use', applyButton).setAttribute('href', '#i-check');
      resetButton.hidden = false;
      applied = true;
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 30 : 650);
  }

  $$('[data-scenario]').forEach(button => button.addEventListener('click', () => selectMode(button.dataset.scenario)));
  applyButton.addEventListener('click', applyMode);
  resetButton.addEventListener('click', () => selectMode(currentMode));
  $$('[data-try]').forEach(button => button.addEventListener('click', () => {
    selectMode(button.dataset.try, true);
    $('#demo').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'});
    applyButton.focus({preventScroll:true});
  }));

  const menuButton = $('.menu-toggle');
  const nav = $('#navigation');
  function closeMenu() { nav.classList.remove('open'); menuButton.setAttribute('aria-expanded', 'false'); menuButton.setAttribute('aria-label', tr('Ouvrir le menu')); }
  menuButton.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    nav.classList.toggle('open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? tr('Fermer le menu') : tr('Ouvrir le menu'));
  });
  $$('#navigation a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  document.addEventListener('click', event => { if (!event.target.closest('.site-header')) closeMenu(); });

  $('a[href="#mcp-definition"]').addEventListener('click', () => { $('#mcp-definition').open = true; });
  function safeExternal(value) { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; } }
  const config = window.ZAK_CONFIG || {};
  const builds = config.downloads || {};
  // Browsers don't reliably tell Apple Silicon from Intel: Apple Silicon first (every Mac sold since 2021).
  const ua = navigator.userAgent;
  const os = /Windows/i.test(ua) ? 'win' : /Mac/i.test(ua) && !/iPhone|iPad/i.test(ua) ? 'macArm' : 'all';
  const links = {
    download: safeExternal(builds[os]) || safeExternal(builds.all),
    github: safeExternal(config.githubUrl),
    releases: safeExternal(builds.all)
  };
  for (const [name, url] of Object.entries(links)) if (url) $$(`[data-${name}]`).forEach(link => { link.href = url; });
  // Under the main button: the other builds.
  // Language menu: remembered, so that the main page stops sending you to your browser's language.
  $$('[data-language]').forEach(select => select.addEventListener('change', () => {
    const option = select.selectedOptions[0];
    try { localStorage.setItem('zak-lang', option.value); } catch {}
    location.href = option.dataset.href;
  }));
  const others = $('#other-builds');
  if (others && os !== 'all') {
    const names = { macArm: 'Mac Apple Silicon', macIntel: 'Mac Intel', win: 'Windows' };
    const rest = Object.keys(names).filter(key => key !== os && safeExternal(builds[key]));
    others.append(tr('Aussi pour '));
    rest.forEach((key, i) => {
      if (i > 0) others.append(tr(' et '));
      const a = document.createElement('a');
      a.href = safeExternal(builds[key]); a.textContent = names[key];
      others.append(a);
    });
    others.hidden = false;
  }
})();
