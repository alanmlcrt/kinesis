---
name: experiment-protocol
description: Protocole de mesure de Kinesis — réplications, intervalle de confiance, chauffe, base de normalisation, export et manifeste. À lire avant tout code de mesure, de campagne, d'indicateur affiché ou d'export de résultat.
---

# experiment-protocol

Un chiffre affiché est une affirmation. Il doit être reproductible et honnête sur sa
précision.

## Un run n'est pas un résultat

- Un indicateur calculé sur une seule exécution porte la mention **« un seul run »**.
- Un résultat de mesure = moyenne de **R réplications** (graines différentes, mêmes
  paramètres) avec son **intervalle de confiance à 95 %** (loi de Student, R − 1 degrés
  de liberté). R est un paramètre, affiché à côté du résultat.
- Les graines des réplications se déduisent de façon déterministe d'une graine de
  campagne, et sont enregistrées.

## Chauffe

- Le régime transitoire du démarrage (entrepôt vide, robots au repos) est **détecté et
  écarté** avant de mesurer. Méthode choisie et documentée ; la durée retenue est écrite
  dans le manifeste. Pas de durée fixe inventée.
- Méthode retenue (étape 6, `sim/campaign.ts`) : **MSER-5** sur les bacs servis par fenêtre
  de 10 s simulées, troncature cherchée dans la première moitié de la série seulement
  (en fin de série, deux lots égaux donnent une variance nulle). Minimum à cette limite :
  « chauffe non détectée », aucun chiffre affiché, allonger la durée. Chauffe d'une flotte
  = la plus longue de ses réplications, appliquée à toutes.

## Définitions

- **Temps perdu** : temps réel de passage moins temps de trajet libre, par cellule et au
  total, rapporté au temps de trajet libre. Mise en œuvre (`sim/sim.ts`, étape 4) : par
  trajet au sol (parking → colonne, colonne → station, station → colonne, colonne →
  parking), trajet libre = plus court chemin sur le même sol sans autre robot. Chaque pas
  d'attente après un premier refus (trajet, colonne ou bac occupé) compte à la case et au
  niveau où le robot attend ; le détour (cases parcourues au-delà du trajet libre) compte
  à la case de départ. La cadence d'essai normale (un essai tous les 10 pas) n'est pas
  comptée tant qu'aucun refus n'a eu lieu. En 7e, une attente inscrite dans le plan
  espace-temps pour éviter un conflit compte aussi, pas à pas à sa case ; elle ne compte
  pas comme déplacement et ne libère pas la colonne. Total rapporté aux trajets libres terminés.
- **Débit** : tâches terminées par unité de temps simulé, après la chauffe.
- **Emplacements** : travées × niveaux (capacité de stockage). **Emprise** : largeur × profondeur
  du sol, en cases de simulation (non calibrées en mètres).
- **Sol libre** (étape 7b, modèle du 11 octobre 2026) : 1 − 2 × travées / emprise. Une travée
  couvre 2 cases (accès de grimpe, stockage ; plus de case de montant) : hypothèse du modèle,
  pas une surface Exotec. Dans Skypod 2025+, le sol sous stockage reste traversable : « libre »
  veut dire « sans stockage au-dessus », pas « seul endroit où l'on circule ».
  En classique, la case de stockage est bloquée au sol et l'accès reste une baie terminale.
  Résultats mesurés avant ce changement (3 × 2 cases) : non comparables aux nouveaux.
  Le sol libre n'est donc pas une mesure de la connectivité du graphe de circulation.
- **Débit maximal mesuré** d'une configuration : la plus haute moyenne de débit parmi ses
  flottes à chauffe détectée, donnée avec l'intervalle de cette flotte. Biaisée vers le haut
  (maximum de moyennes bruitées) : à lire avec son intervalle.
- **Front de Pareto** (étape 7a) : configurations qu'aucune autre ne bat ou n'égale à la fois
  en emplacements (plus), emprise (moins) et débit maximal mesuré (plus), avec au moins un
  critère strictement meilleur. Sans débit mesuré : hors front.
- Comparaison : mêmes graines pour toutes les configurations (nombres aléatoires communs),
  3 configurations au plus pour les courbes superposées de 7a (au-delà, les couleurs
  ne sont plus distinguables). L'exploration 7d utilise des points numérotés et un tableau.
- Toute nouvelle mesure reçoit une définition écrite ici avant d'être affichée.

## Exploration densité/débit (7d)

- Famille : balayage des rangées par bloc et des largeurs d'allée, dimensions, niveaux,
  génération, stations, remplissage et rangement fixes. Plans identiques dédoublonnés,
  2 à 15 plans distincts. Base « emprise égale » explicitement acceptée par l'utilisateur.
  Même liste de flottes, mêmes graines et protocole pour tous ; une flotte incompatible
  avec un plan est refusée, jamais tronquée silencieusement.
- Front capacité/débit : Pareto sur les emplacements (plus) et le débit maximal mesuré
  (plus), à emprise égale. Classement descriptif des moyennes ; ne démontre pas une
  différence statistiquement significative. Les IC 95 % accompagnent chaque débit.
- Seuil de saturation observé : plus petite flotte testée dont la moyenne atteint
  95 % du débit maximal mesuré, avec au moins deux flottes testées plus grandes, toutes
  atteignant aussi 95 % de ce maximum. Chauffe détectée pour toutes les flottes et
  maximum strictement positif requis. Sinon « non identifié », élargir le balayage
  ou allonger la durée. Critère descriptif de plateau, pas une preuve de congestion
  ni une estimation entre les flottes testées. Seuil et tolérance de 5 % exportés.
- Deux Workers au plus exécutent les réplications en parallèle ; résultats réordonnés
  par plan, flotte et graine avant analyse. L'ordre de fin ne change pas les résultats.
  Annulation ou erreur : Workers terminés et aucun résultat partiel exportable.

