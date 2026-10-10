# Prompt de démarrage

À coller dans Claude Code ou Codex, ouvert dans ce dossier.
Ensuite, pour chaque étape : « Étape suivante de docs/ROADMAP.md. »

---

On démarre Kinesis : un studio 3D dans le navigateur pour comprendre et optimiser un
entrepôt robotisé — voir la flotte bouger, voir où ça bloque, modifier l'entrepôt, mesurer.
Je veux une simulation très fluide et une interface épurée mais technique.

Avant de coder :
1. Lis `AGENTS.md`, `docs/SCOPE.md` et `docs/ROADMAP.md`.
2. Lis les skills `ponytail`, `realtime-3d` et `design-direction` dans `.agents/skills/`,
   et dis-moi dans ton rapport que tu les as lus.

Technologies imposées : React + React Three Fiber + drei, en TypeScript, avec Vite.
React plutôt que JavaScript sans framework, pour que le code reste maintenable quand les
fonctionnalités s'empilent. Aucune autre dépendance sans me demander (Playwright pour le
script de vérification est accepté).

Fais **uniquement l'étape 0** de `docs/ROADMAP.md`, de la façon la plus simple possible.
Vérifie-la avec `npm run check` (erreurs console, cadence mesurée, capture d'écran).
Puis arrête-toi et rends-moi compte : ce qui marche, ce qui ne marche pas, les chiffres
mesurés. Ne commence pas l'étape 1.
