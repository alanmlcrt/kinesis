# Vérification des implémentations

Chaque modification est testée avant d'être déclarée terminée. Depuis `web/` :

```powershell
rtk npm run verify
```

Cette commande exécute les tests Node, construit le code courant puis ouvre ce build
dans les navigateurs. Un échec arrête la commande ; les résultats JSON ne sont remplacés
qu'après la réussite de tous les contrôles. Le serveur de test et les profils de navigateur
sont isolés de l'app et des données de l'utilisateur.

## Correspondance entre comportements et contrôles

Laboratoire interactif (11 octobre) : `sim/lab.test.ts` contrôle les frontières exactes
des durées de cycle, deux cycles dans les trois profils, déterminisme et reprise JSON.
`check/lab.mjs` exerce l’atelier initial sans pas simulé, configuration/fermeture/focus,
lancement explicite, vraie projection et clic sur une instance 3D, sélection par
identifiant, position conforme au moteur, quatre courbes dont la moyenne de cycles,
absence de données avant un cycle, pause, remise à zéro sans panneau résiduel,
tous les instruments désactivés, onglets au clavier, accès direct Analyser,
captures ordinateur et fenêtre mobile. Cadence relevée avec quatre courbes actives,
20 robots, vitesse 1× pendant 2 s (un seul run, pas un benchmark industriel).
Captures : `lab-workshop.png`, `lab-robot.png`, `lab-live.png`,
`lab-mobile-workshop.png`, `lab-mobile-robot.png`, `lab-mobile-live.png`.

Dernier passage : `npm run verify` réussi le 11 octobre 2026 (Claude, 21:51 UTC), 82 tests ;
avant : 81 tests, build et
contrôles navigateur du laboratoire interactif et des fonctionnalités existantes,
zéro erreur console (`check/results.json` : 2026-10-11T20:54:08.206Z).
Captures finales ordinateur/mobile de l’atelier, du robot, des courbes et de la
congestion inspectées, ainsi que le configurateur mobile. Quatre courbes actives,
20 robots, 1280×800, 1×, 2 s : 60,1 images/s, p95 16,7/max 16,8 ms, un seul run.
Les nouveaux parcours sont contrôlés dans Chromium ; les régressions Edge/Firefox
passent. Le plan par allées à 154 travées/72 robots atteint 60,0 images/s, p95
16,7/max 16,8 ms (Iris Xe/ANGLE D3D11, 1280×800, graine 1, vitesse 1×, 5 s, un seul run).
Les recettes du motif restent des réglages du brouillon, le plan appliqué est sauvegardé.

Refonte de Concevoir et travée à 2 cellules (11 octobre, Claude) : `check/pattern.mjs`
retiré avec le compositeur de motif. Les parcours éditeur de `check.mjs`, `classic.mjs`,
`profiles.mjs`, `remaining.mjs` et `lab.mjs` passent par l’écran : presets `data-preset`,
pose par clic sur `[data-cell="x,z"]`, dimensions sur la matrice (champ, −/+, aria-invalid
hors bornes), architecture en pastilles radio (flèches au clavier), Gomme, abandon du
brouillon en quittant l’onglet, application → Simuler en pause à t = 0, curseur clavier
borné lu dans l’`aria-label` du plan. `layout.test.ts` couvre `resizeLayout` (stations du
bord suivies, stockage hors sol retiré, retour exact au plan de départ, tailles refusées)
et les travées adjacentes. `check.mjs` tire la poignée de largeur, peint une rangée de
10 travées puis vérifie qu’une seule annulation retire tout le geste (régression du
historique capturé trop tard, corrigé pendant la refonte).

Étape 9 : `rhcr.test.ts` exerce la fenêtre w/période h, la suppression de la queue,
les échanges d’arêtes, le repli sûr, les erreurs, le déterminisme/reprise JSON,
les cycles sur trois profils, les budgets et les transitions d’ascenseur indivisibles.
`check/rhcr.mjs` exerce le sélecteur du run, pause/mouvement, comparaison Worker/Node,
export, clavier/focus et mobile. Captures `rhcr-live.png`, `rhcr-settings.png`,
`rhcr-mobile.png`.

`npm run benchmark` audit/import des archives officielles, 15 graphes, 150 CSV,
trajets non nuls à un robot, 18 sondes multi-robots et contrôle indépendant des
conflits. Données brutes dans `check/mapf3d/results.json`. Ce benchmark scientifique
partiel reste séparé de la suite navigateur ; anomalie des scénarios et limites
de progression explicitées dans `docs/VALIDATION.md`.

