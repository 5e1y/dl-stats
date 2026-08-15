# dl-stats

Historique des téléchargements des releases GitHub d'Aldo Reborn, Open Negative
Initiative et Roadmapped.

L'API GitHub expose `download_count` comme un **compteur cumulé sans horodatage** :
il n'existe aucun endpoint qui donne l'historique. La seule façon d'obtenir une vue
par date est de relever ces compteurs régulièrement et d'archiver les relevés —
c'est ce que fait ce repo.

- `snapshot.mjs` — relève les compteurs et ajoute un point à `data/history.json`
- `.github/workflows/snapshot.yml` — cron quotidien (05:17 UTC) + `workflow_dispatch`

## Format

```jsonc
{
  "updated": "2026-08-15T05:17:00.000Z",
  "snapshots": [
    {
      "t": "2026-08-15T05:17:00.000Z",
      "r": { "5e1y/aldo-releases": [dmg, zip, autres] }   // compteurs CUMULÉS
    }
  ]
}
```

Les valeurs sont cumulées, pas des deltas : le consommateur dérive les
téléchargements par jour en soustrayant deux points consécutifs. Un repo absent
d'un point est un trou (relevé en échec), pas un zéro.

Un relevé identique au précédent n'est pas enregistré, sauf s'il date de plus
d'une semaine — ce qui garde un point de contrôle pour distinguer un plateau
d'une interruption du cron.

## Consommateur

Le dashboard lit ce fichier directement via `raw.githubusercontent.com`
(CORS ouvert, cache ~5 min). Le repo doit donc rester **public** — les données
le sont déjà, puisqu'elles viennent de l'API publique des releases.

## Relevé manuel

`gh workflow run snapshot -R 5e1y/dl-stats`, ou l'onglet Actions → Run workflow.
