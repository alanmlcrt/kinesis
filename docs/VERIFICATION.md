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

## Limites à conserver dans les rapports

Le contexte tactile et les tailles de fenêtre simulent des appareils : ils ne valident
pas leur GPU, leur autonomie ou leur navigateur réel. Aucun téléphone/tablette physique
ni Safari n'est accessible dans cette vérification Windows. Les captures ne constituent
pas un audit de lecteur d'écran. Les tests couvrent les scénarios indiqués, pas toutes
les combinaisons possibles. Les cadences sont des observations sur cette machine, un
seul run par cas, sans conclusion scientifique sur le trafic industriel.

Dernier passage du 10 octobre 2026 : `npm run verify` réussit, 34 tests unitaires,
tous les scénarios navigateur (dont le temps perdu et la campagne) et 0 erreur console. Compact à 220
robots et étendu à 300 robots : 60,0 images/s ; maximal à 300 robots/1920 bacs :
43,1 images/s, p95 et max 33,4 ms (Iris Xe/ANGLE D3D11, 1280×800, graine 1, vitesse 1×, 5 s, un seul run par cas).
Le contrôle `adb devices -l` ne trouve aucun appareil physique connecté.