| Comportement implémenté | Contrôle reproductible |
|---|---|
| Déplacement, réservations, grimpe, transfert et retour | `sim.test.ts`, `layout.test.ts`, `invariants.test.ts` : cellules et colonnes exclusives, trajets adjacents, bacs identifiés, continuité, cycles complets |
| Graines et reprise | Déterminisme pas à pas, graines aux bornes, reprise JSON dans les 16 phases, ordre des équipements ; rechargement du plan avec graine 4294967295 dans Edge/Firefox |
| Validation des configurations | Plans, coordonnées, capacité, graines, version JSON ; champs vides, hors limites et fractionnaires dans l'éditeur |
| Persistance locale | `preferences.test.ts` : lecture/écriture, copies indépendantes, données invalides, lecture refusée, quota dépassé, conservation des données précédentes |
| Brouillon et annulation | Placement/effacement avec assertions après chaque action, 55 modifications puis exactement 50 annulations, fermeture sans application |
| Protections de l'éditeur | Dernier rack/station non effaçable, application d'une flotte invalide sans modifier run/sauvegarde, champs d'implantation non générés refusés |
| Commandes et focus | Vitesses 1×/2×/5×/10× contrôlées par le compteur de pas, pause immobile, application pendant la lecture, clavier, Espace et Échap, restauration du focus |
| Rendu et ressources | Instances aux positions du plan, pièces synchronisées, matrices finies, contact bac/support, station hors des roues, absence de racks résiduels et de croissance géométries/textures GPU |
| Caméra | Rotation par glisser, zoom à la molette et redimensionnement sans avancer le moteur en pause |
| Toucher et formats d'écran | Contexte Chromium tactile, placement/application/rechargement en 360×640, 844×390 et 768×1024, panneau dans l'écran |
| Grandes configurations | Compact : 220 robots/320 bacs ; étendu : 300/720 ; maximal : 80×64, 12 rangées, 8 niveaux, 300 robots/1920 bacs ; mouvements actifs et cadence réellement mesurée |
| Navigateurs et chargement | Chromium, Edge et Firefox ; cycle, pause, stockage et rechargement ; erreurs console et ressource favicon servie par le build |

Les tests unitaires sont dans `web/src/`. Les scénarios navigateur sont dans
`web/check/check.mjs` et `web/check/remaining.mjs`. Les résultats sont dans
`web/check/results.json` et les captures dans `web/check/` ; ils doivent être inspectés.

## Préparer les navigateurs

Les contrôles supplémentaires utilisent Edge installé sur Windows et le Firefox
fourni par la dépendance Playwright existante. Installation de son binaire de test :

```powershell
rtk proxy node node_modules/playwright/cli.js install firefox
```

Cela n'ajoute pas de dépendance npm au projet. Les versions effectivement testées sont
écrites dans les résultats. La suite échoue si un navigateur requis ne peut pas démarrer.

## Temps perdu (étape 4)

