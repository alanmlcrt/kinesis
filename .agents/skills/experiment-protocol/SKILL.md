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
  comptée tant qu'aucun refus n'a eu lieu. Total rapporté aux trajets libres terminés.
- **Débit** : tâches terminées par unité de temps simulé, après la chauffe.
- **Emplacements** : travées × niveaux (capacité de stockage). **Emprise** : largeur × profondeur
  du sol, en cases de simulation (non calibrées en mètres).
- **Débit maximal mesuré** d'une configuration : la plus haute moyenne de débit parmi ses
  flottes à chauffe détectée, donnée avec l'intervalle de cette flotte. Biaisée vers le haut
  (maximum de moyennes bruitées) : à lire avec son intervalle.
- **Front de Pareto** (étape 7a) : configurations qu'aucune autre ne bat ou n'égale à la fois
  en emplacements (plus), emprise (moins) et débit maximal mesuré (plus), avec au moins un
  critère strictement meilleur. Sans débit mesuré : hors front.
- Comparaison : mêmes graines pour toutes les configurations (nombres aléatoires communs),
  3 configurations au plus (au-delà, les couleurs des courbes ne sont plus distinguables).
- Toute nouvelle mesure reçoit une définition écrite ici avant d'être affichée.

## Comparer

- Une comparaison d'architectures exige une **base de normalisation choisie par
  l'utilisateur** (capacité de stockage égale, emprise au sol égale, ou front de Pareto).
  Jamais de valeur par défaut. La base est affichée sur le graphique et écrite dans
  l'export.
- Même protocole (R, chauffe, durée, demande) pour toutes les configurations comparées.

## Validation

- Tant que le solveur de trafic n'est pas validé contre le jeu MAPF 3D (Wang et al.,
  ICAPS 2024), toute mesure porte **« solveur non validé »**.

## Export

- Données brutes (par réplication, et par cellule quand c'est pertinent) + **manifeste**
  JSON : paramètres complets, graine de campagne et graines des réplications, R, chauffe
  retenue, base de normalisation, version du code (commit), date, statut du solveur.
- Un export doit suffire à refaire le calcul.

## Interdits

- Inventer un chiffre, une performance, une référence.
- Afficher un intervalle sans son niveau de confiance, ou une moyenne sans R.
