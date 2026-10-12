# Architecture de Kinesis

Carte du code pour reprendre le projet vite et le faire évoluer sans tout relire.
À tenir à jour à chaque changement de structure (nouveau module, nouvelle frontière,
nouveau point d’extension). Dernière mise à jour : 12 octobre 2026.

## Vue d’ensemble

```
web/src/
  sim/            moteur pur (TypeScript, sans DOM/React/three) — seule source de vérité
  scene/          géométries et matériaux 3D (three.js), sans règle du modèle
  main.tsx        coquille de l’app : onglets, horloge, scène 3D, commandes de lecture
  Editor.tsx      écran Concevoir (matrice + cartes)
  Lab.tsx         instruments de Simuler (fiche robot, courbes en direct)
  Congestion.tsx  « Où ça bloque » : carte de temps perdu 3D + coupe 2D
  Campaign.tsx    Analyser : campagnes de saturation et comparaisons (fenêtre)
  Exploration.tsx Analyser : balayage densité/débit (fenêtre)
  *.worker.ts     calculs de campagne/exploration hors du fil d’affichage
  preferences.ts  sauvegarde locale (configuration appliquée, plans nommés)
  lab.css         styles des écrans ; jetons de couleur et base dans index.html
web/check/        contrôles navigateur Playwright (npm run check), captures, results.json
scripts/repo.mjs  garde-fous du dépôt (documents, hook pre-commit, jonction des skills)
```

Flux d’une session : **Concevoir** (brouillon `Layout`) → « Appliquer le plan » →
`createSim(seed, count, layout, control)` → **Simuler** (`step()` à pas fixe dans
`useFrame`, rendu interpolé) → **Analyser** (réplications indépendantes dans des Workers,
sur les mêmes fonctions `sim/` que les tests Node).

## Frontières (à ne pas casser)

1. `sim/` n’importe rien d’autre que `sim/`. Il tourne tel quel dans Node, un Worker et
   le navigateur. Pas de `Math.random`, de date ni d’horloge (skill `simulation-core`).
2. Le rendu lit l’état, ne l’écrit jamais. Exception déclarée : l’interpolation
   d’affichage entre deux pas (`Robots` dans `main.tsx`).
3. Toute règle du modèle (accessibilité, chevauchement, capacité, mesures) vit dans
   `sim/` ; l’interface appelle ces fonctions et affiche leurs erreurs (`RangeError`
   en français, prêtes à montrer).
4. Les nombres affichés viennent de `sim/` (`layoutMetrics`, `analyzeFleet`, compteurs
   du `State`) ; aucun calcul de mesure dans un composant, sauf mise en forme.

## Le moteur (`web/src/sim/`)

| Module | Rôle | Entrées / sorties clés |
|---|---|---|
| `geometry.ts` | Contrat géométrique partagé moteur/plan/scène | `GEOMETRY`, `LEVEL_HEIGHT` |
| `layout.ts` | Plan : type `Layout`, validation, graphe du sol, générateurs, édition | `validateLayout` → nb de baies ; `layoutFloor` ; `editLayout` ; `resizeLayout` ; `regularLayout` ; `aisleLayout` ; `withProfile` ; `layoutMetrics` ; `parseConfiguration` |
| `sim.ts` | État et pas de temps | `createSim` → `State` ; `step(state)` ; `robotPosition` / `binPosition` pour le rendu |
| `control.ts` | Pilotage au sol (trajet entier, fenêtre, RHCR priorisé) | `route`, `search`, `Control` |
| `rhcr.ts` | Noyau de recherche à fenêtre glissante, aussi utilisé sur graphes MAPF | `windowSearch`, `rollingWindow` |
| `campaign.ts` | Protocole de mesure : réplications, chauffe MSER-5, IC 95 %, Pareto, base de normalisation | `validateCampaign`, `runReplication`, `analyzeFleet`, `pareto` |
| `exploration.ts` | Balayage densité/débit à emprise égale | `explorationPlans`, `analyzeExploration`, `saturation` |

Modèle de cellules : sol `width × depth`, 4 voisins. Cases paires (x et z pairs) =
emplacements (baie de stationnement, station, accès de grimpe) ; lignes et colonnes
impaires = voies. **Travée = rayonnage | allée de grimpe | rayonnage** (x − 1, x, x + 1 ;
x pair), un bac par côté et par niveau (`Bin.side`), posable sur toute ligne. L’allée se
traverse au sol, même sous un robot qui grimpe (`onGround` dans `sim.ts`). Rayonnages :
voies en 2025+, bloqués en classique (dos à dos jointifs). AutoStore : piles sur toute
cellule. Modèles par technologie : `TEMPLATES` / `templateLayout` (`layout.ts`). Limite :
2 500 travées. Profils
(`layout.profile`) : `skypod` (défaut, `generation` 2025+ ou classic), `lifts`
(gaines, graphe multi-étages), `autostore` (grille au sommet, piles). Un seul moteur :
un profil = données + quelques branches explicites dans `layoutFloor`, `floorNeighbors`,
`sim.ts` et le rendu.

