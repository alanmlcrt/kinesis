# Feuille de route

Une étape à la fois. Une étape n'est cochée que si son critère « fini quand » est vérifié
dans le navigateur (`npm run check`) et rapporté. Les cadences sont mesurées, jamais estimées.

Ordre adapté à la demande du 10 octobre 2026 : étape 5 réalisée avant l'étape 4.

Affinement visuel demandé le 11 octobre 2026 : interface et scène passées à un thème
clair et sobre, contrôlé sur ordinateur et fenêtre mobile. Étapes 7 (7a–7e) et 8 réalisées ; étape 9 en cours.
Affinement demandé ensuite : configurateur compact organisé autour d’un motif de
rangée, de blocs répétés et d’un aperçu avant génération ; édition manuelle et
implantation régulière conservées. La validation scientifique de l’étape 9 reste ouverte.

Demande suivante du 11 octobre : priorité à un laboratoire ludique, avec parcours
Concevoir → Simuler → Analyser, lancement explicite, inspection des robots et courbes
du run activables : laboratoire interactif réalisé et vérifié. La prochaine étape
reste la poursuite de la validation scientifique ouverte ; le laboratoire ne valide
pas le solveur.

- [x] **Concevoir en écran, matrice interactive, travée à 2 cellules (demande du 11 octobre).**
  Concevoir n’est plus une modale : matrice au centre (peinture à la souris, fantôme de
  pose, dimensions modifiées sur ses bords et par poignées), cartes de réglages,
  interface arrondie. Compositeur de « motif à répéter » retiré. Modèle : une travée =
  accès de grimpe + stockage, une cellule chacun (plus de cellule de montant) ; mesures
  antérieures non comparables. Vérifié : 82 tests, `npm run verify`, 0 erreur console.
  Carte du code : `docs/ARCHITECTURE.md`.
  Le 12 octobre : rangées continues (une travée par ligne), plans prêts densifiés ;
  limite de pilotage fenêtre/RHCR mesurée et documentée dans `docs/VALIDATION.md` ;
  en 2025+, passage au sol sous un robot en montée (accès traversable).
  Puis travée Exotec rayonnage | allée | rayonnage (brevet US11208264B2), modèles par
  technologie et tracé ligne/zone dans Concevoir ; dépôt public github.com/alanmlcrt/kinesis.
  Ensuite : tracé en un geste (clic/glisser-rectangle), rayonnages 2025+ jointifs (pas de 3),
  pilotage choisi dans Concevoir (RHCR par défaut hors classique), Mesurer et Pilotage retirés
  de Simuler ; flotte plus active (avance de 3 cycles au lieu d’attendre le dernier robot).
  Fusion du pinceau cloud (67a9ced) ; file de station à 2 robots contre le blocage
  définitif de la flotte autour des stations ; traînée du robot sélectionné dans Simuler.

- [ ] **Parcours, comparaison et missions (proposition validée le 12 octobre).** Étapes,
  une à la fois :
  - [ ] **A. Banc d’essai** : Analyser en un écran ; plans enregistrés en cartes, 2–3 à
    comparer, ce qui varie (plan / pilotage / flotte), même protocole, courbe débit/flotte
    avec IC et front capacité/débit.
  - [ ] **B. Missions chiffrées** : objectif atteint seulement si la borne basse de l’IC
    le dépasse ; record personnel et plan associé ; écarts affichés dans Concevoir.
  - [ ] **C. Indicateurs resserrés** : densité, robots au coude, productivité par robot,
    occupation des stations (nouveau compteur moteur).
  - [ ] **D. Hypothèses** par architecture (vitesses, durées), marquées non calibrées.

- [x] **Laboratoire interactif (demande du 11 octobre).** Atelier d’entrée avec aperçu
  du plan appliqué, onglets, configuration puis lancement ; robot sélectionnable dans
  la scène et au clavier, fiche de son état et de ses cycles ; courbes activables de
  débit cumulé, temps perdu / trajet libre, cycle moyen terminé et bacs servis.
  *Fini quand* : valeurs conformes au moteur, pause et remise à zéro vérifiées,
  navigation clavier et captures ordinateur/mobile contrôlées, `npm run verify` réussi.
  Vérifié : 81 tests, zéro erreur console, captures inspectées, régressions
  Chromium/Edge/Firefox réussies ; quatre courbes actives et 20 robots à 60,1 images/s
  sur 2 s, p95 16,7 ms (un seul run, Iris Xe, 1280×800, 1×).

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
  Affinement compact du 11 octobre : motif de rangée et aperçu répété avant génération,
  blocs serrés et allées réglables comme parcours principal ; implantation régulière
  dans les réglages avancés, contours de travées et plan détaillé défilable sur téléphone.
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

