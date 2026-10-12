# Skypod — vérification avant l'étape 3

Recherche du 2026-10-10. Cette note distingue la documentation du fabricant,
les mécanismes décrits dans ses brevets et les hypothèses de simulation.
Un brevet décrit des réalisations possibles ; il ne constitue pas une fiche
de fabrication du Skypod actuellement commercialisé.

## Génération retenue

Exotec a annoncé une nouvelle génération le 6 février 2025 [1]. Le fabricant
explique que les nouveaux racks permettent de circuler sous les rayonnages
et réduisent les allées d'accès nécessaires par rapport aux versions précédentes [2].
La fiche actuelle confirme la circulation sous les racks dans toutes les directions [3].

Décision de l'utilisateur du 2026-10-10 : représenter d'abord la nouvelle
génération (2025+), avec circulation sous les racks. `SCOPE.md` et l'étape 3
de `ROADMAP.md` ont été adaptés en conséquence.

La génération classique est disponible depuis l'étape 7c, comme variante du même
moteur. Le choix de génération est résolu ; la géométrie
illustrative et les paramètres retenus pour l'étape 3 sont décrits ci-dessous.
Les mécanismes des anciens brevets restent des éléments de
compréhension, sans garantir les détails de fabrication du produit actuel.

Ne pas déduire qu'une case sous rack est toujours traversable : les montants,
les obstacles et l'encombrement du robot doivent être pris en compte.

## Sol, allées et grille du simulateur

Les robots circulent au sol puis accèdent verticalement au stockage. Exotec
mentionne un guidage par suivi de lignes et une orchestration par Deepsky [4].
Les cellules carrées de Kinesis constituent une discrétisation de simulation :
les sources consultées n'établissent pas une maille physique universelle ni
un pas de grille à reprendre tel quel.

Pour une représentation classique, les espaces entre faces de racks donnent
accès aux chemins de grimpe ; les liaisons au sol vers les stations doivent être
continues. Les dessins 3A–3D du brevet Exotec [5] montrent une prise de bac
entre deux rayonnages se faisant face. Ce dessin ne prouve pas que toutes les
installations, notamment actuelles, ont exactement cette implantation.

Conséquence pour le modèle : distinguer les cellules de circulation, les
chemins verticaux et les emplacements de stockage. Les passages disponibles
dépendent de la géométrie choisie. Ne pas reprendre le circuit serpentin de
l'étape 2 comme une règle de circulation du Skypod réel.

## Montée et prise du bac

Le brevet Exotec publié en 2020 [5] décrit la séquence suivante :

1. Le robot s'aligne au sol face à l'emplacement visé.
2. Ses mécanismes latéraux de grimpe s'engagent sur les montants de rayonnages
   opposés ; des roues dentées entraînent la montée.
3. Il atteint la hauteur de prise et déploie latéralement son support sous le bac.
4. Il soulève légèrement le bac, puis ramène le support chargé sur son châssis.
5. Il redescend avec le bac avant de reprendre la circulation au sol.

Ce brevet décrit des chaînes ou des crémaillères. Une publication Exotec plus
récente [6] décrit une crémaillère intégrée à un profilé métallique et son
engagement avec une roue dentée. La fiche des racks actuels indique une
installation sans chaînes ni électrification du rack [7]. Ne pas représenter
les chaînes de l'ancien brevet comme une caractéristique certaine du produit actuel.

La colonne du simulateur représente un chemin de grimpe physiquement équipé,
avec une position au sol et des niveaux accessibles. Le robot doit rester
aligné sur ce chemin pendant le déplacement vertical. La prise du bac est
un transfert latéral entre le rack et le robot ; le bac ne doit pas apparaître
instantanément sur le robot à partir d'un emplacement éloigné.

## Cycle de travail

Exotec définit en 2023 un cycle comme la récupération d'un bac, son transport
à la station de préparation, puis son retour au stockage [8]. Pour l'étape 3,
un cycle fixe de ce type suffit : trajet à vide, montée, prise, descente,
trajet chargé, service à la station, retour, montée, dépôt et descente.
Le retour au même emplacement serait une règle simple de Kinesis, pas une
affirmation sur la stratégie de rangement du fabricant.

## Hypothèses à déclarer et inconnues

