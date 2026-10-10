---
name: simulation-core
description: Règles du moteur de simulation de Kinesis (web/src/sim/). À lire avant de créer ou modifier quoi que ce soit dans web/src/sim/ — modèle de cellules, step(), graine, réservations, temps perdu, tests.
---

# simulation-core

La simulation est la seule source de vérité. Le rendu l'affiche, il ne la calcule pas.

## Frontière

- `web/src/sim/` est du TypeScript **pur** : aucun import de React, three.js, drei, du DOM
  ou de `window`. Il doit tourner tel quel dans Node (tests) et, plus tard, dans un Web Worker.
- Le rendu lit l'état ; il ne le modifie jamais. Les commandes de l'utilisateur (pause,
  vitesse, édition) passent par des fonctions exportées de `sim/`.
- Aucune règle du modèle (déplacement, priorité, capacité) dans un composant ou la scène.
  Seule exception : l'interpolation d'affichage entre deux pas, déclarée comme telle.

## Temps

- Le temps avance par `step()` à **pas fixe** (`dt` constant, en secondes simulées).
  Jamais de `dt` variable lié à la cadence d'images.
- Le temps simulé est un compteur de pas (entier) ; les secondes en dérivent.
- La simulation ne connaît ni les images, ni l'horloge réelle.

## Déterminisme

- Même graine + mêmes paramètres ⇒ même état, pas à pas, sur toute machine.
- Interdits dans `sim/` : `Math.random()`, `Date`, `performance.now()`, et tout ce qui
  dépend de l'horloge ou d'un ordre d'itération non maîtrisé.
- Un seul générateur pseudo-aléatoire à graine explicite (quelques lignes, sans
  dépendance), porté par l'état. La graine fait partie du résultat.
- Ordre de traitement des robots fixe et documenté (par identifiant), pas l'ordre d'arrivée.

## Modèle

- Un **graphe de cellules 3D** (x, y, niveau), plus une règle de **transition verticale**,
  plus un **mode d'accès au stock**. Un seul moteur ; Skypod, Ascenseurs et AutoStore sont
  des **profils** (données + quelques règles), jamais trois simulateurs.
- On n'implémente que ce que demande l'étape en cours (`docs/ROADMAP.md`). Pas de branche
  « pour plus tard ».
- Une cellule n'est occupée que par un robot à la fois : les mouvements passent par des
  **réservations** de cellules (et de colonnes ou gaines pour le vertical).
- État en tableaux et objets simples, sérialisable en JSON : il doit pouvoir être exporté,
  comparé et transféré à un Worker.

## Congestion

- Le temps perdu est mesuré **dans `sim/`**, par cellule : temps réel de passage moins
  temps de trajet libre (attente, blocage, détour). La fréquentation est une autre mesure,
  qui porte son propre nom.

## Tests

- `node --test`, sans dépendance, à côté du code (`*.test.ts`).
- Toujours au moins : même graine ⇒ même état après N pas ; graines différentes ⇒ états
  différents quand le modèle a de l'aléa.
- Chaque invariant du modèle a son test : jamais deux robots sur une cellule, aucune montée
  hors d'une colonne, réservations libérées.
