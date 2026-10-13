# Concevoir l’entrepôt — étape 5, refonte du 11 octobre 2026

**Concevoir** est un écran à part entière (plus de fenêtre modale) : la matrice du plan
au centre, les réglages en cartes à droite, « Appliquer le plan → » en bas. L’app s’ouvre
sur cet écran sans lancer le moteur. **Construire**, depuis Simuler, ramène ici. Quitter
Concevoir sans appliquer abandonne le brouillon ; changer d’onglet met le run en pause.
Appliquer remplace le plan, remet le run à zéro (graine conservée) et ouvre **Simuler**
en pause à t = 0 : le lancement reste explicite (bouton Lecture).

## La matrice

- Une case = une cellule du moteur. Les emplacements (coordonnées paires) sont blancs,
  les voies de circulation (lignes/colonnes impaires) grisées.
- **Travée = rayonnage | allée de grimpe R | rayonnage** (12 octobre, brevet Exotec,
  voir `docs/SKYPOD.md`) : un bac de chaque côté par niveau. En 2025+ (et ascenseurs),
  une travée se pose sur toute colonne : rayonnages voisins dos à dos, allées à 3 cellules,
  sans case vide ; sous un rayonnage on circule mais on ne stationne pas. En classique,
  allées à 4 cellules au moins (cellule pleine entre deux rayonnages). Rangées continues sur toutes les lignes. AutoStore : une pile =
  une cellule, grille pleine possible. Stations et gaines sur les emplacements pairs.
- **Tracé** : *Point* (clic ou glisser-peindre), *Ligne* (glisser : horizontale ou
  verticale selon le geste ; travées au pas de 3 en largeur en 2025+ (rayonnages jointifs), de 4 en classique, de 1 en profondeur) et
  *Zone* (rectangle rempli). En ligne/zone, les travées doivent tenir dans la
  sélection et sont calées pour équilibrer les marges : une zone tirée
  jusqu’au bord droit pose la dernière allée en x = largeur − 4. Les positions
  impossibles sont ignorées et comptées ; un seul pas d'annulation par geste.
- Outils **Travée**, **Station**, (**Ascenseur**), **Gomme** : cliquer, ou **glisser
  pour peindre** (un seul pas d’annulation par geste). La travée se centre sous le
  pointeur (en classique sur la colonne paire la plus proche ; ramenée dans la zone permise) ;
  un trait rapide traite toutes les positions traversées. **Clic droit** = gomme le
  temps du geste, quel que soit l’outil. La gomme retire l’équipement qui couvre la
  cellule (rayonnage compris). Un fantôme indique la pose ou le retrait : plein si
  valide, pointillé rouge sinon.
- **Remplir automatiquement** : rangées et stations réparties sur toute la largeur
  (dernière rangée en x = largeur − 4), plus de bande vide à droite.
- **Dimensions sur la matrice** : champs Largeur/Profondeur avec −/+ (pas de 2) sur les
  bords, et poignées à tirer (bord droit, bord bas, coin). Le sol change immédiatement
  dans le brouillon (`resizeLayout`) : ce qui est au-delà du stockage (stations, gaines)
  suit le bord, ce qui sort du sol est retiré ; une taille rendant le plan invalide est
  refusée avec le motif. Pendant un geste, chaque taille est recalculée depuis le plan
  de départ : agrandir de nouveau restaure ce qu’un rétrécissement avait retiré.
- Clavier : sélectionner la matrice, flèches (pas de 2), Entrée ou Espace.
- **Annuler la modification** : 50 derniers états du brouillon.

## Les cartes

- **1 · Technologie** : Skypod 2025+, Skypod classique, Ascenseurs, AutoStore, avec
  l'essentiel à savoir pour la configurer.
