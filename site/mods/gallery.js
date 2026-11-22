// Mods gallery: renders mods.json (shared by the French and English pages).
const lang = document.documentElement.lang === 'en' ? 'en' : 'fr'
const REPO = 'https://github.com/guillaumevergano/zak'
const T = {
  fr: { theme: 'Thème', newtab: 'Nouvel onglet', prompt: 'Le prompt qui l’a créé', download: 'Télécharger', source: 'Voir le code', copy: 'Copier le prompt', copied: 'Copié', by: 'par' },
  en: { theme: 'Theme', newtab: 'New tab', prompt: 'The prompt that made it', download: 'Download', source: 'View the code', copy: 'Copy the prompt', copied: 'Copied', by: 'by' }
}[lang]
const base = document.querySelector('script[data-base]')?.dataset.base ?? ''

const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props)
  node.append(...children)
  return node
}

fetch(`${base}mods.json`)
  .then((r) => r.json())
  .then((mods) => {
    const grid = document.getElementById('mods')
    for (const mod of mods) {
      const preview = el('div', { className: 'preview' })
      if (mod.preview) preview.append(el('img', { src: base + mod.preview, alt: '', loading: 'lazy' }))
      else for (const color of mod.swatches ?? []) preview.append(el('div', { className: 'swatch', style: `background:${color}` }))
      const copy = el('button', { className: 'btn ghost', type: 'button', textContent: T.copy })
      copy.addEventListener('click', () =>
        navigator.clipboard.writeText(mod.prompt[lang]).then(() => {
          copy.textContent = T.copied
          setTimeout(() => (copy.textContent = T.copy), 1500)
        })
      )
      grid.append(
        el('article', { className: 'mod' }, [
          preview,
          el('div', { className: 'body' }, [
            el('div', { className: 'kinds' }, mod.kinds.map((k) => el('span', { className: 'kind', textContent: T[k] }))),
            el('h2', { textContent: mod.name }),
            el('p', { textContent: `${mod.description[lang]} — ${T.by} ${mod.author}` }),
            el('details', {}, [el('summary', { textContent: T.prompt }), el('p', { className: 'prompt', textContent: mod.prompt[lang] })]),
            el('div', { className: 'actions' }, [
              el('a', { className: 'btn', href: `${base}${mod.id}.zip`, textContent: T.download }),
              el('a', { className: 'btn ghost', href: `${REPO}/tree/main/docs/customize/mods/${mod.id}`, textContent: T.source }),
              copy
            ])
          ])
        ])
      )
    }
  })
