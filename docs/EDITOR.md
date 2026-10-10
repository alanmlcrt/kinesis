# Construire son entrepôt — étape 5

Depuis la scène, ouvrir **Construire**.

1. Choisir une configuration ou régler le sol, les rangées, les travées et les stations,
   puis cliquer **Générer le plan**. Générer remplace le brouillon, pas le run courant.
2. Modifier le plan : sélectionner **Travée**, **Station** ou **Effacer**, puis cliquer
   un emplacement. Une travée associe une base de grimpe et un support à droite.
   Effacer le support retire aussi la travée associée. **Annuler la modification**
   restaure le plan précédent (les 50 dernières modifications du brouillon).
3. Au clavier, sélectionner le plan, utiliser les flèches puis Entrée ou Espace.
   Les champs X/Z et **Utiliser l'outil** permettent aussi un placement précis,
   notamment sur petit écran. Les coordonnées sont des indices de cellules.
4. Choisir les niveaux, le remplissage, le rangement initial et la flotte.
5. **Appliquer et redémarrer** remplace le run et remet les robots/bacs à leur état
   initial, avec la graine conservée. L'état lecture/pause est conservé. Fermer abandonne
   le brouillon. Des réglages d'implantation modifiés doivent être générés avant application ;
   ils ne sont pas ignorés silencieusement.

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
| Démonstration | 48 × 32 | 4 × 8 | 4 | 128 | 4 |
| Compact | 48 × 32 | 8 × 10 | 4 | 320 | 4 |
| Étendu | 64 × 40 | 10 × 12 | 6 | 720 | 6 |

Les dimensions sont des unités de simulation, sans conversion en mètres validée.
Ces configurations restent illustratives, sans certification d'implantation Exotec.

## Contraintes du modèle

- Sol pair, largeur 16–80 cellules, profondeur 16–64 ; 1–8 niveaux.
- 1–256 travées et 1–12 stations ; flotte de 1–300 robots, limitée par les baies libres.
  Le plan Compact offre 220 baies : 300 robots y sont donc refusés.
- Placement sur les emplacements pairs. Chevauchements, bordures incompatibles
  et absence de rack/station sont refusés sans modifier le brouillon valide.
- Les lignes et colonnes impaires restent disponibles pour la circulation ;
  l'éditeur ne permet pas de dessiner des murs ou des obstacles arbitraires.
- Remplissage de 1–100 % : nombre de bacs arrondi vers le bas, avec au moins un bac.
  Rangement aléatoire déterministe, ou emplacements les plus proches des stations
  selon la distance de Manhattan au sol, puis les niveaux inférieurs.
  À 100 % les deux modes occupent tous les emplacements. Ce choix initialise
  le stockage ; les bacs retournent ensuite à leur emplacement d'origine.
- Dimensions, ordonnancement conservateur, temps de prise et vitesses gardent les
  limites décrites dans [SKYPOD.md](SKYPOD.md). Pas de mesure de congestion ajoutée.

## Vérification

25 tests Node couvrent notamment les configurations prédéfinies, un plan personnalisé,
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
