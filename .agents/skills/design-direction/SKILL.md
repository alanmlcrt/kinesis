---
name: design-direction
description: Direction visuelle de Kinesis — interface épurée mais technique. À lire avant toute interface, visualisation ou mise en page. Prime sur ui-ux-design en cas de conflit.
---

# design-direction

Un instrument, pas une vitrine. L'œil va à la flotte et aux mesures ; tout le reste
s'efface.

## Principes

- Parcours demandé le 11 octobre : **Concevoir → Simuler → Analyser**. Concevoir est un
  **écran** (pas une modale) : matrice interactive au centre — peinture à la souris,
  dimensions modifiées sur ses bords et par poignées —, réglages en cartes à droite ;
  appliquer mène à Simuler en pause, lancement explicite ; la scène 3D remplit l’espace
  Simuler sous la navigation. Les instruments restent superposés et repliables.
- Côté ludique industriel : configuration tangible, sélection visible et retour
  immédiat des instruments ; pas de score ni de résultat scientifique inventé.
- **Peu d'éléments, tous utiles.** Pas de décor : ni dégradés, ni halos, ni icônes
  décoratives, ni animations d'apparat.
- **Arrondi et doux** (demande du 11 octobre) : rayons `--radius` (16 px, cartes et
  panneaux), `--radius-s` (10 px, commandes), pastilles et onglets en `999px` ; une seule
  ombre douce `--shadow` pour les cartes et panneaux flottants ; boutons secondaires sur
  fond `--btn` sans bordure, champs bordés.
- **Technique = précis et lisible** : unités toujours affichées, chiffres alignés,
  libellés courts et exacts.
- **Honnêteté des mesures** : « un seul run », « solveur non validé » et la base de
  normalisation sont visibles à côté du chiffre, pas cachés dans une infobulle.

## Couleurs

- Direction claire demandée par l'utilisateur le 11 octobre 2026 : fond gris clair
  (`#f1f4f6`), panneaux blancs, sol gris légèrement plus soutenu (`#d5dde2`). Grille
  discrète (`#aebbc5` pour les cellules, `#8597a5` pour les sections).
- Gris neutres pour la structure (sol, racks, colonnes). La couleur est **réservée au
  sens** : état des robots, temps perdu, sélection.
- **Une seule couleur d'accent**, pour la sélection et l'action principale.
- Temps perdu : échelle **séquentielle** perceptuellement uniforme et lisible par les
  daltoniens (type viridis), avec légende et unité. Jamais rouge/vert seul.
- Couleurs définies à un seul endroit (variables CSS sur `:root`, constantes partagées
  pour la scène), jamais en dur dispersées.

## Typographie

- Pile système (`system-ui`), aucune police à télécharger.
- Chiffres en `font-variant-numeric: tabular-nums` (ou monospace) pour qu'ils ne
  sautent pas en direct.
- Trois tailles au plus : libellés, valeurs, titres de panneau.

## Lecture des données

- Vue 3D pour comprendre, **coupes par niveau** (vue de dessus 2D) pour lire les valeurs.
- Une carte porte le nom de ce qu'elle mesure (« temps perdu », « fréquentation »).
- Tout graphique comparatif affiche sa base de normalisation.

## Accessibilité

- Contraste suffisant du texte sur le fond, focus clavier visible, toutes les commandes
  atteignables au clavier (voir `web-accessibility`).