- [x] **7. Comparer.** Découpage validé par l'utilisateur le 11 octobre 2026. Objectif :
  stocker un maximum en sacrifiant un minimum de sol à la circulation, sans casser le débit
  (front de Pareto). Même protocole pour toutes les configurations, base de normalisation
  choisie par l'utilisateur, « solveur non validé » jusqu'à la validation de l'étape 9. Robots en cycle
  continu (mesure de saturation) pendant toute l'étape ; demande et affectation hors périmètre.
  - [x] **7a. Comparer des configurations.** Plans nommés et sauvegardés, même campagne sur
    2 ou 3 configurations, base choisie (capacité égale, emprise égale, Pareto) et vérifiée,
    courbes superposées, export multi-configuration.
  - [x] **7b. Plans par allées.** Générateur paramétré (nombre et largeur des allées,
    rangées adossées, allées transversales, position des stations) ; capacité, emprise et
    part du sol en circulation ; plans à colonne ou station inaccessible refusés.
  - [x] **7c. Génération classique.** Variante du même moteur sans passage sous les racks
    (emprise des travées bloquée, accès de grimpe terminal depuis l'allée). Choix dans
    l'éditeur, sauvegarde/annulation, plans réguliers et par allées, comparaison et export
    avec génération conservée ; accessibilité validée sur le graphe du moteur. Hypothèse
    documentée dans `docs/SKYPOD.md`, cycles, rendu, mobile et ressources GPU vérifiés.
  - [x] **7d. Exploration densité/débit.** Balayage des rangées par bloc et largeurs d'allée
    à emprise égale explicitement choisie, 15 combinaisons au plus, plans identiques
    dédoublonnés. Deux Workers en parallèle, mêmes flottes/graines/protocole, front de
    Pareto capacité/débit avec IC, seuil observé à 95 % du maximum (deux flottes suivantes
    requises) ou non identifié, défini d'abord dans `experiment-protocol`. Export complet
    recalculable ; annulation/erreur/clavier, ordinateur/mobile et régressions vérifiés.
  - [x] **7e. Méthodes de pilotage.** Pilotage du sol séparé dans `sim/control.ts` ; méthode
    actuelle à trajet entier et recherche espace-temps priorisée, avec préfixe engagé
    renouvelé à son terme (horizon de 2 à 32 déplacements). Comparaison sur un même plan,
    base choisie, mêmes flottes/graines/protocole. Budget reproductible par recherche,
    compteurs et temps réel total des réplications séparés, export recalculable.
    Cycles/déterminisme/reprise/sécurité/budgets, annulation/erreur/clavier et captures
    ordinateur/mobile vérifiés. Approche conservatrice sans garantie de progrès ;
    solveur non validé ; RHCR ajouté à l’étape 9, validation MAPF encore partielle.

- [x] **8. Ascenseurs et AutoStore**, ajoutés comme profils du même moteur :
  graphe d’étages et gaines exclusives, grille au sommet et creusage/restitution des piles,
  choix dans l’éditeur, placement/durée des gaines, sauvegarde et comparaison.
  Accès indépendants par étage, bacs déplacés puis restitués, puits temporaires privés
  et ports abstraits documentés dans `docs/PROFILES.md`. Vérification complète réussie :
  74 tests, parcours des deux profils et six réplications Worker conformes à Node,
  captures ordinateur/mobile et ressources GPU vérifiées. Solveur toujours non validé ;
  progrès et performance à grande flotte restent à traiter à l’étape 9.
  *Fini quand* : cycles, conservation des bacs, exclusivité, déterminisme et reprise
  vérifiés ; rendu conforme au moteur, parcours éditeur/campagne/export et captures
  ordinateur/mobile contrôlés, vérification complète réussie.

- [ ] **9. Passage à l'échelle et validation.** Solveur à fenêtre glissante (RHCR), validation
  contre le jeu MAPF 3D (ICAPS 2024) ; décider, mesures à l'appui, si la simulation doit
  changer de technologie pour tenir des centaines de robots.
  RHCR priorisé ajouté au moteur, au run et aux campagnes ; noyau partagé avec les
  contrôles sur graphes officiels. Audit des 15 cartes/150 scénarios, trajets unitaires
  et sondes 20/100/300 à trois graines ; décision : conserver TypeScript/Workers.
  Validation scientifique encore ouverte : archives officielles téléchargées avec
  toutes les paires départ = arrivée ; scénarios mobiles dérivés explicitement,
  progression incomplète en flotte dense. Résultats et limites : `docs/VALIDATION.md`.
