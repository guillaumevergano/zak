(() => {
  'use strict';
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const EN = document.documentElement.lang === 'en';
  const tr = (fr, en) => (EN ? en : fr);
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
      prompt: tr('Passe Zak dans un thème violet, avec une touche de rose.', 'Give Zak a purple theme, with a touch of pink.'),
      idle: tr('Un navigateur qui prend tes couleurs. Regarde le résultat.', 'A browser in your colors. See the result.'),
      result: tr('Le thème violet et les accents roses sont appliqués.', 'The purple theme and pink accents are applied.'),
      caption: tr('Tes couleurs, dans chaque coin du navigateur.', 'Your colors, in every corner of the browser.'),
      apply: () => preview.classList.add('theme-violet')
    },
    layout: {
      prompt: tr('Mets ma barre de favoris à gauche.', 'Move my favorites bar to the left.'),
      idle: tr('Ton espace suit tes habitudes. Regarde le résultat.', 'Your space follows your habits. See the result.'),
      result: tr('Ta barre de favoris est maintenant à gauche.', 'Your favorites bar is now on the left.'),
      caption: tr('Ton organisation, du côté qui te convient.', 'Your layout, on the side that suits you.'),
      apply: () => preview.classList.add('sidebar-left')
    },
    favorites: {
      prompt: tr('Ajoute Figma et GitHub à mes favoris.', 'Add Figma and GitHub to my favorites.'),
      idle: tr('Tes outils habituels, toujours à portée de clic.', 'Your usual tools, always one click away.'),
      result: tr('Figma et GitHub ont rejoint tes favoris.', 'Figma and GitHub joined your favorites.'),
      caption: tr('Tes sites préférés trouvent leur place.', 'Your favorite sites find their place.'),
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
    $('span', applyButton).textContent = tr('Voir la transformation', 'See the transformation');
    $('use', applyButton).setAttribute('href', '#i-play');
    resetButton.hidden = true;
    $('.response-symbol').textContent = '✧';
    $('#demo-state').textContent = tr('Le navigateur, avant ta demande.', 'The browser, before your request.');
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
    $('span', applyButton).textContent = tr('La transformation se prépare…', 'Getting the transformation ready…');
    response.textContent = tr('Aperçu du changement en cours…', 'Previewing the change…');
    timer = setTimeout(() => {
      if (selectedMode !== currentMode) return;
      modeData[currentMode].apply();
      response.textContent = modeData[currentMode].result;
      $('#demo-state').textContent = modeData[currentMode].caption;
      $('.response-symbol').textContent = '✓';
      applyButton.disabled = false;
      applyButton.removeAttribute('aria-busy');
      $('span', applyButton).textContent = tr('Rejouer la transformation', 'Replay the transformation');
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
  function closeMenu() { nav.classList.remove('open'); menuButton.setAttribute('aria-expanded', 'false'); menuButton.setAttribute('aria-label', tr('Ouvrir le menu', 'Open the menu')); }
  menuButton.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    nav.classList.toggle('open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? tr('Fermer le menu', 'Close the menu') : tr('Ouvrir le menu', 'Open the menu'));
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
  const others = $('#other-builds');
  if (others && os !== 'all') {
    const names = { macArm: 'Mac Apple Silicon', macIntel: 'Mac Intel', win: 'Windows' };
    const rest = Object.keys(names).filter(key => key !== os && safeExternal(builds[key]));
    others.append(tr('Aussi pour ', 'Also for '));
    rest.forEach((key, i) => {
      if (i > 0) others.append(tr(' et ', ' and '));
      const a = document.createElement('a');
      a.href = safeExternal(builds[key]); a.textContent = names[key];
      others.append(a);
    });
    others.hidden = false;
  }
})();