| Sujet | Statut dans l'étape 3 |
|---|---|
| Un robot maximum par colonne entière | Règle de Kinesis dans SCOPE/ROADMAP ; non confirmée comme règle industrielle par les sources consultées. |
| Réservation de toute la colonne jusqu'à la descente | Hypothèse conservatrice implémentée ; libération lorsque le robot quitte la case de base après descente. |
| Passage d'un robot au sol sous un autre en hauteur | La base reste occupée pendant la grimpe ; les autres robots peuvent emprunter les passages voisins. Hypothèse conservatrice, non règle industrielle vérifiée. |
| Mouvement horizontal en hauteur | Ne pas ajouter une arête de circulation sans justification propre à la variante retenue. |
| Largeur des allées, dimensions du robot, pas des niveaux | Pas de valeurs précises validées pour notre implantation. Une géométrie illustrative doit être identifiée comme telle. |
| Vitesse verticale et temps d'engagement/prise/dépôt | Pas de calibration validée ; la vitesse maximale annoncée du robot ne justifie pas une vitesse identique sur tous les axes. |
| Priorités, distances de sécurité, gestion des conflits | Logique propriétaire non reproduite par les réservations simples du projet. |

## Géométrie et fonctionnement de l'étape 3

Toutes les longueurs ci-dessous sont des **unités de simulation**, sans conversion
affirmée en mètres. Les durées sont des choix illustratifs, sans calibration Exotec.

| Élément | Paramètre du modèle |
|---|---|
| Sol | 48 × 32 cellules, 4 voisins orthogonaux. |
| Stockage | 4 rangées, 8 travées par rangée, 4 niveaux : 128 bacs identifiés. |
| Chemins de grimpe | 32 chemins, un par travée ; le bac est à droite du robot dans cette implantation illustrative. |
| Hauteur entre niveaux | 1,4 unité ; première tablette au-dessus de l'encombrement d'un robot chargé au sol. |
| Robot | Enveloppe horizontale de 0,7 × 0,7 unité ; bac de 0,68 × 0,455 × 0,73 unité. Les enveloppes sont contrôlées sur les géométries rendues. |
| Travée | 2 cellules (modèle du 11 octobre 2026), rangées continues sur toutes les lignes depuis le 12 octobre : accès de grimpe puis stockage à droite ; plus de case de montant bloquée. Montants de guidage aux coins des deux cellules, hors de l'enveloppe du robot. |
| Stations | 4 baies au sol, plaque et rouleaux latéraux hors du passage des roues ; représentation illustrative. |
| Temps | Pas fixe 0,1 s ; 5 pas par cellule, 10 pas par niveau, 5 pas d'engagement, 8 pas de prise/dépôt/service. |

Le graphe remplace le circuit à sens unique de l'étape 2. Les lignes et colonnes
impaires forment un réseau de circulation connecté ; les cases paires servent
de baies de stationnement, de stations ou de bases de grimpe.

**Passage sous un robot en montée (12 octobre 2026, demande utilisateur)** : en 2025+,
la base de grimpe se traverse au sol ; dès qu'un robot quitte le sol pour grimper, sa
cellule au sol est libre et un autre robot peut passer dessous. Il ne redescend au sol
que si la cellule est libre et hors de tout trajet engagé (attente comptée en temps
perdu au niveau 1). Les trajets ne s'arrêtent jamais sur une base traversée. Une colonne
reste à un seul robot ; la traverser en chemin ne la libère pas. En classique, la base
reste terminale.
Les lignes traversant les travées entre leurs montants permettent de passer
sous les tablettes, y compris avec un bac chargé. Les emplacements de stock en
hauteur sont distincts des cellules de circulation et ne sont pas traversables.

Les baies ne servent pas de raccourcis vers d'autres baies. Chaque trajet au sol
est calculé en largeur parmi les cellules disponibles, puis réservé entièrement.
La case de départ reste occupée pendant le franchissement ; les réservations
sont libérées à mesure de l'avancement. Une colonne est réservée avant d'y
envoyer le robot et reste exclusive pendant montée, prise/dépôt et descente.

Le robot tente les trajets directs colonne–station puis station–colonne. Si la
destination est indisponible, il rejoint sa baie de stationnement pour libérer
la ressource avant de réessayer. Il revient à sa baie après remise en stock.
Ce repli et la réservation intégrale des trajets ajoutent des déplacements et de
l'attente artificiels : ils ne reproduisent pas l'orchestration industrielle et ne
permettent pas de conclure sur la saturation réelle d'un Skypod. Les robots sont traités par identifiant et tous
finissent leur cycle avant la réaffectation des premiers, pour éviter la famine.

Les bacs gardent leur identité pendant tout le cycle. Prise et dépôt sont des
transferts latéraux continus entre un emplacement fixe et le robot, au bon niveau.
Le rendu utilise des instances pour robots, bacs, tablettes, montants et baies ;
il interpole les positions physiques entre deux pas. Les coques, roues, capteurs,
bacs ouverts et profils métalliques sont détaillés visuellement (`docs/RENDER.md`).
Ils restent des modèles procéduraux illustratifs, sans reconstruction CAD Exotec.
L'engrènement des roues de grimpe et les supports télescopiques ne sont pas simulés.

