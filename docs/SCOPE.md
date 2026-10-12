# Kinesis — périmètre

Date : 2026-10-10.

## Ce qu'on construit

Un studio 3D dans le navigateur pour **comprendre et optimiser un entrepôt robotisé** :
voir la flotte bouger, voir où et pourquoi elle bloque, modifier l'entrepôt, mesurer,
comparer. Et, à terme, un instrument qui répond à une question précise :

> À partir de combien de robots un entrepôt sature-t-il par congestion, et qu'est-ce qui
> déplace ce seuil (architecture, structure du bâtiment, taille de flotte) ?

Direction demandée le 11 octobre 2026 : un petit laboratoire ludique industriel.
Entrée par un atelier et un aperçu du plan, espaces Concevoir/Simuler/Analyser,
lancement explicite, inspection d’un robot au clic et courbes du run activables.
Les instruments décrivent la simulation illustrative ; les campagnes avec
réplications restent nécessaires pour comparer les configurations.

On y va **étape par étape** (`docs/ROADMAP.md`). On commence petit : une scène fluide et
juste vaut mieux qu'un logiciel complet qui marche à moitié.

## Technologies

- **React + React Three Fiber** (avec drei), en **TypeScript**, servi par **Vite**.
  React plutôt que JavaScript sans framework : le code reste maintenable quand les
  fonctionnalités s'empilent, ce qui compte pour un projet construit avec des agents IA.
- La simulation est un **module TypeScript pur**, sans React, qui avance par `step()`.
  Le rendu l'affiche ; il ne la calcule pas.
- Rien d'autre sans accord de l'utilisateur. Si un jour les mesures montrent que la
  simulation est trop lente (Web Worker, autre langage), on le décide à ce moment-là, chiffres
  à l'appui.

## Le modèle

Les trois familles d'entrepôts robotisés sont le **même modèle** :

> Un graphe de **cellules 3D**, plus une règle de **transition verticale** (où, avec quelle
> capacité, quelle latence, quelle exclusivité), plus un **mode d'accès au stock**.

| Profil | Circulation | Transition verticale | Accès au stock |
|---|---|---|---|
| Skypod nouvelle génération (2025+) | au sol, dans les allées et les passages sous racks compatibles avec l'encombrement du robot | les robots s'engagent sur les montants équipés et grimpent dans des chemins verticaux déclarés ; un robot par colonne est une hypothèse conservatrice du simulateur | emplacement de rack, prise et dépôt latéraux depuis le chemin de grimpe au bon niveau |
| Ascenseurs | libre à chaque étage | quelques gaines, capacité et durée de trajet | direct |
| AutoStore | sur la grille, au sommet | creusage vertical sur place | pile de bacs, dernier rangé premier sorti |

**Un seul moteur, plusieurs profils et variantes.** On commence par Skypod nouvelle
génération. La variante classique, avec circulation dans les allées, est disponible
depuis l'étape 7c pour comparer les générations, dans le même moteur.

L’étape 8 ajoute les profils Ascenseurs et AutoStore. Le 11 octobre 2026,
l’utilisateur a confirmé le modèle illustratif configurable : robots partageant
des ascenseurs entre étages ; robots au sommet avec creusage et restitution des
piles AutoStore. Capacité fixe d’un robot par gaine, durée et placement configurables,
puits temporaires privés et ports abstraits : hypothèses et limites dans
`docs/PROFILES.md`. Ces simplifications ne sont pas une calibration industrielle.

La décision du 2026-10-10 et les sources sont consignées dans `docs/SKYPOD.md`.
La grille de cellules est une discrétisation de simulation, pas une maille industrielle
universelle. Les passages sous racks ne rendent pas toute leur emprise traversable :
montants, obstacles et encombrement du robot déterminent les chemins possibles.
Les dimensions et durées non calibrées restent des hypothèses explicites.

## Congestion

Une allée très passante mais fluide n'est pas un embouteillage. La congestion se mesure en
**temps perdu par cellule** (attente, blocage, détour) rapporté au temps de trajet libre.
Une carte de fréquentation n'est pas une carte de congestion ; si on en affiche une, elle
porte son vrai nom.

Un champ 3D se lit mal en nuage de cubes colorés : vue 3D pour comprendre, **coupes par
niveau** pour lire les valeurs.

## Comparer des entrepôts

Comparer des architectures n'a de sens que sur une **base de normalisation explicite** :
capacité de stockage égale, emprise au sol égale, ou front de Pareto. Changer de base peut
changer le vainqueur. La base est donc un paramètre choisi par l'utilisateur, jamais une
valeur par défaut, affichée à côté de tout graphique comparatif et écrite dans tout export.

## Rigueur (dès qu'on affiche une mesure)

- **Déterminisme** : même graine, mêmes paramètres ⇒ même résultat. La graine fait partie
  du résultat.
- **Un run n'est pas un résultat** : un chiffre de mesure est une moyenne de réplications
  avec son intervalle de confiance. Un indicateur d'un seul run est dit comme tel.
- **Période de chauffe** détectée et écartée avant de mesurer.
- **Export** : données brutes + manifeste (paramètres, graine, réplications, base, version).
- **Solveur de trafic validé** contre le jeu de données MAPF 3D publié (Wang, Veerapaneni,
  Wu, Li, Likhachev — *MAPF in 3D Warehouses*, ICAPS 2024) avant tout résultat présenté comme
  scientifique. Avant cela, toute mesure est marquée « solveur non validé ».

## Ce qui est réglable

Structure (dimensions, niveaux, allées, racks, colonnes, stations), flotte (nombre de
robots, vitesses, temps de prise et de dépose), demande (arrivée des commandes),
mode de rangement (aléatoire, au plus proche), profil d'architecture, base de comparaison.

## Hors périmètre pour l'instant

Choix de l'emplacement à récupérer et affectation robot→tâche (règles simples, fixes),
énergie et recharge, pannes, humains dans les allées, coordination décentralisée.
Le code doit permettre de les ajouter plus tard sans tout refaire.

## Références

- Wang et al. — *MAPF in 3D Warehouses: Dataset and Analysis*, ICAPS 2024.
- Li et al. — *Lifelong Multi-Agent Path Finding in Large-Scale Warehouses*, AAAI 2021 (RHCR).
- Merschformann et al. — *RAWSim-O*, simulateur d'entrepôt robotisé de référence.
