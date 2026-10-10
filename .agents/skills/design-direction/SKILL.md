---
name: design-direction
description: Direction visuelle de Kinesis — interface épurée mais technique. À lire avant toute interface, visualisation ou mise en page. Prime sur ui-ux-design en cas de conflit.
---

# design-direction

Un instrument, pas une vitrine. L'œil va à la flotte et aux mesures ; tout le reste
s'efface.

## Principes

- **La scène 3D occupe tout l'écran.** Les panneaux sont fins, superposés, repliables.
- **Peu d'éléments, tous utiles.** Pas de décor : ni dégradés, ni halos, ni ombres
  portées d'interface, ni icônes décoratives, ni animations d'apparat.
- **Technique = précis et lisible** : unités toujours affichées, chiffres alignés,
  libellés courts et exacts.
- **Honnêteté des mesures** : « un seul run », « solveur non validé » et la base de
  normalisation sont visibles à côté du chiffre, pas cachés dans une infobulle.

## Couleurs

- Fond sombre neutre, légèrement froid (`#0e1013`). Grille discrète (`#363c46` pour les
  cellules, `#56606e` pour les sections).
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