- **2 · Partir d'un modèle** : modèles propres à la technologie, générés sur le sol
  actuel (la taille reste au choix de l'utilisateur), avec miniature, emplacements et
  robots possibles ; un modèle trop grand pour le sol est grisé avec la raison.
  Skypod : densité maximale, équilibré, débit prioritaire ; classique : dos à dos,
  avec transversales ; ascenseurs : étages et gaines ; AutoStore : grille pleine,
  ports des deux côtés. Sur téléphone, ces deux étapes passent avant la matrice.
- **Stockage et flotte** : niveaux, remplissage, rangement initial, robots (compteurs
  −/+) ; jauge robots / baies de stationnement.
- **Bilan du plan** : emplacements, sol libre, travées, stations (calculés par
  `layoutMetrics`, donc identiques au moteur).
- **Remplir automatiquement** : rangées × travées régulières sur le sol courant
  (`regularLayout`), remplace le brouillon, annulable.
- **Nom pour comparer** : ajoute le brouillon aux plans comparables (onglet Analyser).

Le compositeur de « motif à répéter » (blocs, allées, transversales) a été retiré de
l’éditeur à la demande de l’utilisateur ; `aisleLayout` reste utilisé par l’exploration
densité/débit (7d).

## Sauvegarde locale

Le plan appliqué, la flotte et la graine sont enregistrés sur cet appareil, pour cette
origine de navigateur. Le rechargement restaure la configuration et démarre un nouveau
run ; il ne reprend pas son avancement. Les brouillons ne sont pas sauvegardés.

Le format JSON version 1 est validé à la lecture : dimensions, coordonnées, équipements,
capacité de flotte et graine entière 32 bits. Une version inconnue ou une sauvegarde
illisible provoque un retour au plan de démonstration avec avertissement ; les données
existantes restent conservées jusqu'à une nouvelle application réussie. Si le stockage
est refusé, le plan fonctionne dans la page et un avertissement signale l'échec de sauvegarde.

## Configurations

| Configuration | Sol (cellules) | Rangées × travées | Niveaux | Emplacements de bacs | Stations |
|---|---|---|---|---|---|
| Démonstration (plan de départ) | 48 × 32 | 4 × 16 | 4 | 512 | 4 |
| Compact (comparaisons) | 48 × 32 | 8 × 24 | 4 | 1 536 | 4 |
| Étendu (comparaisons) | 64 × 40 | 10 × 30 | 6 | 3 600 | 6 |

Compact et Étendu ne sont plus proposés dans Concevoir (remplacés par les modèles) ;
ils restent des plans de référence dans Analyser.

Rangées continues depuis le 12 octobre 2026 (une travée par ligne).

Les dimensions sont des unités de simulation, sans conversion en mètres validée.
Ces configurations restent illustratives, sans certification d'implantation Exotec.

## Contraintes du modèle

- Sol pair, largeur 16–80 cellules, profondeur 16–64 ; 1–8 niveaux.
- 1–2 500 travées et 1–12 stations ; flotte de 1–300 robots, limitée par les baies libres
  (Compact : 284 baies).
- Travées sur toute ligne (rangées continues), colonne paire ; stations et gaines sur
  les emplacements pairs. Chevauchements, bordures incompatibles
  et absence de rack/station sont refusés sans modifier le brouillon valide.
- En 2025+, les lignes et colonnes impaires restent disponibles pour la circulation.
  En classique, la cellule de stockage de chaque travée est bloquée au sol ; l’accès R
  reste une baie terminale accessible par l’allée à gauche. Le plan est
  contrôlé avec le graphe du moteur : colonnes, stations et baies accessibles par les voies.
  L'éditeur ne permet pas de dessiner des murs ou des obstacles arbitraires.
- Remplissage de 1–100 % : nombre de bacs arrondi vers le bas, avec au moins un bac.
  Rangement aléatoire déterministe, ou emplacements les plus proches des stations
  selon la distance de Manhattan au sol, puis les niveaux inférieurs.
  À 100 % les deux modes occupent tous les emplacements. Ce choix initialise
  le stockage ; les bacs retournent ensuite à leur emplacement d'origine.
- Dimensions, ordonnancement conservateur, temps de prise et vitesses gardent les
  limites décrites dans [SKYPOD.md](SKYPOD.md).

## Exploration densité/débit (7d)

Depuis **Mesurer → Explorer densité / débit**, choisir des listes de rangées par bloc
et de largeurs d'allée, puis accepter la base **emprise au sol égale**. Le générateur
conserve dimensions, niveaux, génération, remplissage, rangement et nombre de stations
du plan appliqué ; stations sur un côté, allée devant les stations de deux cases,
sans transversale. La scène et le plan appliqué ne sont pas remplacés.

Quinze combinaisons au plus, plans identiques dédoublonnés, au moins deux plans distincts.
Les mêmes flottes et graines servent à tous les plans ; une flotte incompatible est
refusée avec le nom du plan. Deux Workers calculent les réplications en parallèle ;
annulation, fermeture ou erreur terminent les calculs sans export partiel.

Le front capacité/débit affiche des points numérotés, leurs IC 95 % et un tableau
(capacité, sol libre, maximum mesuré et sa flotte, appartenance au front, seuil observé).
Le seuil est la première flotte testée atteignant 95 % du maximum, avec au moins deux
flottes plus grandes atteignant aussi ce niveau, chauffe détectée partout. Sinon il
reste **non identifié**. Ce plateau descriptif ne prouve pas une congestion ; le front
classe les moyennes sans test de significativité. Le maximum mesuré est biaisé vers le haut.

L'export JSON contient le générateur, les plans complets, les graines, les séries brutes,
la chauffe, les résultats, le front et le critère de seuil. Le protocole est défini dans
`experiment-protocol`. Captures : `web/check/exploration.png` et `exploration-mobile.png`.

## Comparer le pilotage (7e)

Dans **Mesurer**, sélectionner un seul plan puis cocher **Comparer trajet entier /
fenêtre glissante**. Choisir explicitement capacité ou emprise égale : le plan reste
strictement identique, seule la réservation du sol change. L'horizon va de 2 à 32
déplacements de 0,5 s ; le budget de 100 à 1 000 000 opérations par recherche est
appliqué aux deux méthodes. Les flottes, graines, réplications, chauffe et IC sont communs.

La fenêtre recherche des mouvements et attentes dans l'espace-temps ; son préfixe engagé
est renouvelé à son terme. Les colonnes, baies, affectation des bacs et tours de flotte
restent ceux du moteur. Le sommet final est tenu tant qu'un nouveau départ n'est pas
planifié. Cette approche priorisée est conservatrice : elle peut se bloquer sur certaines
implantations, sans garantie de progrès ; ce n'est pas un solveur RHCR validé.

Le tableau de coût sépare les opérations reproductibles, recherches et budgets épuisés
(totaux des R réplications, chauffe incluse) du temps réel du lot. Ce temps couvre
simulation, pilotage et collecte dans le Worker, sur cette machine, sans IC ; il ne
pilote jamais les décisions. Les paramètres, compteurs et durées individuelles sont
dans l'export, avec les séries de débit/temps perdu et le manifeste existant.
La scène affichée conserve son pilotage habituel ; la comparaison se calcule dans le Worker.

## Vérification

Les tests Node couvrent notamment les configurations prédéfinies, un plan personnalisé,
les cycles sans collision, le déterminisme, le remplissage, la proximité des stations,
l'isolation des brouillons, les chevauchements, les bordures et la capacité de flotte.
Les plans denses et un plan de dimensions maximales sont exercés avec une flotte
maximale compatible, jusqu'à un cycle terminé par chaque robot. Cela vérifie les cas
testés, sans garantir l'absence de blocage sur toute implantation possible.
Les contrôles supplémentaires exercent deux cycles par robot avec un seul bac et toutes
les baies occupées, du stockage en bordure à huit niveaux, quatre stations aux coins,
du remplissage à 1 % et des graines aux bornes 0/4294967295. Ils contrôlent tous les
tableaux d'occupation/réservation à chaque pas, l'adjacence des trajets, la continuité des
positions et les identités des bacs. La reprise JSON est vérifiée dans les 16 phases du
cycle, et l'ordre des équipements dans le plan ne change pas le run.

La variante classique est exercée sur deux cycles par robot : plan dense à 72 robots,
transversales avec stations sur deux côtés, stockage rare à huit niveaux. La sauvegarde,
l'annulation du choix de génération, la concordance des cases bloquées et du rendu,
la comparaison avec 2025+ et les ressources GPU lors des changements de génération
sont contrôlées. Les dimensions hors limites sont refusées avant les boucles de génération.

Le contrôle Playwright exerce les configurations, la génération, les erreurs,
le placement/effacement au clavier et à la souris, une flotte de 17 robots,
le remplissage partiel, un cycle complet et les commandes sur une fenêtre mobile.
Il vérifie aussi l'annulation, le rechargement du plan, les sauvegardes corrompues/refusées,
les réglages non générés et l'absence d'accumulation de racks après modifications répétées.
Les nombres et positions des instances de racks/stations correspondent au moteur ; les
pièces de robots/bacs portent les mêmes matrices finies. Géométries et textures GPU restent
stables aux retours aux mêmes plans. Une flotte incompatible ne modifie ni le run ni la
sauvegarde ; Échap restaure le focus. Une version de sauvegarde inconnue et un accès au
stockage refusé sont aussi vérifiés sans écraser les données existantes.
Le cadrage et les géométries de racks suivent les dimensions et niveaux du run.
Le serveur de vérification possède son propre processus et un port libre attribué
automatiquement : il teste le build courant sans dépendre du serveur de l'app.

Captures : [éditeur](../web/check/editor.png), [mobile](../web/check/editor-mobile.png),
[compact](../web/check/layout-dense.png), [étendu](../web/check/layout-large.png).
Données de cadence : [results.json](../web/check/results.json), avec contexte de mesure.

Skills appliqués : ponytail, simulation-core, realtime-3d, design-direction,
experiment-protocol, ui-ux-design, web-accessibility et web-design-guidelines. Aucune dépendance ajoutée.

Les contrôles complétés sur la sauvegarde, l'historique de 50 modifications, les champs
invalides, le tactile, les grandes flottes et les navigateurs sont décrits dans
[VERIFICATION.md](VERIFICATION.md). Commande complète : `npm run verify` depuis `web/`.

Le **pilotage des robots** se choisit dans Concevoir (carte « Pilotage des robots »,
12 octobre) : RHCR priorisé par défaut, fenêtre glissante ou trajet entier, avec une
phrase d'explication ; il s'applique avec le plan et est sauvegardé avec la configuration.
En classique, seul le trajet entier est proposé (fenêtre et RHCR s'y bloquent, 0 cycle
mesuré). Simuler n'a plus de sélecteur Pilotage ni de bouton Mesurer : les mesures sont
dans l'onglet Analyser. Dans **Analyser**, cocher la comparaison puis
« RHCR priorisé » permet de comparer avec le trajet entier, sur le même plan et
le même protocole. Limites et statut de validation : [VALIDATION.md](VALIDATION.md).
