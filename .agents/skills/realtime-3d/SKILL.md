---
name: realtime-3d
description: Règles de performance et de rendu pour la scène React Three Fiber de Kinesis. À lire avant de toucher à la scène 3D ou à tout code exécuté à chaque image (useFrame, boucle de simulation, instances).
---

# realtime-3d

Objectif : une scène très fluide. Une cadence se **mesure** (`npm run check`), elle ne
s'estime pas.

## Boucle

- Pas fixe de simulation découplé de l'affichage : un accumulateur dans `useFrame`
  appelle `step()` autant de fois que nécessaire, avec un **plafond de pas par image**
  (sinon un onglet resté en arrière-plan fait exploser la boucle à son retour).
- Le rendu interpole entre l'état précédent et l'état courant avec
  `alpha = accumulateur / dt`. C'est la seule logique tolérée côté rendu.
- Vitesse de lecture = nombre de pas simulés par seconde réelle, jamais un `dt` plus grand.

## À chaque image

- **Aucune allocation** dans `useFrame` : pas de `new Vector3`, de tableaux, d'objets ou
  de closures. Réutiliser des objets créés une fois (module ou `useMemo`).
- **Aucun `setState` React** par image. La scène se met à jour par refs et mutation
  directe des objets three.js. React ne re-rend que sur un changement de structure
  (nouvel entrepôt, robot ajouté), pas sur un mouvement.
- L'état de la simulation ne vit pas dans un state React.
- Les panneaux qui affichent des chiffres en direct se rafraîchissent à quelques Hz,
  pas à chaque image.

## Beaucoup d'objets

- Robots, bacs, racks répétés : un `InstancedMesh` par type, `setMatrixAt` puis
  `instanceMatrix.needsUpdate = true`. Jamais un composant React par robot.
- Géométries et matériaux partagés, créés une fois.
- Champs par cellule (temps perdu) : une texture ou un attribut mis à jour, pas des
  milliers de meshes.

## Coûts à n'activer que mesures à l'appui

- Ombres dynamiques, post-traitement, transparence en masse, `dpr` au-delà de 2.
- `frameloop="demand"` quand rien ne bouge (pause), si la mesure montre un gain utile.

## Mesurer

- `npm run check` rapporte la cadence moyenne, la durée d'image p95 et max, et le moteur
  WebGL réellement utilisé. Rapporter ces chiffres avec la taille de fenêtre et le nombre
  d'objets. 60 images/s sur un écran 60 Hz est un plafond, pas une marge : regarder aussi
  la durée d'image.
- Toute optimisation se justifie par un avant / après mesuré.
