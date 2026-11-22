/**
 * The stdio bridge that Claude Code, Codex and Claude Desktop launch to reach Zak's MCP server
 * (they speak MCP over stdin/stdout; Zak serves it over HTTP on 127.0.0.1). It runs with Zak's own
 * executable as Node (ELECTRON_RUN_AS_NODE=1), so nothing else needs to be installed, and reads
 * the current port and token from Zak's connection file on every message: no secret ends up in the
 * agents' configuration files, and a new token in Zak's settings breaks nothing.
 *
 * Kept as plain JavaScript in a string: Zak writes it to its profile folder (connect.ts).
 */
export const BRIDGE_SOURCE = String.raw`'use strict'
// Zak MCP bridge (written by Zak): stdio <-> http://127.0.0.1:<port>/mcp. Do not edit.
const fs = require('fs')
const http = require('http')
const readline = require('readline')
const connectionFile = process.argv[2]

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n')
}

function fail(request, text) {
  if (request && request.id !== undefined) send({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: text } })
}

function forward(line) {
  let request
  try {
    request = JSON.parse(line)
  } catch {
    return Promise.resolve()
  }
  let connection
  try {
    connection = JSON.parse(fs.readFileSync(connectionFile, 'utf8'))
  } catch {
    connection = null
  }
  if (!connection || !connection.port || !connection.token) {
    fail(request, "Zak n'est pas ouvert, ou « Laisser Claude Code ou Codex piloter Zak » est désactivé dans ses réglages.")
    return Promise.resolve()
  }
  const body = Buffer.from(line)
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: connection.port,
        path: '/mcp',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: 'Bearer ' + connection.token,
          'Content-Length': body.length
        }
      },
      (res) => {
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          if (res.statusCode === 202 || data.trim() === '') return resolve()
          if (res.statusCode !== 200) {
            fail(request, 'Zak a répondu ' + res.statusCode + '.')
            return resolve()
          }
          const type = String(res.headers['content-type'] || '')
          if (type.includes('text/event-stream')) {
            for (const event of data.split(/\r?\n\r?\n/)) {
              const payload = event
                .split(/\r?\n/)
                .filter((l) => l.startsWith('data:'))
                .map((l) => l.slice(5).trim())
                .join('\n')
              if (payload) {
                try {
                  send(JSON.parse(payload))
                } catch {}
              }
            }
          } else {
            try {
              const parsed = JSON.parse(data)
              for (const message of Array.isArray(parsed) ? parsed : [parsed]) send(message)
            } catch {}
          }
          resolve()
        })
      }
    )
    req.on('error', () => {
      fail(request, "Zak n'est pas ouvert, ou « Laisser Claude Code ou Codex piloter Zak » est désactivé dans ses réglages.")
      resolve()
    })
    req.end(body)
  })
}

// One message at a time, in order.
let queue = Promise.resolve()
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (line.trim()) queue = queue.then(() => forward(line))
})
`
