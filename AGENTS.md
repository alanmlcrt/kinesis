# AGENTS.md — contrat de travail (Claude et Codex)

Codex lit ce fichier directement ; Claude Code le lit via `CLAUDE.md` (`@AGENTS.md`).
Un seul contrat pour les deux.

## Le projet

Kinesis : un studio 3D dans le navigateur pour comprendre et optimiser un entrepôt
robotisé. Périmètre : `docs/SCOPE.md`. Étape en cours : `docs/ROADMAP.md`.

## Début et fin de session (obligatoire, Claude et Codex)

Claude et Codex travaillent sur le même dépôt, chacun à son tour. Fichiers de suivi
communs : ce fichier, `docs/ROADMAP.md`, `docs/JOURNAL.md`, `docs/SCOPE.md`,
`docs/VERIFICATION.md`, `docs/ARCHITECTURE.md` (carte du code et points d’extension).

En début de session, avant toute autre action :
1. Lire `docs/ROADMAP.md` (étape en cours) et `docs/JOURNAL.md` depuis le haut, au moins
   jusqu'à la dernière entrée de l'autre agent.
2. `git status` et `git log --oneline -10` : travail non commité ou commité par l'autre.
3. Lire `docs/SCOPE.md` et `docs/VERIFICATION.md` avant de modifier le comportement,
   `docs/ARCHITECTURE.md` avant de modifier la structure (et le tenir à jour).
4. Dire dans la première réponse ce qui a changé depuis la dernière session.

En fin de session, avant de rendre la main : entrée en tête de `docs/JOURNAL.md`, signée
(`- AAAA-MM-JJ — Claude — …` ou `— Codex — …`), et feuille de route à jour.

## Technologies

- **React + React Three Fiber + drei**, TypeScript strict, Vite.
- La simulation est un module TypeScript **pur** (`web/src/sim/`), sans React ni three.js,
  testable seul. Le rendu l'affiche, il ne la calcule pas.
- Tests de `sim/` : le lanceur intégré de Node (`node --test`), sans dépendance.
- Playwright, en dépendance de développement, pour `npm run check`.
- **Aucune autre dépendance sans accord de l'utilisateur.**

## Méthode (obligatoire)

1. **Une étape à la fois** : celle de `docs/ROADMAP.md`. Ne pas commencer la suivante, ne
   pas préparer le terrain pour plus tard.
2. **Le plus simple qui marche** : pas d'abstraction pour un besoin futur.
3. **Vérifier dans le navigateur** avant de dire « fini » : `npm run check` ouvre la page,
   relève les erreurs console, mesure la cadence d'images, prend une capture. Les tests
   unitaires ne suffisent pas.
4. **S'arrêter et rendre compte** : ce qui marche, ce qui ne marche pas, les chiffres
   mesurés. Puis attendre l'utilisateur.
5. Un bug trouvé se corrige avant d'ajouter quoi que ce soit.
6. Cocher l'étape dans `docs/ROADMAP.md`, ajouter une ligne datée dans `docs/JOURNAL.md`.

## Vérification à chaque implémentation et à chaque étape

Exigence de l'utilisateur du 10 octobre 2026 : tester chaque implémentation, chaque
modification de comportement et chaque correction, ainsi que les fonctionnalités
existantes qu'elles peuvent affecter, avant de les déclarer terminées.

- Exécuter `npm test`, `npm run build` puis `npm run check` sur le build courant.
- Couvrir le parcours normal, les cas limites et les erreurs récupérables concernés.
  Toute correction de bug laisse un contrôle de régression reproductible.
- Identifier les comportements ajoutés/modifiés et les contrôles qui les exercent.
  Exécuter les nouveaux tests, puis la vérification complète via `npm run verify`.
- Contrôler les invariants du moteur, le déterminisme et la concordance moteur/rendu
  lorsqu'ils sont concernés ; vérifier les redémarrages et les ressources de la scène.
- Inspecter les captures réellement produites, sur ordinateur et sur fenêtre mobile
  pour les changements d'interface. Les assertions seules ne valident pas le rendu visuel.
- Un échec bloque la conclusion « terminé » : corriger puis relancer les contrôles touchés.
- Rapporter commandes, cas exercés, résultats mesurés et limites restantes dans le journal.
  Ne pas présenter des tests réussis comme une garantie de 100 % des usages futurs.

## Skills

Versionnés dans `.agents/skills/` (lu par Codex) ; `.claude/skills/` pointe vers les mêmes
dossiers (lu par Claude). **Lire le skill concerné avant de commencer**, et le dire dans le
rapport.

| Skill | Quand |
|---|---|
| `ponytail` | Toujours, avant d'écrire du code. |
| `simulation-core` | Avant de toucher à `web/src/sim/`. |
| `realtime-3d` | Avant de toucher à la scène 3D ou à tout code exécuté à chaque image. |
| `design-direction` | Avant toute interface, visualisation ou mise en page. |
| `experiment-protocol` | Avant tout code de mesure, de campagne ou d'export de résultat. |
| `ui-ux-design` | Avant de concevoir un écran. En cas de conflit, `design-direction` gagne. |
| `web-design-guidelines` | Pour auditer un écran avant de le déclarer fini. |
| `web-accessibility` | Clavier, focus, ARIA, contraste. |

## Règles

- La simulation est la seule source de vérité : aucune règle du modèle dans les composants
  React ou la scène. Seule exception : l'interpolation d'affichage entre deux pas, déclarée.
- Un seul moteur, plusieurs profils d'architecture.
- Déterminisme à graine donnée : pas de `Math.random()` ni d'horloge dans `sim/`.
- Toute mesure affichée respecte `experiment-protocol` (réplications, intervalle de
  confiance, base de normalisation, « un seul run » quand c'en est un).
- N'inventer aucun chiffre, aucune performance, aucune référence.
- Un manque ou une contradiction dans `SCOPE.md` se signale à l'utilisateur.

## Dépôt

- Documents du projet uniquement dans `docs/`. À la racine : `AGENTS.md`, `CLAUDE.md`,
  `README.md` seulement, jamais de copie d'un document de `docs/`.
- Skills : seule copie versionnée dans `.agents/skills/`. `.claude/skills` est une jonction
  locale, créée avec le hook de commit par `npm install` dans `web/`
  (ou `node scripts/repo.mjs --setup`).
- Le hook `pre-commit` lance `scripts/repo.mjs`, `npm test` et `npm run build`. Ne jamais
  le contourner (`--no-verify`). Avant de commiter un changement de comportement :
  `npm run verify` complet.
- En cochant une étape, relire toute `docs/ROADMAP.md` et mettre à jour chaque mention
  devenue fausse (« reste à réaliser », ordre des étapes).

## Sorties shell

Claude passe par `rtk` automatiquement (hook). Codex préfixe les commandes bavardes :
`rtk npm test`, `rtk npm run build`, `rtk git status`.

## Jamais sans accord explicite de l'utilisateur

Créer un remote, `git push`, `git merge` vers `main`, ajouter une dépendance.