## L’interface (`web/src/*.tsx`)

- `main.tsx` : `App` tient la simulation active (`useRef`, hors état React pour ne pas
  re-rendre à chaque image), l’onglet (fragment d’URL `#concevoir|#simulation|#analyser`),
  la révision (clé qui remplace proprement toutes les instances 3D) et `apply()`.
  L’horloge `clock` (lecture, vitesse, accumulateur) est un objet module lu par `useFrame`.
  Hors de Simuler, le `Canvas` passe en `frameloop="never"` : la scène cachée ne se
  redessine plus pendant Concevoir et Analyser.
- `Editor.tsx` : brouillon local (`draft`, historique de 50), gestes pointeur (peinture
  interpolée, clic droit = gomme, ligne/zone, poignées) et clavier ; grille et équipements
  mémorisés (le survol ne les recrée pas) ; bornes de pose lues dans `rackBounds`, toute
  validation passe par `sim/layout.ts`.
  Ne connaît pas la scène ; rend la main par `onApply(layout, count)`.
- `Lab.tsx`, `Congestion.tsx` : lecture à 4 Hz du `State` ; historique borné.
- `Campaign.tsx`, `Exploration.tsx` : paramètres → Worker → résultats + export JSON
  recalculable (manifeste). Encore en fenêtres superposées.
- Styles : jetons (`--accent`, `--radius`, `--shadow`…) sur `:root` dans `index.html`,
  écrans dans `lab.css`. Couleurs de la scène : `PALETTE` dans `scene/assets.ts`.

## Points d’extension (recettes)

- **Nouvelle mesure du plan** : l’ajouter à `layoutMetrics` (+ test), l’afficher dans la
  carte « Bilan du plan » de `Editor.tsx`. Si elle sert aux comparaisons, l’ajouter au
  manifeste dans `Campaign.tsx` et à `experiment-protocol` (définition, unité).
- **Nouvelle mesure de run** : compteur dans `State` incrémenté par `step()` (+ test
  d’invariant), lu par `Lab.tsx` (`metrics`) et, pour les campagnes, par
  `runReplication`/`analyzeFleet`.
- **Nouvel outil d’édition** : branche dans `editLayout` (validation incluse) puis bouton
  dans la barre d’outils de `Editor.tsx` ; peinture, ligne, zone et annulation suivent seules.
- **Nouveau modèle de plan** : entrée dans `TEMPLATES` et branche dans `templateLayout`
  (`layout.ts`), test de cycles dans `layout.test.ts` ; la carte apparaît seule.
- **Contrôles navigateur** : valeurs attendues via `web/check/plans.mjs` (`expected`,
  `usePlan`, `resetPlan`), calculées par le moteur.
- **Nouveau profil d’architecture** : valeur de `Layout['profile']`, règles dans
  `validateLayout`/`layoutFloor`/`floorNeighbors`/`sim.ts`, pastille dans `ARCHITECTURES`
  (`Editor.tsx`), géométrie dans `scene/assets.ts`, test de cycles dans `profiles.test.ts`,
  hypothèses dans `docs/PROFILES.md`.
- **Nouvelle méthode de pilotage** : `Control['method']` et branche dans `control.ts`,
  option dans `Controls` (`main.tsx`) et `Campaign.tsx`.
- **Nouvel onglet/écran** : entrée dans la liste des onglets de `App`, composant dédié ;
  le run se met en pause hors de Simuler (`navigate`).

## Couplages connus (dette assumée)

- `main.tsx` mélange coquille d’app, scène 3D et commandes (≈ 390 lignes) : à découper
  en `Scene.tsx` / `Controls.tsx` quand un deuxième écran 3D ou une nouvelle commande
  l’exigera.
- Analyser repose sur deux fenêtres superposées (`Campaign`, `Exploration`) plutôt qu’un
  écran ; c’est le prochain chantier d’interface si l’utilisateur le valide.
- La plupart des styles de base sont dans `index.html`.
- Les contrôles navigateur s’appuient sur les libellés accessibles et quelques attributs
  (`data-cell`, `data-preset`, `name`) : changer un libellé impose de mettre à jour
  `web/check/*.mjs`.

## Vérifier

`npm test` (Node, `sim/` et préférences) → `npm run build` → `npm run check`
(Playwright : parcours, erreurs console, cadence, captures dans `web/check/`) ;
`npm run verify` enchaîne tout. Règles détaillées : `docs/VERIFICATION.md`.