| Comportement | Contrôle |
|---|---|
| Temps perdu = durée réelle − durée libre, attente sur place | `congestion.test.ts`, robot seul bloqué 40 pas vs jumeau libre |
| Idem avec repli par la baie (détour + attente) | `congestion.test.ts`, répartition colonne/baie |
| Cumul par case = total, valeurs ≥ 0, rien en hauteur, 0 pour un robot seul | `congestion.test.ts`, 1 et 300 robots, 4000 pas |
| Déterminisme et reprise JSON avec les nouveaux champs | tests existants (`deepEqual` sur l'état complet) |
| Texture 3D et coupe 2D identiques au moteur, case max en jaune viridis | `check.mjs`, 100 robots en pause |
| Maximum et lecture au survol égaux au moteur | `check.mjs` |
| Coupe par niveau au clavier, plan 3D à la bonne hauteur | `check.mjs`, niveau 2 |
| Mentions « un seul run », « solveur non validé », « chauffe incluse » | `check.mjs` |
| Rien ne change en pause | `check.mjs` |
| Panneau replié par défaut sur téléphone, déplié dans l'écran sans chevaucher les commandes | `check.mjs`, 390×844 |
| Régression : le choix de flotte au clavier ne déplace plus le focus ni n'ouvre l'éditeur | `check.mjs` |

## Campagne de mesure (étape 6)

| Comportement | Contrôle |
|---|---|
| Graines de réplication déterministes, distinctes, 32 bits | `campaign.test.ts` |
| MSER-5 : transitoire écarté, stationnaire intact, dérive non détectée | `campaign.test.ts` |
| Régression : pas de troncature en fin de série sur deux lots égaux | `campaign.test.ts` |
| IC 95 % Student (R = 2 et 5, valeurs calculées à la main) | `campaign.test.ts` |
| Réplication déterministe et identique au moteur pas à pas | `campaign.test.ts` |
| Chauffe commune, débit et ratio après chauffe | `campaign.test.ts`, séries synthétiques |
| Paramètres refusés (flottes vides/en double/hors capacité, R, durée, graine) | `campaign.test.ts`, `check.mjs` |
| Annulation sans résultat partiel | `check.mjs` |
| Scène fluide pendant un calcul qui avance réellement | `check.mjs` (p95 et progression mesurées) |
| Export : graines, commit, mentions ; Worker et Node identiques ; résultats recalculés | `check.mjs` |
| Tableau = export, focus rendu à « Mesurer », pas de débordement mobile | `check.mjs` |

## Comparaison de configurations (étape 7a)

| Comportement | Contrôle |
|---|---|
| 1 à 3 configurations, noms uniques, base absente pour une seule | `campaign.test.ts`, `check.mjs` |
| Base obligatoire dès deux configurations ; capacité/emprise vérifiées sur les plans | `campaign.test.ts`, `check.mjs` (messages avec les valeurs) |
| Flotte hors capacité d'une configuration : refus nommant la configuration | `campaign.test.ts` |
| Front de Pareto, débit maximal mesuré | `campaign.test.ts`, recalcul de l'export dans `check.mjs` |
| Plans nommés : aller-retour, entrées invalides ignorées, stockage refusé sans écrasement | `preferences.test.ts` |
| Nom en double refusé, 4e configuration désactivée, suppression avec focus conservé | `check.mjs` |
| Export multi-configuration recalculable, mêmes graines pour toutes | `check.mjs` |
| Trois séries distinguables (couleur validée + forme), légende | `check.mjs`, captures inspectées |

## Plans par allées (étape 7b)

| Comportement | Contrôle |
|---|---|
| Rangées serrées dans un bloc, allées entre blocs, transversales, allée devant les stations, stations sur 1 ou 2 côtés | `aisles.test.ts` (positions attendues) |
| Emplacements, emprise, sol libre, flotte possible ; plus d'allées = moins d'emplacements | `aisles.test.ts` |
| Réglages refusés (bloc, allée, transversale, front, côtés, stations, plus de 512 travées) | `aisles.test.ts`, `check.mjs` |
| Chaque colonne et station joignable, chaque robot finit un cycle (3 plans dont le plus dense) | `aisles.test.ts` |
| Génération dans l'éditeur, mesures affichées, enregistrement (nom en double refusé) | `check.mjs` |
| Plan dense appliqué : instances conformes, flotte limitée aux baies, cadence mesurée | `check.mjs` |
| Comparaison de deux plans générés à emprise égale, export recalculé | `check.mjs` |

## Génération classique (étape 7c)

| Comportement | Contrôle |
|---|---|
| Cinq cases bloquées par travée, accès de grimpe depuis l'allée, passages 2025+ conservés | `classic.test.ts` |
| Anciennes sauvegardes compatibles, génération conservée en JSON, génération inconnue refusée | `classic.test.ts`, `classic.mjs` (rechargement) |
| Plans réguliers/par allées, transversales, stations sur deux côtés, erreurs de placement/flotte récupérables | `classic.test.ts`, `classic.mjs` |
| Dimensions hors limites refusées avant les boucles de génération, sans gel de l'interface | `classic.test.ts` (deux générations), `classic.mjs` |
| Deux cycles par robot, occupations/réservations, continuité et bacs : classique dense 72 robots, transversales, stockage rare à huit niveaux | `invariants.test.ts` |
| Déterminisme, graines différentes, reprise JSON et réplication conforme au moteur | `classic.test.ts` |
| Choix au clavier, annulation, sauvegarde nommée, mobile, emprise 3D conforme au moteur et sans résidu au retour 2025+, ressources GPU stables entre générations | `classic.mjs`, captures classic inspectées |
| Comparaison classique/2025+ à capacité égale, export avec génération, Worker identique au moteur Node et résultats recalculés | `classic.mjs` |

## Interface claire (demande du 11 octobre 2026)

| Comportement | Contrôle |
|---|---|
| Fond Three.js et sol clairs, fond neutre de coupe clair, commandes regroupées | `theme.mjs` sur le build courant |
| Contraste texte normal et erreurs ≥ 4,5:1 ; boutons actifs et lettres des plans ≥ 4,5:1 ; commandes et séries ≥ 3:1 | `theme.mjs` |
| Éditeur, campagne et scènes 2025+/classique lisibles sur fond clair | captures ordinateur et mobile réellement inspectées |
| Focus, clavier, hover, erreurs récupérables, scènes actives/pause, mobile et remplacement des ressources | parcours existants de `check.mjs`, `classic.mjs` et `remaining.mjs` |

## Exploration densité/débit (étape 7d)

| Comportement | Contrôle |
|---|---|
| Famille à emprise égale dans les deux générations, capacité variable, plans identiques dédoublonnés | `exploration.test.ts` |
| Base explicite, 15 combinaisons maximum, listes/paramètres/flottes invalides refusés sans troncature | `exploration.test.ts`, `exploration.mjs` |
| Seuil de plateau : 95 % du maximum, deux flottes suivantes, chauffe détectée partout, zéro/absence/décroissance refusés | `exploration.test.ts` sur séries synthétiques |
| Résultats indépendants de l'ordre de fin, réplications incomplètes/en double refusées | `exploration.test.ts` |
| Deux Workers réellement actifs, calcul qui progresse, annulation/erreur récupérable/fermeture sans Worker résiduel ni export partiel | `exploration.mjs` |
| Export recalculé, plans complets, base/graines/chauffe/IC, front et seuil ; chaque réplication identique au moteur Node | `exploration.mjs` |
| Focus conservé au lancement, Échap pendant le calcul, retour aux campagnes, scène conservée, écran mobile sans débordement | `exploration.mjs`, captures ordinateur/mobile inspectées |

## Méthodes de pilotage (étape 7e)

| Comportement | Contrôle |
|---|---|
| Pilotage du sol séparé, méthode actuelle conservée, paramètres invalides refusés | `control.test.ts`, identité des séries avec/sans sélection explicite |
| Fenêtre renouvelée, cycles, continuité, colonnes, bacs et réservations | `control.test.ts`, deux cycles par robot dans les deux générations, 300 robots, horizons 2/32 |
| Déterminisme et reprise JSON pendant les phases observées | `control.test.ts`, états complets identiques pas à pas |
| Budget en opérations, épuisement sans réservation résiduelle, attente comptée | `control.test.ts` |
| Traversée d'une source libérée dans le futur, attente temporelle, pas de collision | `control.test.ts`, couloir à deux robots et stress de flotte |
| Régression : attendre sur une colonne conserve son verrou, sans double compte du temps perdu | `control.test.ts` |
| Même plan et base explicite, paramètres vides/invalides, deux plans refusés | `control.mjs` |
| Worker, annulation après progression, erreur récupérable, focus et fermeture pendant le calcul | `control.mjs` |
| Export avec paramètres, séries, opérations et durées ; Worker identique à Node, résultats recalculés | `control.mjs`, huit réplications, deux méthodes et flottes 2/4 |
| Tableau conforme à l'export, aucun changement du plan affiché, mobile sans débordement | `control.mjs`, captures control/settings sur ordinateur et mobile |

## Étape 8 — profils Ascenseurs et AutoStore

Contrôles ajoutés dans `web/src/sim/profiles.test.ts` et `web/check/profiles.mjs` :

- Plans valides/invalides, copie et JSON, gaines chevauchées, durée et horizon refusés,
  placement/effacement/annulation et sauvegarde du profil.
- Deux cycles par robot avec trajet entier et fenêtre ; unicité des cellules d’étage,
  exclusivité des gaines, conservation des bacs et des piles, reprise déterministe,
  positions continues, cohérence du temps perdu. Accès à deux bacs d’une même
  colonne sur des étages différents. Creusage de sept bacs au-dessus d’une cible,
  restauration de l’ordre, réservations multiples sans animation des autres bacs,
  remplissages 1/33/99 %, gaine unique lente et huit niveaux.
- Sécurité, conservation et budget à 300 robots pendant 5 000 pas dans chaque profil.
  Ces contrôles ne prétendent pas garantir le progrès ou la performance à cette échelle.
- Navigateur : deux cycles de quatre robots, comparaison des matrices affichées aux
  positions du moteur, grilles/étages et coupe au sommet, dégagement vertical des
  bacs, remplacements répétés avec ressources stables, sauvegarde/rechargement,
  erreurs récupérables, ordinateur/mobile et comparaison/export de trois profils.
  Six réplications Worker recalculées dans Node avec le même protocole et la base
  capacité égale explicitement choisie.

Résultats définitifs et commandes : entrée datée de l’étape 8 dans `docs/JOURNAL.md`.
Captures : `lifts*.png`, `autostore*.png`, `profiles-compare*.png` dans `web/check/`.
Hypothèses et limites : `docs/PROFILES.md`. Validation MAPF/RHCR : étape 9.

## Limites à conserver dans les rapports

Le contexte tactile et les tailles de fenêtre simulent des appareils : ils ne valident
pas leur GPU, leur autonomie ou leur navigateur réel. Aucun téléphone/tablette physique
ni Safari n'est accessible dans cette vérification Windows. Les captures ne constituent
pas un audit de lecteur d'écran. Les tests couvrent les scénarios indiqués, pas toutes
les combinaisons possibles. Les cadences sont des observations sur cette machine, un
seul run par cas, sans conclusion scientifique sur le trafic industriel.

Passage du 11 octobre 2026 avant les extensions pilotage/profils/RHCR : `npm run verify` réussit, 64 tests unitaires,
tous les scénarios navigateur (dont thème clair, classique/comparaison/export, régressions
Edge et Firefox, exploration parallèle sur cinq plans) et 0 erreur console. Contraste minimal des textes courants : 5,61:1.
Captures du thème clair réellement inspectées sur ordinateur et fenêtre mobile.
Classique dense à 72 robots/154 travées : 60,0 images/s,
p95 16,7 ms, max 16,8 ms. Compact à 220 robots : 60,0 images/s ; étendu à 300 robots :
59,2 images/s, p95 16,8 ms, max 33,4 ms ; maximal à 300 robots/1920 bacs :
35,2 images/s, p95 33,4 ms, max 50,0 ms
(Iris Xe/ANGLE D3D11, 1280×800, graine 1, vitesse 1×, 5 s, un seul run par cas).
La variation de cadence du plan maximal par rapport aux passages antérieurs n'a pas
été isolée. Ressources GPU stables entre générations (classique : 18 géométries et
7 textures ; 2025+ : 17 et 7). La variante classique a été contrôlée dans Chromium ;
les parcours existants ont aussi été vérifiés dans Edge et Firefox.
Exploration dans Chromium : deux Workers actifs, 30 réplications (cinq plans, flottes
2/4/8, R = 2, 800 s, graine 3) identiques à Node, export entièrement recalculé ; seuils
non identifiés sur ce petit balayage. Plateau positif et cas limites vérifiés sur données
synthétiques. Scène active pendant le calcul : 60,0 images/s, p95/max 16,8 ms sur 0,5 s,
un seul run. Les captures exploration/settings sur ordinateur et mobile sont inspectées.
Le dernier contrôle physique `adb devices -l` du 10 octobre ne trouvait aucun appareil connecté.

Pilotage 7e : huit réplications (plan de démonstration, méthodes entière/fenêtre, flottes
2/4, R = 2, 800 s, graine 3, horizon 8, budget 100000), toutes identiques à Node,
résultats et opérations recalculés. Chauffe non détectée en fenêtre à quatre robots :
débit masqué dans l'interface. Aucun gain démontré par ce petit contrôle de parcours.
Scène active à 20 robots pendant le calcul de fenêtre : 60,0 images/s, p95 16,7 ms,
max 16,8 ms sur 0,5 s, un seul run. Annulation après progression réelle, erreur et
reprise, fermeture au clavier, disparition du Worker, table/export conformes ; captures
control/settings sur ordinateur et mobile réellement inspectées. Le temps réel exporté
couvre simulation, pilotage et collecte, chauffe incluse ; ce n'est pas un temps isolé
du solveur. Pas de garantie de progrès de la méthode priorisée sur tous les plans.
