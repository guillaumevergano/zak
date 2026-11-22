/**
 * Passwords CSV, the format every browser and password manager exports: Chrome, Edge, Brave
 * (name,url,username,password,note), Firefox (url,username,password,…), Safari
 * (Title,URL,Username,Password,Notes,OTPAuth), Bitwarden (…,login_uri,login_username,login_password),
 * 1Password, Dashlane… Columns are found by name, in any order.
 */
export interface CsvLogin {
  url: string
  username: string
  password: string
}

/** RFC 4180 rows: quoted fields may hold commas, quotes ("") and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const input = text.replace(/^﻿/, '')
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && input[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''))
}

const COLUMNS = {
  url: ['url', 'login_uri', 'website', 'login url', 'web site', 'origin'],
  username: ['username', 'login_username', 'login', 'user name', 'email', 'login name'],
  password: ['password', 'login_password']
}

/** The logins of a passwords CSV; throws when it has no url/username/password columns. */
export function parseLoginsCsv(text: string): CsvLogin[] {
  const [header, ...rows] = parseCsv(text)
  if (!header) return []
  const names = header.map((h) => h.trim().toLowerCase())
  const find = (aliases: string[]): number => names.findIndex((n) => aliases.includes(n))
  const url = find(COLUMNS.url)
  const username = find(COLUMNS.username)
  const password = find(COLUMNS.password)
  if (url === -1 || password === -1) throw new Error("Ce fichier n'est pas un export de mots de passe (colonnes url et password introuvables).")
  return rows
    .map((r) => ({ url: (r[url] ?? '').trim(), username: username === -1 ? '' : (r[username] ?? '').trim(), password: r[password] ?? '' }))
    .filter((l) => /^https?:\/\//i.test(l.url) && l.password !== '')
}

const quote = (value: string): string => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)

/** Chrome's export format, which every other browser imports. */
export function toLoginsCsv(logins: { origin: string; username: string; password: string }[]): string {
  const lines = ['name,url,username,password,note']
  for (const l of logins) {
    const name = l.origin.replace(/^https?:\/\//, '')
    lines.push([name, l.origin, l.username, l.password, ''].map(quote).join(','))
  }
  return `${lines.join('\n')}\n`
}
