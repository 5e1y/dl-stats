// Reconstruit un historique ESTIMÉ antérieur au premier relevé réel.
//
// On connaît, pour chaque version : son total cumulé de téléchargements et sa
// date de publication. On ne connaît jamais la date des téléchargements. Ce
// script répartit donc le total de chaque version sur les jours qui suivent sa
// sortie, avec une décroissance exponentielle — le profil d'une release desktop,
// piqué les premiers jours puis en traîne longue.
//
// C'est un modèle, pas une mesure. Il est figé une fois pour toutes : les
// compteurs qui montent après sa génération sont mesurés, jamais réestimés,
// donc aucun double comptage avec la série du cron.
//
//   node backfill.mjs [--tau 10] [--out data/backfill.json]
import { writeFileSync } from 'node:fs'

const REPOS = ['5e1y/aldo-releases', '5e1y/open-negative-initiative-releases']
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d }

const TAU = Number(arg('tau', 10))      // demi-vie de l'intérêt pour une version, en jours
const OUT = arg('out', 'data/backfill.json')
const DAY = 864e5
const KEYS = ['dmg', 'zip', 'autres']

const bucket = n => n.endsWith('.zip') ? 'zip' : n.endsWith('.dmg') ? 'dmg' : 'autres'
// 'sv' → YYYY-MM-DD en heure locale : même convention de jour que le dashboard,
// sinon les jours glissent d'un cran pour les fuseaux à l'est de UTC.
const dayKey = t => new Date(t).toLocaleDateString('sv')

const headers = {
  accept: 'application/vnd.github+json',
  'user-agent': 'dl-stats-backfill',
  ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
}

async function releases(repo) {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`, { headers })
  if (!res.ok) throw new Error(`${repo} → HTTP ${res.status}`)
  return (await res.json()).map(rel => {
    const t = { dmg: 0, zip: 0, autres: 0 }
    for (const a of rel.assets) t[bucket(a.name.toLowerCase())] += a.download_count
    return { tag: rel.tag_name, published: rel.published_at || rel.created_at, ...t }
  }).filter(r => r.published)
}

// Répartit le total d'une version sur [sortie, aujourd'hui] en exp(-âge/TAU),
// renormalisé sur la fenêtre réellement disponible : la somme des jours vaut
// exactement le compteur observé, quelle que soit l'ancienneté de la version.
function spread(rel, today) {
  const t0 = new Date(rel.published).setHours(0, 0, 0, 0)
  const n = Math.max(1, Math.round((today - t0) / DAY) + 1)
  const w = Array.from({ length: n }, (_, d) => Math.exp(-d / TAU))
  const sum = w.reduce((a, b) => a + b, 0)
  return w.map((wd, d) => ({
    day: dayKey(t0 + d * DAY),
    ...Object.fromEntries(KEYS.map(k => [k, rel[k] * wd / sum])),
  }))
}

const today = new Date().setHours(0, 0, 0, 0)
const out = { generated: new Date().toISOString(), tau_days: TAU, rows: {} }

for (const repo of REPOS) {
  const rels = await releases(repo)
  const days = new Map()
  for (const rel of rels)
    for (const d of spread(rel, today)) {
      const row = days.get(d.day) || { d: d.day, dmg: 0, zip: 0, autres: 0 }
      for (const k of KEYS) row[k] += d[k]
      days.set(d.day, row)
    }

  const rows = [...days.values()]
    .sort((a, b) => a.d.localeCompare(b.d))
    .map(r => ({ d: r.d, ...Object.fromEntries(KEYS.map(k => [k, +r[k].toFixed(1)])) }))

  out.rows[repo] = rows
  const tot = rows.reduce((n, r) => n + r.dmg + r.zip, 0)
  const real = rels.reduce((n, r) => n + r.dmg + r.zip, 0)
  console.log(`${repo}: ${rows.length} jours, ${tot.toFixed(0)} installables estimés (observé ${real})`)
}

writeFileSync(OUT, JSON.stringify(out) + '\n')
console.log(`→ ${OUT}`)
