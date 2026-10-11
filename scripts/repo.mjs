// Garde-fous du dépôt, sans dépendance. `--setup` : préparation d'un clone (lancé par npm install dans web/).
// Sans option : contrôle, lancé par le hook pre-commit et par npm run verify.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const skills = join(root, '.agents', 'skills'), link = join(root, '.claude', 'skills')

if (process.argv.includes('--setup')) {
  // Claude lit .claude/skills, Codex .agents/skills : une seule copie versionnée, reliée par une jonction.
  if (!existsSync(link)) { mkdirSync(join(root, '.claude'), { recursive: true }); symlinkSync(skills, link, 'junction') }
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root })
}

const errors = []
// Les documents du projet vivent dans docs/ ; une copie à la racine finit toujours périmée.
const allowed = new Set(['AGENTS.md', 'CLAUDE.md', 'README.md'])
for (const f of readdirSync(root)) if (f.toLowerCase().endsWith('.md') && !allowed.has(f)) {
  errors.push(`${f} à la racine : les documents vont dans docs/ (racine : ${[...allowed].join(', ')}).`)
}
if (!existsSync(link) || realpathSync.native(link) !== realpathSync.native(skills)) {
  errors.push('.claude/skills ne pointe pas vers .agents/skills : lancer `npm install` dans web/ (ou `node scripts/repo.mjs --setup`).')
}
// Journal : la plus récente en haut, sinon un agent qui lit le début rate le travail de l'autre.
const dates = readFileSync(join(root, 'docs', 'JOURNAL.md'), 'utf8').match(/^- \d{4}-\d{2}-\d{2}/gm) ?? []
for (let i = 1; i < dates.length; i++) if (dates[i] > dates[i - 1]) {
  errors.push(`docs/JOURNAL.md : entrée ${dates[i].slice(2)} sous une entrée plus ancienne, la plus récente va en haut.`); break
}
let hooks = ''
try { hooks = execFileSync('git', ['config', '--get', 'core.hooksPath'], { cwd: root }).toString().trim() } catch {}
if (hooks !== '.githooks') errors.push('Hook de commit inactif : lancer `node scripts/repo.mjs --setup`.')

if (errors.length) { console.error(`Contrôle du dépôt :\n- ${errors.join('\n- ')}`); process.exit(1) }
console.log('Contrôle du dépôt : OK (documents dans docs/, journal ordonné, skills reliés, hook actif)')