## Méthodes de pilotage (7e)

- Comparaison sur un seul plan identique (capacité ET emprise égales), mêmes flottes,
  graines, affectation et protocole. Seul le pilotage du sol change ; colonnes exclusives
  et tours de flotte conservés. Méthode actuelle : BFS et réservation du trajet entier.
- Fenêtre : recherche priorisée par identifiant sur (case, temps), mouvements ou attentes
  de cinq pas ; préfixe engagé immuable, renouvelé à son terme. Source et destination
  réservées pendant chaque transit ; sommet final tenu jusqu'au prochain plan. Horizon
  en déplacements de 0,5 s. Approche conservatrice, sans garantie de progrès en flotte
  dense, ni revendication de RHCR validé (étape 9).
- Budget par recherche : nombre maximal d'opérations, jamais une durée réelle.
  Une opération = un candidat voisin examiné, une insertion robot/pas dans la table
  espace-temps ou un test temporel de collision. BFS libre servant au temps perdu exclu.
  Si épuisé : préfixe sûr déjà trouvé ou attente ; nombre d'épuisements exporté.
- Opérations, recherches et épuisements : totaux bruts des R réplications, chauffe
  incluse, reproductibles. Temps réel : durée totale des réplications (simulation,
  pilotage et collecte), mesurée uniquement dans le Worker ; observation du lot sur
  cette machine, chauffe incluse, sans IC ni influence sur les décisions du moteur.
  Les durées individuelles accompagnent les séries brutes dans l'export.

## Comparer

### Extension aux profils (étape 8)

- Même protocole pour Skypod, Ascenseurs et AutoStore ; profil et paramètres complets
  dans chaque plan exporté. Capacité = emplacements permanents, sans les puits
  temporaires AutoStore ; emprise = tout le plan, baies et puits inclus.
- Ascenseurs : trajet libre pondéré par la durée verticale déclarée. Recherche A*
  pour le trajet entier ; fenêtre en créneaux de 0,5 s avec transitions de plusieurs
  créneaux. Refuser un horizon plus court qu’une transition verticale.
- AutoStore : extractions, transports des bacs gênants et restitution font partie
  du cycle mesuré. Manutention et creusage ne sont pas de la congestion ; refus
  et détours restent du temps perdu, imputé à la grille au sommet.
- Géométrie, ports abstraits, réservations des gaines et puits temporaires privés
  explicités dans `docs/PROFILES.md`. Aucune conclusion industrielle calibrée.

- Une comparaison d'architectures exige une **base de normalisation choisie par
  l'utilisateur** (capacité de stockage égale, emprise au sol égale, ou front de Pareto).
  Jamais de valeur par défaut. La base est affichée sur le graphique et écrite dans
  l'export.
- Même protocole (R, chauffe, durée, demande) pour toutes les configurations comparées.

## Validation

- Étape 9 : audit des 15 graphes MAPF 3D et 150 CSV livrés ; les paires actuellement
  téléchargées ont départ = arrivée. Les essais mobiles utilisent une permutation
  circulaire explicite des départs officiels : scénarios dérivés, pas reproduction
  des résultats de l’article. Conflits de sommets/arêtes vérifiés indépendamment.
- RHCR priorisé : horizon w, exécution h puis suppression de la queue ; h = 1 sur
  le benchmark unitaire. Dans l’entrepôt, h atteint le premier sommet tenable sans
  gêner un trajet engagé ; transition verticale indivisible. Absence de garantie
  de complétude, de progrès global ou d’optimalité. Le statut reste non validé
  scientifiquement tant que les limites de progression/benchmark subsistent.
- Sondes de passage à l’échelle : trois graines, temps de calcul par réplication,
  moyenne et IC Student sur les durées réelles ; tâches achevées et budgets épuisés
  séparés. Fenêtres courtes : mesure de coût de calcul, sans conclusion de débit
  stationnaire. Aucune horloge réelle dans le moteur.

- Tant que le solveur de trafic n'est pas validé contre le jeu MAPF 3D (Wang et al.,
  ICAPS 2024), toute mesure porte **« solveur non validé »**.

## Instruments du run (11 octobre 2026)

- Lecture descriptive à 4 Hz réelles, 120 derniers relevés au plus ; abscisse en
  secondes simulées. Pas de nouveau relevé quand le compteur de pas est inchangé.
- Débit cumulé = visites en station / durée simulée depuis le lancement, en bacs/h.
- Temps perdu / trajet libre = lostSteps / freeSteps × 100 ; indéfini avant un trajet
  libre terminé, peut dépasser 100 %. Ce n’est pas une part du temps total.
- Cycle terminé : lancement initial (ou fin du précédent cycle du robot) jusqu’au
  retour complet ; attente, creusage, service et restitution inclus. Moyenne des
  durées des cycles terminés, pondérée par leur nombre ; cycles en cours exclus.
  Compteurs entiers cycleStart/cycleSteps dans le moteur, repris avec l’état JSON.
- Moyenne sans cycle terminé : afficher une absence de donnée, jamais zéro.
- Toutes ces courbes : « un seul run · solveur non validé · chauffe incluse » ;
  aucune réplication ni IC, aucune comparaison causale. Campagnes inchangées.

## Export

- Données brutes (par réplication, et par cellule quand c'est pertinent) + **manifeste**
  JSON : paramètres complets, graine de campagne et graines des réplications, R, chauffe
  retenue, base de normalisation, version du code (commit), date, statut du solveur.
- Un export doit suffire à refaire le calcul.

## Interdits

- Inventer un chiffre, une performance, une référence.
- Afficher un intervalle sans son niveau de confiance, ou une moyenne sans R.
