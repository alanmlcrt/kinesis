# Feuille de route

Une étape à la fois. Une étape n'est cochée que si son critère « fini quand » est vérifié
dans le navigateur (`npm run check`) et rapporté. Les cadences sont mesurées, jamais estimées.

- [ ] **0. La scène.** Projet Vite + React + TypeScript + React Three Fiber + drei dans `web/`.
  Un sol en grille, une lumière douce, une caméra orbitale. Script `npm run check`
  (Playwright) : ouvre la page, relève les erreurs console, mesure la cadence, prend une
  capture dans `web/check/`.
  *Fini quand* : `npm run build` et `npm run check` passent, 0 erreur console.

- [ ] **1. Un robot.** Module `web/src/sim/` : une grille, un robot qui va d'une case à une
  autre par le plus court chemin, `step()` à pas fixe, graine explicite. Rendu interpolé
  entre deux pas. Boutons lecture / pause / vitesse. Test : même graine ⇒ même état.
  *Fini quand* : le mouvement est continu, la cadence mesurée est rapportée.

- [ ] **2. Plusieurs robots.** Des robots font des allers-retours vers une station sans
  jamais occuper la même case (réservations simples). Robots dessinés en `InstancedMesh`.
  *Fini quand* : aucun conflit (testé dans `sim/`), cadence mesurée avec 20, 100 et 300 robots.

- [ ] **3. Un entrepôt Skypod.** Racks, allées, colonnes devant les faces de rack, un robot
  par colonne, montée et descente visibles, bacs rangés et récupérés.
  *Fini quand* : aucun robot ne monte hors d'une colonne (test), la scène est lisible.

- [ ] **4. Où ça bloque.** Temps perdu par cellule calculé dans `sim/`, affiché en 3D et en
  coupe par niveau ; débit et temps perdu du run en direct, marqués « un seul run ».

- [ ] **5. Construire son entrepôt.** Réglages (dimensions, niveaux, stations, robots,
  rangement), éditeur de plan vu de dessus, quelques configurations toutes faites.

- [ ] **6. Mesurer.** Campagne de saturation : plusieurs tailles de flotte, réplications,
  intervalle de confiance, chauffe écartée, export + manifeste. Calcul hors du fil
  d'affichage (Web Worker) pour que l'interface ne gèle pas.

- [ ] **7. Comparer.** Deux ou trois configurations, même protocole, même base de
  normalisation, courbes superposées.

- [ ] **8. Ascenseurs et AutoStore**, ajoutés comme profils du même moteur.

- [ ] **9. Passage à l'échelle et validation.** Solveur à fenêtre glissante (RHCR), validation
  contre le jeu MAPF 3D (ICAPS 2024) ; décider, mesures à l'appui, si la simulation doit
  changer de technologie pour tenir des centaines de robots.
