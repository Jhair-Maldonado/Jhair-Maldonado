/**
 * Genera una tarjeta SVG con los lenguajes más usados en mis repositorios.
 *
 * Uso:  GH_TOKEN=... node scripts/languages.mjs <salida.svg>
 *
 * - Suma los bytes por lenguaje de cada repositorio propio (sin forks).
 * - Con el GITHUB_TOKEN de Actions solo ve repos públicos. Si existe el secreto
 *   LANGS_TOKEN (token personal con lectura de repos), incluye también los privados;
 *   la tarjeta nunca muestra nombres de repositorios, solo porcentajes.
 * - Se excluyen lenguajes de marcado o generados que distorsionan el resultado.
 * - Sin dependencias: usa fetch de Node 20+.
 */
import { writeFile } from 'node:fs/promises'

const USER = 'Jhair-Maldonado'
const TOP = 6
/** Lenguajes por debajo de este porcentaje no se muestran (ruido). */
const MIN_PCT = 1
const EXCLUDE = new Set(['HTML', 'CSS', 'Dockerfile', 'PowerShell', 'Batchfile', 'Shell', 'PLpgSQL'])
// Colores alineados con la identidad del perfil (azul noche y ámbar).
const PALETTE = ['#f5b83d', '#9fb3ff', '#5b7cff', '#4ade80', '#f4845f', '#c4b5fd']

const token = process.env.GH_TOKEN
const out = process.argv[2] ?? 'languages.svg'
const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'profile-languages-card',
  ...(token && { Authorization: `Bearer ${token}` }),
}

async function api(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} en ${path}`)
  return res.json()
}

/** Repos propios. Con un token personal, `/user/repos` incluye los privados. */
async function listRepos() {
  const personal = process.env.LANGS_PRIVATE === 'true'
  const path = personal
    ? '/user/repos?affiliation=owner&per_page=100'
    : `/users/${USER}/repos?type=owner&per_page=100`
  const repos = await api(path)
  return repos.filter((r) => !r.fork && !r.archived && r.name !== USER)
}

async function main() {
  const repos = await listRepos()
  const totals = new Map()
  for (const repo of repos) {
    const langs = await api(`/repos/${repo.full_name}/languages`)
    for (const [lang, bytes] of Object.entries(langs)) {
      if (EXCLUDE.has(lang)) continue
      totals.set(lang, (totals.get(lang) ?? 0) + bytes)
    }
  }

  const sum = [...totals.values()].reduce((a, b) => a + b, 0)
  if (!sum) throw new Error('No se encontraron lenguajes')
  const top = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP)
    .map(([name, bytes], i) => ({ name, pct: (bytes / sum) * 100, color: PALETTE[i] }))
    .filter((l) => l.pct >= MIN_PCT)

  await writeFile(out, render(top))
  console.log(`Tarjeta escrita en ${out}:`, top.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(', '))
}

function render(langs) {
  const width = 480
  const barX = 24
  const barW = width - 48
  let x = barX
  const segments = langs
    .map((l) => {
      const w = (l.pct / 100) * barW
      const rect = `<rect x="${x.toFixed(1)}" y="64" width="${Math.max(w, 2).toFixed(1)}" height="10" fill="${l.color}"/>`
      x += w
      return rect
    })
    .join('')

  const rows = langs
    .map((l, i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const lx = 24 + col * 220
      const ly = 106 + row * 28
      return `<circle cx="${lx + 5}" cy="${ly - 5}" r="5" fill="${l.color}"/>
    <text x="${lx + 18}" y="${ly}" class="lang">${escape(l.name)}</text>
    <text x="${lx + 196}" y="${ly}" class="pct" text-anchor="end">${l.pct.toFixed(1)}%</text>`
    })
    .join('\n    ')

  const height = 106 + Math.ceil(langs.length / 2) * 28
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="t">
  <title id="t">Lenguajes más usados: ${langs.map((l) => `${escape(l.name)} ${l.pct.toFixed(0)}%`).join(', ')}</title>
  <style>
    .h { font: 700 18px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; fill: #eef2fa; }
    .s { font: 400 13px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; fill: #a3b1cf; }
    .lang { font: 600 14px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; fill: #eef2fa; }
    .pct { font: 400 14px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; fill: #a3b1cf; }
  </style>
  <rect width="${width}" height="${height}" rx="14" fill="#0f1a33"/>
  <text x="24" y="36" class="h">Lenguajes más usados</text>
  <text x="${width - 24}" y="36" class="s" text-anchor="end">por volumen de código</text>
  <clipPath id="bar"><rect x="${barX}" y="64" width="${barW}" height="10" rx="5"/></clipPath>
  <g clip-path="url(#bar)">${segments}</g>
    ${rows}
</svg>
`
}

function escape(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