Le panneau présente ces hypothèses sous « Skypod 2025+ · modèle illustratif ».

## Vérifications à exiger pour l'étape 3

- Aucune transition verticale hors d'un chemin de grimpe déclaré.
- Prise/dépôt uniquement depuis un emplacement compatible, adjacent au chemin
  et au bon niveau ; identité et localisation de chaque bac conservées.
- Exclusivité des cellules, réservations des déplacements et absence
  d'échange frontal ; exclusivité de colonne selon l'hypothèse déclarée.
- Libération des réservations à la fin de leur usage, y compris après descente.
- Cycle complet sans blocage et déterminisme à graine et paramètres identiques.
- Géométrie et animation cohérentes : engagement, montée, transfert latéral,
  descente, bac visible pendant le transport ; contrôle dans le navigateur.

Depuis l'étape 5, le plan décrit plus haut est la configuration « Démonstration ».
Dimensions, niveaux, travées, stations, flotte, remplissage et rangement initial
sont configurables ; voir [EDITOR.md](EDITOR.md). Les mêmes limites physiques et
de trafic s'appliquent aux plans personnalisés.

Les constantes d'encombrement et de hauteur sont partagées entre moteur, validation
du plan et rendu dans `web/src/sim/geometry.ts`. Les tests vérifient les marges sous
tablette, autour des guides et entre robots voisins, ainsi que le contact du bac
porté avec son support. Ce contrôle interne ne constitue pas une calibration physique.

## Variante classique — étape 7c

Le plan porte une génération `classic` ou `2025+` ; l'absence de ce champ dans une
ancienne sauvegarde signifie `2025+`. Le choix suit le plan dans la sauvegarde locale,
la bibliothèque de configurations et le manifeste de campagne.

**Hypothèse de Kinesis, sans calibration industrielle** : l'emprise d'une travée
(2 cellules depuis le 11 octobre 2026, 3 × 2 avant) est interdite au sol en classique, sauf la case de base du chemin
de grimpe en bord d'allée. Cette base est une baie terminale, jamais un raccourci.
Le robot y entre par l'allée à gauche ; la case de stockage est bloquée, y compris
les passages sous les tablettes qui restent disponibles en 2025+. Les transversales
correspondent à des positions de travées laissées libres. Des plaques au sol en 3D et
des surfaces pleines sur le plan signalent les cases bloquées ; elles ne représentent
pas une reconstruction mécanique des racks classiques.

Le même graphe sert à valider le plan et à router les robots. Toutes les colonnes,
stations et baies doivent appartenir au réseau accessible sans traverser d'autre baie.
Un plan invalide est refusé avant de remplacer le brouillon ou le run. La grille paire
et les marges imposées aux racks limitent déjà fortement les implantations possibles.

Stockage, grimpe, service, vitesses, graines, règles de réservation et protocole de
mesure sont identiques entre les générations. À plan identique, capacité, emprise et
sol libre sont identiques ; c'est le graphe de circulation qui change. La comparaison
ne démontre donc pas les performances d'installations réelles ni de Deepsky.

## Sources

1. [Exotec — lancement de la nouvelle génération, 6 février 2025](https://www.exotec.com/news/exotec-launches-next-generation-of-skypod-system-an-all-in-one-robot-based-as-rs-that-addresses-the-majority-of-processes-within-a-warehouse/).
2. [Exotec — nouveaux racks, 21 février 2025](https://www.exotec.com/en-gb/insights/next-generation-racking-system/).
3. [Exotec — fiche actuelle des robots](https://www.exotec.com/system/automated-warehouse-robots/).
4. [Exotec — navigation des robots, fiche britannique](https://www.exotec.com/en-gb/system/automated-warehouse-robots/).
5. [Brevet Exotec US20200122923A1 — description et figures 3A–3D](https://patents.google.com/patent/US20200122923A1/en).
6. [Brevet Exotec FR3140876A1 — crémaillère et montants](https://patents.google.com/patent/FR3140876A1/fr).
7. [Exotec — fiche actuelle des racks](https://www.exotec.com/system/warehouse-storage-solutions/).
8. [Communiqué Exotec du 22 juin 2023 — définition d'un cycle](https://www.prnewswire.com/news-releases/exotec-robots-save-warehouse-workers-from-walking-nearly-18-million-miles-according-to-official-data-301857777.html).
