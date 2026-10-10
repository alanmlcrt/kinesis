# Rendu 3D — contrôle du 10 octobre 2026

Amélioration de l'étape 3, puis consolidation du rendu et de l'éditeur de l'étape 5.

## Modèles et éclairage

- Robots : coque arrondie, châssis, quatre roues et moyeux, pare-chocs,
  capteurs, évents, guides de support et étiquette d'identification décorative.
- Bacs : fond et parois réellement ouverts, poignées traversantes, lèvre
  d'empilage, nervures et étiquettes. Le support rejoint le dessous du bac porté.
- Racks : profils en C, pieds et ancrages, rails avec dents représentées,
  tablettes à bords pliés et runners de support. Stations avec rouleaux.
- Matériaux distincts pour polymère, caoutchouc et métal. Éclairage d'environnement
  généré localement, deux lumières directionnelles et une carte d'ombres de 2048².
- Géométries fusionnées par matériau, puis instanciées. Aucun téléchargement
  d'asset ni ajout de dépendance. Les très petits détails ne sont pas chanfreinés.
- Enveloppes et hauteurs partagées avec la simulation. Rouleaux des stations placés
  latéralement, hors du passage des roues, vérifiés sur les triangles des modèles rendus.
- Remplacement de tout l'entrepôt dans un groupe React Three Fiber unique à chaque
  redémarrage. Correction de clés React identiques entre racks et robots, qui laissaient
  d'anciens racks visibles et augmentaient le nombre de géométries GPU après chaque édition.

Ces formes sont illustratives. Les dimensions du simulateur ne sont pas calibrées
Exotec ; ces modèles ne constituent pas une reproduction mécanique certifiée.

## Skills recherchés et appliqués

Skills du projet lus : `ponytail`, `realtime-3d`, `design-direction`,
`experiment-protocol`, `web-design-guidelines`. Recherche avec `find-skills`,
skills.sh et `npx skills find threejs` / `react three fiber`.

Contenus consultés : [threejs-geometry](https://github.com/CloudAI-X/threejs-skills/blob/main/skills/threejs-geometry/SKILL.md),
[threejs-materials](https://github.com/CloudAI-X/threejs-skills/blob/main/skills/threejs-materials/SKILL.md),
[threejs-lighting](https://github.com/CloudAI-X/threejs-skills/blob/main/skills/threejs-lighting/SKILL.md).
Répertoire public vérifié, environ 3,5 k étoiles affichées au moment de la recherche.
Conseils retenus : partage de géométrie, instancing, matériaux PBR, éclairage
d'environnement et ombres mesurées. APIs vérifiées dans Three.js installé et sa
documentation officielle. Pas d'installation de skills externes.

## Auto-vérification

`npm run build` et `npm run check` passent. Captures réellement inspectées :

- [Vue d'ensemble](../web/check/scene-20.png) et [300 robots](../web/check/scene-300.png) :
  séparation des rangées, lisibilité des bacs, des passages et des ombres.
- [Robot rapproché](../web/check/robot-detail.png) : coque, roues, capteurs et support.
- [Bac rapproché](../web/check/bin-detail.png) : volume creux, poignées,
  nervures, support porté et dégagement avec les rails.
- [Transfert](../web/check/transfer.png) : accès au niveau et bac visible.
- [Mobile](../web/check/mobile.png) : commandes dans l'écran.
- [Avant](../web/check/before-render.png) conservé pour comparaison visuelle.

Le contrôle navigateur vérifie aussi montée, transfert, station, retour en stock,
pause (aucun déplacement des robots ou bacs), changement de flotte, clavier et
préférence de mouvement réduit. Aucune erreur console.
Le contrôle de remplacements répétés impose une seule série de racks dans la scène
et un nombre de géométries GPU stable sur les retours aux mêmes configurations.

### Cadence mesurée

Chromium, Intel Iris Xe via ANGLE D3D11, 1280×800, graine 1, vitesse 1×,
5 secondes de cycle actif par cas. **Un seul run par configuration/flotte** ; solveur non validé.

| Configuration / robots | Images/s | p95 | Max |
|---|---:|---:|---:|
| 20 | 60,0 | 16,8 ms | 16,8 ms |
| 100 | 60,0 | 16,7 ms | 16,8 ms |
| 300 | 60,0 | 16,7 ms | 16,8 ms |
| Compact, 20 robots / 320 bacs | 60,0 | 16,7 ms | 16,8 ms |
| Étendu, 20 robots / 720 bacs | 60,0 | 16,8 ms | 16,8 ms |
| Compact, 220 robots / 320 bacs | 60,0 | 16,7 ms | 16,8 ms |
| Étendu, 300 robots / 720 bacs | 60,0 | 16,7 ms | 16,8 ms |
| Maximal, 300 robots / 1920 bacs | 44,0 | 33,4 ms | 33,4 ms |

Dernière consolidation : 16 géométries GPU actives après chacun des cinq
remplacements de plan contrôlés et 6 textures GPU ; une seule série de racks dans la scène.
Les positions et nombres d'instances de racks/stations sont comparés au plan du moteur.
Toutes les pièces de chaque robot/bac reçoivent des matrices identiques et finies.
Le cas maximal utilise 80×64 cellules, 12 rangées et 8 niveaux ; sa cadence reste
inférieure à 60 images/s sur cette machine. Il comporte 3 380 620 triangles au rendu.
Les résultats des cas plus petits ne constituent donc pas une garantie de fluidité
sur toute la plage de réglages. Rotation, zoom et redimensionnement sont contrôlés
par les interactions réelles, sans avancer le moteur en pause.

La première version détaillée atteignait seulement 34,7 images/s à 300 robots
(p95 33,4 ms). La réduction des facettes des petits détails a rétabli la cadence.
60 images/s est le plafond observé, sans preuve de marge GPU. Le test ne couvre
pas les appareils mobiles physiques ni toutes les résolutions. Données brutes :
[results.json](../web/check/results.json). Le build conserve l'avertissement Vite
sur la taille du bundle Three.js.
