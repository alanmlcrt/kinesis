# RHCR et passage à l’échelle — étape 9

## Implémentation

`web/src/sim/rhcr.ts` contient une recherche espace-temps priorisée, un budget
déterministe, une table de réservations et un ordonnanceur RHCR. Celui-ci planifie
un horizon w, exécute h pas puis supprime la queue et replanifie ; les priorités
du benchmark tournent selon le numéro d’époque. Le solveur peut attendre sans
collision lorsqu’il ne trouve pas de progrès. Il est incomplet, sans garantie
d’optimalité ou de progrès global. Aucun code du dépôt RHCR original n’est copié.

Le même noyau de recherche est utilisé dans `sim/control.ts`. L’adaptation à
l’entrepôt conserve les tâches, les durées, les colonnes, les piles et les gaines.
Elle engage jusqu’au premier sommet où le robot peut s’arrêter sans gêner un
trajet engagé ; une transition d’ascenseur reste indivisible. Les priorités de
l’entrepôt restent par identifiant. Ce pilotage conservateur avec période
d’exécution adaptative diffère du benchmark synchrone h = 1. La sécurité du
benchmark n’est donc pas présentée comme une preuve suffisante pour l’adaptation.
Les tests du moteur exercent séparément celle-ci sur les trois profils.

Depuis le 12 octobre, le pilotage se choisit dans Concevoir (RHCR par défaut hors
classique) et il est sauvegardé avec la configuration. Les changements de flotte et de
plan conservent la méthode active et adaptent l’horizon à la durée d’ascenseur.
Dans **Mesurer**, la comparaison existante propose RHCR en remplacement de la
fenêtre engagée ; les paramètres, compteurs et séries sont exportés.

## Sources et données

Les archives officielles (`maps.zip`, `scens.zip`) ne sont pas versionnées dans le dépôt
public (licence de redistribution non vérifiée) : les télécharger depuis la source citée
dans `web/check/mapf3d/results.json` et les placer dans `web/check/mapf3d/` ; leurs
empreintes SHA-256 y sont enregistrées.

