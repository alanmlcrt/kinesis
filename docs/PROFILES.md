# Profils d’architecture — étape 8

Les trois architectures utilisent `createSim()`, `step()`, les mêmes réservations,
les mêmes règles d’affectation déterministes et le même protocole de campagne.
Le profil et ses paramètres font partie du plan sauvegardé et du manifeste exporté.
Un ancien plan sans `profile` conserve le comportement Skypod.

## Ascenseurs

Les robots roulent au sol et sur chacun des niveaux de stockage. Les transitions
verticales existent uniquement dans les gaines déclarées. Le graphe distingue deux
cellules de mêmes coordonnées sur des niveaux différents. Les stations restent au sol,
les bacs sont accessibles directement à leur étage ; pas de grimpe sur les racks.
L’accès à un bac est réservé par cellule et par étage. Deux robots peuvent accéder
à des bacs d’une même colonne sur des étages différents ; la réservation d’une
colonne entière reste spécifique aux chemins de grimpe Skypod et aux piles AutoStore.

L’éditeur permet de placer et effacer 1 à 8 gaines. Chaque gaine a une capacité fixe
d’un robot. La durée commune par niveau est réglable de 5 à 100 pas de 0,1 s,
par multiples de 5. Deux gaines sont proposées à la création du profil. Régénérer
une implantation replace ces deux gaines ; les placements manuels se font ensuite.

Le trajet entier est calculé par A* avec des coûts correspondant aux durées réelles
du moteur. La fenêtre glissante utilise des créneaux de 0,5 s et respecte les durées
verticales ; un horizon plus court qu’une transition est refusé.

Hypothèse conservatrice : une gaine est réservée dès l’engagement d’un trajet qui la
traverse, jusqu’à la fin du trajet, ou jusqu’au départ du robot s’il termine dedans.
Le simulateur ne modélise ni déplacement à vide d’une cabine, ni files physiques
de passagers, ni portes. Les cadres des gaines et les grilles d’étage montrent
la géométrie ; le déplacement vertical du robot montre la transition.

## AutoStore

Les robots restent sur une grille au sommet du stockage. Une pile contient au plus
`levels` bacs, pris uniquement par le dessus. Le remplissage initial est compacté,
sans emplacement vide entre deux bacs d’une pile. Pour une cible enfouie, le robot
retire chaque bac gênant, le transporte dans son puits temporaire privé situé sous
sa baie d’attente, puis récupère la cible et rejoint son port. Il remet ensuite
la cible et les bacs gênants dans la pile d’origine, dans leur ordre initial.
Chaque déplacement, extraction et dépôt prend du temps ; aucun bac n’est supprimé
ou téléporté lors du creusage. Une pile est réservée pendant tout le cycle.

Chaque robot dispose d’un puits temporaire vide de capacité `levels − 1`. Ces puits
ne comptent pas comme capacité de stockage commercialisable. L’emprise du plan
inclut les baies et puits ; la part du sol sans stock permanent exclut seulement
les cellules des piles. Une pile occupe une cellule, contre six pour une travée
des autres profils. Les générateurs actuels conservent leurs positions espacées :
ce n’est pas une optimisation de densité d’une installation industrielle.

Hypothèses géométriques : bacs espacés verticalement de 0,5 unité, grille à
`levels × 0,5`, extraction/dépôt en `8 + 10 × profondeur` pas. Le même modèle visuel
de robot transporte le bac au-dessus de sa coque. Les ports sont des baies abstraites
sur la grille, avec le service commun de 8 pas, sans descente du bac vers un opérateur.
Les coupes de temps perdu incluent « Sommet », où circulent les robots.

La [FAQ générale AutoStore](https://www.autostoresystem.com/faq/general) décrit les
robots sur la grille, le creusage et la livraison aux ports. La
[FAQ des solutions](https://www.autostoresystem.com/solution-faqs) décrit le retour
dans un emplacement supérieur disponible et le creusage anticipé. Notre restitution
dans la pile initiale et nos puits privés sont des simplifications du simulateur,
pas une reproduction de cette stratégie industrielle. Aucun débit constructeur,
aucune dimension industrielle ni calibration ne sont repris.

## Comparaisons et limites

Enregistrer les plans dans « Construire », puis les sélectionner dans « Mesurer ».
Toute comparaison exige une base explicite : capacité permanente égale, emprise
égale ou Pareto. Le manifeste conserve les gaines, leur durée et le profil.
Le temps de trajet libre inclut le coût vertical des ascenseurs ; le temps perdu
comprend refus de trajet, de colonne/pile ou de bac et détours. Les manutentions
et le creusage réduisent le débit mais ne sont pas artificiellement comptés comme
congestion. Les attentes AutoStore sont imputées au sommet.

Ces profils servent à explorer des mécanismes sous des hypothèses explicites.
Le solveur reste non validé et conservateur, avec priorité fixe et aucune garantie
de progrès sur toutes les implantations. Validation MAPF 3D, RHCR et passage à
l’échelle restent l’étape 9. Les essais réussis ne constituent pas une garantie
de performance industrielle ni de tous les usages futurs.
