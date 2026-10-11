# Feuille de route

Une étape à la fois. Une étape n'est cochée que si son critère « fini quand » est vérifié
dans le navigateur (`npm run check`) et rapporté. Les cadences sont mesurées, jamais estimées.

Ordre adapté à la demande du 10 octobre 2026 : étape 5 réalisée avant l'étape 4.

- [x] **0. La scène.** Projet Vite + React + TypeScript + React Three Fiber + drei dans `web/`.
  Un sol en grille, une lumière douce, une caméra orbitale. Script `npm run check`
  (Playwright) : ouvre la page, relève les erreurs console, mesure la cadence, prend une
  capture dans `web/check/`.
  *Fini quand* : `npm run build` et `npm run check` passent, 0 erreur console.

- [x] **1. Un robot.** Module `web/src/sim/` : une grille, un robot qui va d'une case à une
  autre par le plus court chemin, `step()` à pas fixe, graine explicite. Rendu interpolé
  entre deux pas. Boutons lecture / pause / vitesse. Test : même graine ⇒ même état.
  *Fini quand* : le mouvement est continu, la cadence mesurée est rapportée.

- [x] **2. Plusieurs robots.** Des robots font des allers-retours vers une station sans
  jamais occuper la même case (réservations simples). Robots dessinés en `InstancedMesh`.
  *Fini quand* : aucun conflit (testé dans `sim/`), cadence mesurée avec 20, 100 et 300 robots.

- [x] **3. Un entrepôt Skypod nouvelle génération (2025+).** Racks, allées et passages
  au sol sous racks, chemins de grimpe sur les montants équipés, montée et descente
  visibles, prise et dépôt latéraux des bacs. Un robot par colonne reste une hypothèse
  conservatrice du simulateur, pas une règle industrielle vérifiée. Sources et limites :
  `docs/SKYPOD.md`. Rendu détaillé : coques arrondies, roues et capteurs, bacs ouverts,
  profils de racks et rails, matériaux et ombres ; audit visuel dans `docs/RENDER.md`.
  *Fini quand* : aucun robot ne monte hors d'un chemin déclaré, les passages au sol
  respectent les obstacles et l'encombrement, les bacs sont pris et déposés uniquement
  depuis les accès compatibles au bon niveau (tests), la scène est lisible.

- [x] **4. Où ça bloque.** Temps perdu par cellule calculé dans `sim/`, affiché en 3D et en
  coupe par niveau ; débit et temps perdu du run en direct, marqués « un seul run ».

- [x] **5. Construire son entrepôt.** Réglages (dimensions, niveaux, stations, robots,
  rangement), éditeur de plan vu de dessus, quelques configurations toutes faites.
  Configurations de 4, 8 et 10 rangées, génération régulière, placement/effacement
  de travées et stations, remplissage et rangement initial configurables.
  Consolidation : configurations validées et sauvegardées localement, annulation du plan,
  réglages d'implantation non générés signalés, remplacement de scène sans racks résiduels.
  Vérification renforcée : deux cycles par robot sur des cas limites, reprise dans les
  16 phases, concordance plan/instances, sauvegardes refusées et ressources GPU stables.
  *Fini quand* : plans valides sans chevauchement, flotte compatible avec les baies,
  déterminisme et cycle complet sur les plans configurés, édition vérifiée au clavier
  et à la souris dans le navigateur, interface mobile contrôlée.

- [x] **6. Mesurer.** Campagne de saturation : plusieurs tailles de flotte, réplications,
  intervalle de confiance, chauffe écartée, export + manifeste. Calcul hors du fil
  d'affichage (Web Worker) pour que l'interface ne gèle pas.

- [ ] **7. Comparer.** Découpage validé par l'utilisateur le 11 octobre 2026. Objectif :
  stocker un maximum en sacrifiant un minimum de sol à la circulation, sans casser le débit
  (front de Pareto). Même protocole pour toutes les configurations, base de normalisation
  choisie par l'utilisateur, « solveur non validé » jusqu'à l'étape 9. Robots en cycle
  continu (mesure de saturation) pendant toute l'étape ; demande et affectation hors périmètre.
  - [x] **7a. Comparer des configurations.** Plans nommés et sauvegardés, même campagne sur
    2 ou 3 configurations, base choisie (capacité égale, emprise égale, Pareto) et vérifiée,
    courbes superposées, export multi-configuration.
  - [ ] **7b. Plans par allées.** Générateur paramétré (nombre et largeur des allées,
    rangées adossées, allées transversales, position des stations) ; capacité, emprise et
    part du sol en circulation ; plans à colonne ou station inaccessible refusés.
  - [ ] **7c. Génération classique.** Variante sans passage sous les racks (emprise des
    rangées bloquée, accès par l'allée), hypothèse documentée dans `docs/SKYPOD.md`.
  - [ ] **7d. Exploration densité/débit.** Balayage d'une famille de plans à emprise égale,
    Workers en parallèle, front de Pareto capacité/débit, seuil de saturation par plan
    (défini d'abord dans `experiment-protocol`).
  - [ ] **7e. Méthodes de pilotage.** Pilotage séparé du moteur ; réservation espace-temps à
    fenêtre glissante, recalculée en continu, comparée à la méthode actuelle. Budget de calcul
    en nombre d'opérations (reproductible), temps de calcul réel mesuré à côté.

- [ ] **8. Ascenseurs et AutoStore**, ajoutés comme profils du même moteur.

- [ ] **9. Passage à l'échelle et validation.** Solveur à fenêtre glissante (RHCR), validation
  contre le jeu MAPF 3D (ICAPS 2024) ; décider, mesures à l'appui, si la simulation doit
  changer de technologie pour tenir des centaines de robots.
