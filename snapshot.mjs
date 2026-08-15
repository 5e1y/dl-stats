// Relève les compteurs de téléchargement GitHub et ajoute un point à data/history.json.
// Les compteurs de l'API GitHub sont cumulés et sans horodatage : le seul moyen
// d'obtenir une vue par date est de les relever régulièrement et de garder les relevés.
import { readFileSync, writeFileSync } from 'node:fs'

const REPOS = [
  '5e1y/aldo-releases',
  '5e1y/open-negative-initiative-releases',
  '5e1y/roadmapped',
]

const FILE = 'data/history.json'
const bucket = n => (n.endsWith('.zip') ? 'zip' : n.endsWith('.dmg') ? 'dmg' : 'autres')

const headers = {
  accept: 'application/vnd.github+json',
  'user-agent': 'dl-stats-snapshot',
  ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
}

async function counts(repo) {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`, { headers })
  if (!res.ok) throw new Error(`${repo} → HTTP ${res.status}`)
  const t = { dmg: 0, zip: 0, autres: 0 }
  for (const rel of await res.json())
    for (const a of rel.assets) t[bucket(a.name.toLowerCase())] += a.download_count
  return [t.dmg, t.zip, t.autres]
}

const history = JSON.parse(readFileSync(FILE, 'utf8'))
const point = { t: new Date().toISOString(), r: {} }

for (const repo of REPOS) {
  try {
    point.r[repo] = await counts(repo)
  } catch (e) {
    // Un repo qui échoue ne doit pas faire perdre le relevé des autres : on
    // l'omet du point, le dashboard traite une clé absente comme un trou.
    console.error(`skip ${repo}: ${e.message}`)
  }
}

if (!Object.keys(point.r).length) {
  console.error('aucun repo relevé — point non enregistré')
  process.exit(1)
}

const last = history.snapshots.at(-1)
const same = last && JSON.stringify(last.r) === JSON.stringify(point.r)

// Un compteur identique au relevé précédent n'apporte rien à la série (le
// dashboard interpole entre deux points), sauf s'il est vieux : on garde alors
// un point par semaine pour que la courbe montre bien un plateau et pas un trou.
const WEEK = 7 * 864e5
if (same && Date.now() - Date.parse(last.t) < WEEK) {
  console.log('compteurs inchangés — rien à écrire')
  process.exit(0)
}

history.snapshots.push(point)
history.updated = point.t
writeFileSync(FILE, JSON.stringify(history) + '\n')
console.log(`point ajouté : ${point.t} (${history.snapshots.length} au total)`)