- [RHCR — dépôt des auteurs](https://github.com/Jiaoyang-Li/RHCR) : définition w/h
  et variantes de solveur, article AAAI 2021.
- [MAPF in 3D Warehouses — article ICAPS 2024](https://ojs.aaai.org/index.php/ICAPS/article/view/31525).
- [Benchmark officiel](https://mapf-16a81affbd82.herokuapp.com/), référencé par
  [MAPF.info](https://mapf.info/index.php/Main/Benchmarks).

Archives téléchargées le 11 octobre 2026 et conservées dans `web/check/mapf3d/` :

| Archive | SHA-256 |
|---|---|
| maps.zip | 337917b9c966f3b7e01b9716a286dc9d1a872131af456264821f5c39dc6b072e |
| scens.zip | 7a6aa76a6da58ebd03bd183d041e915afae11d5325715440eae423856826f8dd |

Les 15 graphes sont importés sans projection vers un plan Kinesis ; identifiants
non contigus, coordonnées, longueur unitaire, orientation des arêtes et
appartenance des départs/destinations sont contrôlés. Une arête officielle prend
un pas unitaire. Les « elevators » du papier sont des arêtes verticales, pas
les gaines exclusives du profil illustratif de Kinesis.

**Anomalie constatée dans les archives livrées : les 290 000 paires des 150 CSV
ont départ = arrivée.** Ce constat vient des fichiers téléchargés, pas d’une
affirmation de l’article. Résoudre ces paires ne valide aucun mouvement. On ne
présente donc pas les essais suivants comme une reproduction des scénarios et
résultats publiés, ni comme une validation scientifique acquise.

## Contrôles reproductibles

Depuis `web/` : `rtk npm run benchmark`, puis `rtk npm run verify`.

Le benchmark contrôle un trajet non nul et optimal à un robot sur chacun des
15 graphes, contre une borne calculée en largeur. Pour les sondes multi-robots,
il utilise les départs officiels mais remplace explicitement les buts par une
permutation circulaire : but du robot i = départ du suivant. Deux cartes, trois
graines officielles (0, 1, 2), flottes 20/100/300, w = 8, h = 1,
budget = 100 000 opérations par recherche, arrêt à 160 pas ou arrivée de tous.
Conflits de sommets, échanges d’arêtes et appartenance au graphe sont vérifiés
par un contrôle indépendant du planificateur. Les arrivées individuelles, pas,
déplacements, épuisements et opérations sont conservés dans le JSON.

Les durées sont mesurées hors moteur, incluent la préparation des heuristiques
et la vérification indépendante, excluent téléchargement/import du lot. Il
faut distinguer ce total du budget de recherche : préparation des distances et
de la table de réservations hors budget, candidats/expansions/tests dedans. Il
s’agit d’essais finis, pas d’une mesure de débit stationnaire ; aucune chauffe
MSER-5 n’est appliquée à ces temps de calcul. R = 3, IC 95 % Student sur les
durées ; valeurs brutes, machine et protocole dans `web/check/mapf3d/results.json`.

Mesure finale Node 22.22.0, Windows, Core i7-12800H :

| Carte officielle / robots | Temps moyen ± demi-IC 95 % (s) | Arrivés, graines 0/1/2 |
|---|---:|---|
| 25_5_2_5_2_1 / 20 | 0,116 ± 0,066 | 12 / 14 / 18 sur 20 |
| 25_5_2_5_2_1 / 100 | 0,650 ± 0,452 | 51 / 58 / 58 sur 100 |
| 25_5_2_5_2_1 / 300 | 2,572 ± 1,529 | 31 / 41 / 33 sur 300 |
| 50_10_5_10_5_2 / 20 | 0,582 ± 0,171 | 20 / 20 / 20 sur 20 |
| 50_10_5_10_5_2 / 100 | 2,352 ± 0,256 | 79 / 76 / 80 sur 100 |
| 50_10_5_10_5_2 / 300 | 6,871 ± 0,686 | 173 / 176 / 171 sur 300 |

La table de réservations évite de parcourir tous les robots à chaque candidat.
Avant cette optimisation, les trois essais à 300 robots sur la carte de base
prenaient 27,629–30,894 s ; après, 6,664–7,185 s, avec les mêmes arrivées.
Le premier lot a chevauché des tests unitaires : cette comparaison exploratoire
n’isole pas l’effet de l’optimisation. Le lot final a tourné sans autre commande
de test ou de mesure de cette session, mais les applications de l’utilisateur
n’ont pas été arrêtées. Ce n’est pas un benchmark matériel universel.

## Rangées continues et pilotage (12 octobre 2026, Claude)

Sonde Node non versionnée, 40 robots, 1 200 s simulées, graine 3, 80 travées sur 48 × 32
(8 rangées de 10), mêmes stations, un seul run par cas : cycles terminés (robots sans cycle).

| Pilotage | Une ligne sur deux 2025+ | classique | Rangées continues 2025+ | classique |
|---|---|---|---|---|
| Trajet entier | 80 (0) | 80 (0) | 57 (0) | 38 (2) |
| Fenêtre | 190 (0) | 26 (14) | 25 (15) | 0 (40) |

Après le passage sous les robots en montée (2025+, même sonde, fenêtre et RHCR) :

| Pilotage | Une ligne sur deux 2025+ | classique | Rangées continues 2025+ | classique |
|---|---|---|---|---|
| Fenêtre | 115 (0) | 26 (14) | 177 (0) | 0 (40) |
| RHCR | 167 (0) | 77 (0) | 160 (0) | 0 (40) |

Le pilotage à trajet entier impose que chaque robot finisse son cycle avant les autres :
son total de cycles est borné par le plus lent, ce n’est pas une mesure de débit.
Un seul run par cas, sans intervalle de confiance : à confirmer par campagne.

Les rangées continues forment des murs : l’accès de grimpe est terminal, une rangée ne se
franchit qu’à ses extrémités (et, en 2025+, sous le stockage). Les méthodes fenêtre et
RHCR, sans garantie de progrès, se bloquent alors facilement (blocage total en classique).
Le test de pilotage classique utilise des rangées éloignées du couloir de bordure. En 2025+, l’accès est désormais traversable (voir ci-dessus) ; le classique, mur
continu, reste bloquant pour la fenêtre et RHCR.

## Décision et reste à valider

Vérification finale du code : `npm run verify` réussi, 80 tests, build,
parcours navigateur et zéro erreur console. Résultats du 11 octobre 2026,
16:28:56 UTC dans `web/check/results.json`. Quatre réplications entière/RHCR
strictement identiques entre Worker et Node ; captures ordinateur/mobile
réellement inspectées, focus/clavier/pause/export contrôlés. Régressions
Edge 155.0.4283.45 et Firefox 157.0 ; nouveau parcours RHCR dans Chromium.

Iris Xe/ANGLE D3D11, 1280×800, démonstration 48×32, quatre niveaux,
32 colonnes, graine 1, vitesse 1×, mesure de 2 s, **un seul run par flotte** :

| RHCR affiché | Images/s | p95 / max (ms) |
|---|---:|---:|
| 20 robots | 60,0 | 16,7 / 16,8 |
| 100 robots | 60,0 | 16,8 / 16,8 |
| 300 robots | 58,0 | 16,8 / 50,0 |

Essais courts au démarrage, pas une garantie sur la durée ou tous les plans.
La régression du plan maximal avec pilotage entier (300 robots, 1920 bacs,
5 s) atteint 35,6 images/s, p95 33,4/max 83,4 ms. Cette limite de rendu demeure.

**Conserver TypeScript et les Workers pour l’instant.** Les essais montrent à la
fois un coût de recherche sensible et un manque de progression qui est une
limite algorithmique. Un changement de langage seul ne résout pas cette seconde
limite. Le rendu maximal était déjà sous 60 images/s à l’étape 8 ; le coût du
rendu est distinct de celui du solveur et n’appelle pas automatiquement une
migration du moteur. Les campagnes restent hors du fil d’affichage.

L’étape 9 reste ouverte pour sa validation scientifique : obtenir des scénarios
officiels non dégénérés/reproductibles, exercer les départ-but-départ et les
destinations partagées du papier, améliorer ou comparer la progression en flotte
dense, et mesurer des campagnes longues sur les trois architectures. Les essais
actuels ne justifient pas de déclarer tous les pilotages validés, ni de supprimer
« solveur non validé » des résultats. Aucun chiffre industriel n’est établi.
