# Changelog

Toutes les modifications notables de l'app **Param Global** sont documentées ici.

---

## [1.18.0] - 2026-08-12

### Grille du Devis : colonne « Dern Prix Achat » et nouvelle répartition

Pendant du travail fait sur le Bon de Livraison en 1.13.0, transposé au Devis. Le dict `GRILLES` gagne une entrée `Quotation` :

```
Code de l'Article (4) · Quantité (1) · Prix (2) · Dern Prix Achat (2) · Montant (1)  = 10
```

La grille était auparavant absente de `GRILLES` — chaque utilisateur avait donc la sienne, au gré de son `__UserSettings`. Elle est désormais imposée à tous, comme celles du BL, du BR et des autres documents transactionnels.

`Quantité` passe de 2 à 1 et `Montant` de 2 à 1 pour loger la nouvelle colonne : la somme des largeurs ne peut pas dépasser 10, sinon `grid.js` abandonne le rendu personnalisé et une colonne disparaît en silence.

⚠️ Cette entrée référence `Quotation Item.dernier_prix_achat_ttc`, créé par **`devis` >= 0.15.0**. Les deux apps doivent être promues ensemble : `_gridview_existant()` écarte un champ absent, ce qui masquerait la colonne pour tous les utilisateurs. `devis` republie d'ailleurs les grilles après création de ses champs, `param_global` tournant avant lui dans l'ordre des `after_migrate`.

**Fichiers touchés** — `grilles.py`

## [1.17.0] - 2026-08-08

### Les nombres au standard français : saisie et affichage

Nouveau bundle `pg_nombres.bundle.js` (ajouté à `app_include_js`) plus `float_precision = 2` dans `apply_global_params()`. Trois problèmes distincts, une même cause racine : le format `#.###,##`.

**1. Le point saisi valait cent fois trop.** Dans ce format, le point est le séparateur de **milliers** : Frappe le supprime au parsing.

```
flt("12.50")  -> 1250      flt("443.88") -> 44388      flt("0.5") -> 5
```

Or le pavé numérique ne porte qu'un point. Un prix ou une quantité saisis au pavé entraient donc cent fois trop grands, **sans aucun message** — risque comptable sur un Bon de Réception ou un Paiement, erreur de stock sur une quantité. La touche est désormais interceptée et écrit une virgule : on voit immédiatement ce qui sera enregistré. Tous les champs numériques sont couverts (`Currency`, `Float`, `Percent`, `Int`) ; `Duration`, `Rating` et les champs non numériques ne le sont pas, un point y étant légitime.

Conversion **à la frappe et non au parsing** : convertir au parsing serait invisible mais casserait les valeurs légitimes, Frappe reformatant les champs au blur en « 1.234,56 » où le point est un vrai séparateur de milliers. En n'agissant que sur la touche pressée, on ne touche jamais aux valeurs posées par le programme. Le collage n'est pas traité — une valeur collée peut contenir un vrai séparateur de milliers, on ne veut pas avoir à le deviner.

**2. Les quantités rondes perdaient leurs décimales.** `float_precision` passe de 3 à 2, mais ça ne suffisait pas : le formateur Float retire les décimales quand la partie fractionnaire est nulle (`formatters.js` : « show 1.000000 as 1 »), sauf si on lui passe `always_show_decimals`. Les vues Rapport le passent, pas les formulaires ni les grilles — d'où « 1 » à côté de « 2,50 » dans la même colonne. Le drapeau est forcé une fois pour toutes. `Int` n'est pas touché : un entier n'a pas de décimale.

⚠️ `float_precision` gouverne l'affichage **et** l'arrondi de `flt()` : les quantités sont donc arrondies à 2 décimales à l'enregistrement. Assumé — 12 lignes importées d'Omag à 3 décimales sont concernées (3,58 DH au total). Le prochain passage de `majbd` les réimportera arrondies, ce qui peut faire apparaître quelques dixièmes de dirham sur 6 clients à la vérification des soldes. `conversion_factor` valant 1 partout, aucune conversion d'unité n'est touchée.

**3. Les montants affichaient tantôt 2, tantôt 4 décimales.** « 35,36 » sur une ligne, « 42,4320 » sur la suivante. En cause, les Property Setters `precision = 4` posés volontairement par `bon_livraison` et `bon_reception` sur `rate` / `amount` / `prix_ht` : le formateur Currency ne retombe à 2 décimales que si la valeur en compte **moins de 3** (`formatters.js`, bloc « a company in UAE »).

L'**affichage seul** est corrigé, jamais la précision stockée : repasser `amount` à 2 décimales déplacerait 4 526 lignes de BL et 992 de BR (~15 DH), donc les `grand_total` que la réconciliation Omag compare à 0,01 DH près par client. Le `docfield` est **cloné** avant qu'on y force la précision — le muter aurait cassé les calculs, qui lisent la même propriété. Et seul le formateur est enveloppé, pas `format_for_input()` : cliquer dans un prix affiche toujours ses 4 décimales réelles, donc aucune troncature silencieuse en sortant du champ.

### Un réglage System Settings n'était appliqué qu'à moitié

`float_precision` restait à 3 côté navigateur alors que la base disait 2. `frappe.db.set_single_value` n'écrit que dans `tabSingles` et court-circuite le cycle de vie du document : le `on_update` de System Settings, qui recopie chaque champ modifié dans `tabDefaultValue` (`system_settings.py::set_defaults`), ne se déclenchait jamais. Or c'est `tabDefaultValue` qui alimente `frappe.boot.sysdefaults`, la source lue par le desk.

**Le défaut touchait tout `apply_global_params()`**, pas seulement ce réglage : chaque valeur y était posée correctement côté serveur et ignorée côté navigateur. `number_format` s'en sortait par hasard, sa valeur ayant été propagée à un moment donné ; sur un site prod neuf il aurait été faux aussi. Nouveau helper `_param_systeme()` qui écrit aux deux endroits.

## [1.16.0] - 2026-08-08

### Recherche multi-mots : la validation par Entrée est rétablie sur les champs Link

Le dropdown affichait le bon résultat, mais **Entrée ne faisait rien** — ni sélection, ni message. Signalé sur le Code de l'Article d'un Bon de Réception (« rlx 3x2.5 » trouve bien « RLX CABLE SOUPLE 3X2.5 IMACAB NEXANS », sans pouvoir le valider).

Cause : Frappe annule la sélection au clavier si le texte saisi n'est pas une **sous-chaîne contiguë** du libellé ou de la description du résultat surligné (`link.js`, gestionnaire `awesomplete-select` → `input_matches_item`). Or toutes nos recherches serveur (`recherche_article`, `recherche_client`, `recherche_fournisseur`, `article_query`) découpent la saisie en jetons et n'exigent que la présence de chacun, dans n'importe quel ordre. Les deux logiques sont incompatibles par construction.

Nouveau bundle `pg_link_search.bundle.js` (ajouté à `app_include_js`) : `ControlLink.prototype.input_matches_item` accepte désormais le **même critère que le serveur** — chaque jeton présent dans le libellé ou la description. Le test natif de sous-chaîne contiguë reste la voie rapide, appelé en premier : on n'accepte que davantage, jamais moins. Le garde-fou garde son rôle, une saisie dont un mot est absent du résultat surligné est toujours refusée.

Posé sur le prototype, le correctif couvre d'un coup les **11 champs** touchés, qui passent tous par cette classe :

- **Grille articles** : Bon de Réception → Code de l'Article.
- **En-tête tiers** : Bon de Réception et Bon de Commande → Fournisseur ; Bon de Livraison, Devis (Dynamic Link `party_name`), Paiement BL et Retour → Client ; Paiement BR → Fournisseur. Sur ces champs, « code + nom » (`F000208 AABDOLLAH`) échouait déjà à cause du séparateur « — » du libellé.
- **Filtres de rapport** : Relevé Client, Relevé Client Détaillé → Client ; Historique des Mouvements → Article. C'était le cas le plus pénalisant : le filtre gardait le texte brut, le rapport ne se lançait pas et n'affichait aucune erreur.

Les contournements maison déjà en place — `select_article_then_qty` (BL, Devis, Bon de Commande, Retour) et `select_link_then_focus` (Écriture de Stock, Réconciliation de Stock), qui posent la valeur eux-mêmes sans passer par le `select()` d'awesomplete — deviennent redondants mais continuent de fonctionner ; vérifié sans régression.

Effet de bord bénéfique, mesuré en A/B : dans l'Écriture de Stock et la Réconciliation de Stock, `get_awesomplete_first_val()` retenait toujours la **1ʳᵉ** ligne du dropdown en ignorant celle surlignée aux flèches — on choisissait un article et un autre entrait, en silence. Comme la sélection native aboutit maintenant et ferme la liste avant que ce code ne s'exécute, il ne réécrit plus rien. Les deux fonctions restent à aligner sur la version du BL le jour où ces apps sont retouchées.

⚠️ **Fragilité connue.** Le patch se greffe sur une méthode interne de Frappe. Si une montée de version la renomme ou la supprime, il cesse de s'appliquer **en silence** et les 11 champs se recassent. Un `console.warn` est émis dans ce cas. **Après toute montée de version de Frappe, retester « rlx 3x2.5 » + Entrée sur un Bon de Réception.**

⚠️ **Déploiement.** `bench migrate` ne compile pas les assets JS et `public/dist/` est ignoré par git : le bundle ne voyage donc pas avec `git pull`. La promotion en prod exige **`bench build --app param_global`**, puis `clear-cache` et un `supervisorctl restart all` (`hooks.py` a changé, gunicorn garde `app_include_js` en cache). Côté navigateur, le boot du desk étant en cache `localStorage`, chaque utilisateur doit vider les données de site — un Ctrl+Shift+R ne suffit pas.

## [1.15.0] - 2026-08-07

### Export : Excel proposé par défaut au lieu de CSV

Frappe déclare `default: "CSV"` en dur dans `data_exporter.js`. On ne touche pas au coeur : l'enveloppe `DataExporter` déjà posée par cette app (pré-cochage des colonnes de la liste) repose la valeur juste après la construction de la boîte, via `set_value` pour que le champ Select et le modèle du dialogue restent cohérents.

### Listes : les filtres d'une visite précédente ne sont plus restaurés

Frappe mémorise les filtres de chaque liste par utilisateur dans `__UserSettings` et les rejoue à l'ouverture (`list_view.js::setup_defaults`, branche « Priority 1 »). On actualisait la page et la liste revenait filtrée comme on l'avait laissée — gênant sur les listes Client et Fournisseur, alors que la liste des Bons de Livraison, elle, s'ouvre toujours propre.

Uniformisé pour **toutes** les listes de **toutes** les apps : les filtres mémorisés sont retirés avant que Frappe ne les lise, ce qui le fait retomber sur la « Priority 2 » — les filtres par défaut déclarés par l'app dans ses `listview_settings`. Les défauts métier (masquer les articles désactivés, par exemple) restent donc appliqués : on n'efface que ce que l'utilisateur avait posé.

`frappe.route_options` n'est **pas** touché : c'est le canal par lequel un lien ouvre une liste déjà filtrée (« voir les BL de ce client »). Le neutraliser casserait cette navigation, et il est de toute façon vide après une actualisation.

⚠️ **Le point d'accroche est `BaseList.setup_defaults`, pas celui de `ListView`.** `this.user_settings` n'existe qu'à partir de `BaseList.setup_defaults()`, et le getter `view_user_settings` le déréférence sans garde. Une première version s'accrochait avant `ListView.setup_defaults` — donc avant son `super.setup_defaults()` — et levait `Cannot read properties of undefined (reading 'List')`, ce qui **vidait toutes les listes du desk**. On enveloppe donc `BaseList` et on supprime après l'appel original, avec un `try/catch` : ce patch est du confort d'affichage, il ne doit jamais pouvoir empêcher une liste de s'afficher.

Vérifié dans Chrome sur Client, Fournisseur, Article, Bon de Livraison, Bon de Réception, Retour, Paiement BL, Devis et Écriture de Stock : filtre posé puis actualisation → filtre effacé et liste complète, aucune erreur console.


## [1.14.0] - 2026-08-07

### Export de liste : les colonnes affichées sont pré-cochées

Dans la boîte « Exporter des données », Frappe décochait tout à chaque ouverture (`on_page_show: () => this.select_mandatory()` dans `data_exporter.js`) et ne recochait que les champs obligatoires : toutes les colonnes réellement visibles dans la liste (Code Client, Tél, Statut…) devaient être cochées à la main.

Nouveau bundle `pg_export_defaults.bundle.js` (ajouté à `app_include_js`, qui devient une liste) : après le `select_mandatory()` d'origine, il coche en plus les colonnes de la liste courante lues dans `cur_list.columns`. Les obligatoires restent cochés, donc le fichier exporté reste réimportable, et le bouton « Sélectionner Obligatoirement » garde son comportement d'origine.

Détails : la colonne Statut est un indicateur sans champ derrière — elle est mappée sur `status` / `disabled` quand le doctype porte l'un de ces champs. Le pré-cochage ne s'applique que si `cur_list.doctype` correspond au doctype exporté (donc pas d'effet sur l'export lancé depuis le doctype *Data Import*). `DataExporter` vivant dans un bundle chargé à la demande, la classe est enveloppée via un accesseur posé sur `frappe.data_import`.

## [1.13.0] - 2026-07-31

### Grille du Bon de Livraison : colonne « Dern Prix Achat » et nouvel ordre

La grille des articles du BL passe à 7 colonnes, dans l'ordre réglé par l'utilisateur :
`Code de l'Article (4)` · `Quantité` · `Prix` · `Entrepôt` · `Qté (Entrepôt)` · `Dern Prix Achat` · `Montant`.

`item_code` passe de 5 à 4 pour loger la nouvelle colonne : la somme des largeurs ne peut pas dépasser 10, au-delà `grid.js` abandonne le rendu personnalisé.

Le champ `dernier_prix_achat_ttc` est créé par `bon_livraison` 0.37.0 ; comme `param_global` applique les grilles avant lui à la migration, c'est un patch de `bon_livraison` qui garantit que le champ existe quand cette grille est écrite.

## [1.12.0] - 2026-07-30

### Son du desk coupé pour tous les utilisateurs

Valider un document (BL, Devis, Bon de Réception…) déclenchait un son : `frappe.utils.play_sound("submit")`, appelé par `form.js`. Frappe ne propose **aucun réglage système global** pour le couper — uniquement `User.mute_sounds`, une case **par utilisateur**, à 0 sur les 10 comptes.

C'est donc le même cas de figure que `grilles.py` : un réglage stocké par utilisateur qu'il faut uniformiser depuis le code pour qu'il existe aussi en production. Nouveau module `sons.py`, appelé par `apply_global_params()` :

- `mute_sounds = 1` pour tous les « System User » actifs ;
- Property Setter posant le **défaut du champ à 1**, pour que tout compte créé plus tard hérite du son coupé sans attendre le prochain `bench migrate`.

> Portée assumée : `mute_sounds` est un interrupteur global côté Frappe — il coupe **tous** les sons du desk (validation, annulation, suppression, erreur, e-mail), pas seulement celui de la validation. Ne cibler que le son de validation aurait exigé de surcharger `frappe.utils.play_sound` en JS pour filtrer sur l'argument `"submit"` ; le réglage natif a été préféré, choix validé avec l'utilisateur.

## [1.11.0] - 2026-07-28

### Grille du Bon de Commande ajoutée à la référence

Le `GridView` de **Purchase Order** n'existait que pour **un seul compte** (celui qui l'avait réglé dans l'UI), alors que les 6 autres grilles en ont un pour les 10 utilisateurs. Purchase Order manquait tout simplement dans le dict `GRILLES` : le réglage restait donc personnel, local à cette VM, et n'aurait jamais atteint la production par `git pull`.

Colonnes ajoutées à la référence (`Purchase Order Item`) : `item_code` (2), `qty` (1), `rate` (2), `amount` (2) — somme 7, sous la limite de 10 imposée par `grid.js`.

Après application : 10 utilisateurs ont le `GridView` Purchase Order, identique au réglage de référence — vérifié sur un compte tiers.

> Rappel du mode d'emploi (déjà en tête de `grilles.py`) : pour faire évoluer une grille, la régler dans l'UI **puis reporter les valeurs dans `GRILLES`**. Sans ce report, le prochain `bench migrate` remet l'ancienne présentation, y compris pour celui qui vient de la changer.

## [1.10.0] - 2026-07-28

### Montants en saisie : 2 décimales au lieu de 4, sans toucher au calcul

Les champs prix (`rate`, `amount`, `prix_ht`…) portent un Property Setter `precision = 4`, posé volontairement par `bon_livraison` / `bon_reception` : Omag stocke des prix unitaires à 4 décimales (câble à **1,296 DH**, boulonnerie à **0,288 DH**). Mesuré sur les données réelles au 2026-07-28, arrondir à 2 décimales déplacerait **365,80 DH sur les BL** (jusqu'à **7,20 DH sur une seule ligne** : 1,296 × 1 800 m), **422,17 DH sur les BR** et 10,02 DH sur les Retours — pour une tolérance de réconciliation Omag de **0,02 DH**. Cette précision doit donc rester à 4.

Le problème est que `precision` sert **à la fois** au calcul et à l'affichage : `ControlCurrency.get_precision()` renvoie `df.precision`, utilisé par `parse()` (arrondi de la saisie) **et** par `format_for_input()` (ce qui est visible). D'où « 40,0000 » en saisie, qui redevenait « 40,00 » à la validation.

Correction : on redéfinit **uniquement** `format_for_input`, qui ne sert qu'à remplir l'input (`data.js` : `$input.val(this.format_for_input(value))`). Ni `parse()`, ni le stockage, ni le calcul ne sont touchés. On affiche le minimum utile, plancher à 2 décimales, jamais de zéros de remplissage :

| Valeur réelle | Avant | Après |
|---|---|---|
| 40 | `40,0000` | **`40,00`** |
| 135 | `135,0000` | **`135,00`** |
| 0,5 | `0,5000` | **`0,50`** |
| 1,296 | `1,2960` | `1,296` |
| 10,0002 | `10,0002` | `10,0002` |

Un prix ayant réellement 3 ou 4 décimales **continue de les afficher** : masquer un vrai `1,296` derrière `1,30` montrerait à l'écran un prix différent de celui appliqué.

Vérifié en conditions réelles : `parse("1,296")` → `1.296`, `parse("0,2885")` → `0.2885`, aller-retour sans perte, précision du champ inchangée à 4.

> ⚠️ Ne pas « simplifier » en passant la precision à 2 : ce serait rétablir exactement le bug d'arrondi que le Property Setter corrige, et casser la vérification de l'étape 7 du skill MAJBD.

## [1.9.0] - 2026-07-28

### Avertissement « Stock Négatif » masqué

- Nouveau module `stock_negatif.py` : neutralise `update_entries_after.validate_previous_sle_qty` (ERPNext), dont le seul effet est un `msgprint` bleu prévenant qu'une **entrée** arrive sur un article au solde **négatif** — typiquement un Retour client ou un Bon de Réception.
- Motif : ERPNext ne contient que les mouvements de l'année en cours (migration Omag), donc **58,8 % des articles de PRINCIPAL sont en stock négatif** (2 404 sur 4 087 au 2026-07-28). L'avertissement se déclenchait en permanence, sur une situation connue et assumée, et finissait par être refermé sans être lu.
- Rien n'est bloqué par ce message dans ERPNext : le masquer ne change **aucun** comportement, seulement l'affichage. La valorisation reste imparfaite sur ces articles — conséquence du périmètre de migration, pas de ce patch.
- Branché sur `before_request` **et** `before_job`, les deux contextes d'exécution d'un document. Du code au niveau module de `hooks.py` ne conviendrait pas : hors `developer_mode`, `frappe.get_hooks()` sert les hooks depuis le cache redis sans réimporter le fichier.

> À retirer le jour où PRINCIPAL repartira d'un inventaire physique propre.

### Listes du desk : 500 lignes par défaut

- `pg_ui_defaults.bundle.js` enveloppe `frappe.views.BaseList.prototype.setup_defaults` pour porter la longueur de page à **500** au lieu du défaut Frappe (100 sur grand écran, 20 sur petit). S'applique à **toutes les listes de toutes les apps**.
- `500` fait partie des valeurs natives de pagination (`[20, 100, 500, 2500]`), donc le bouton correspondant s'affiche bien comme actif.
- `selected_page_count` est posé en même temps : sans lui, le bouton « Plus » serait retombé à 20 lignes par page.
- Les **rapports sauvegardés** conservent la longueur stockée dans leur document — comportement voulu, non modifié.
- Valeur isolée dans la constante `PG_LONGUEUR_LISTE` en tête du bundle.

## [1.8.0] - 2026-07-25

### Ajouté

- **Grilles des formulaires identiques pour tous les utilisateurs** (`grilles.py`) : la présentation des tables enfants (ensemble des colonnes, **ordre** et largeurs) est désormais imposée à chaque compte du desk, au lieu de dépendre des réglages personnels de chacun. Couvre 6 grilles : Bon de Livraison, Bon de Réception, Retour, Remise Bancaire, Écriture de Stock, Réconciliation de Stock.
- Frappe stocke cette présentation dans `__UserSettings` sous la clé `GridView`, **par utilisateur** (`grid.js::setup_user_defined_columns()` en tire l'ensemble, l'ordre et la largeur des colonnes) : un compte qui n'a jamais réglé sa grille retombait sur le défaut Frappe, d'où des formulaires différents d'un utilisateur à l'autre.
- Des Property Setters `in_list_view` / `columns` ne suffisaient pas : ils ne peuvent pas imposer l'**ordre** des colonnes, qui suit sinon celui des champs du doctype — or il en diffère sur 4 des 6 grilles (ex. Écriture de Stock : Article en 1re colonne, alors que le doctype place Entrepôt source avant).
- Référence **figée dans le code** (dict `GRILLES`) et non relue en base, pour que dev et prod donnent le même résultat. Réappliqué à chaque `bench migrate` via `apply_global_params()` : pour faire évoluer une grille, la régler dans l'UI puis reporter les valeurs dans `GRILLES`.
- Les autres préférences personnelles sont préservées (`last_view`, filtres et tri de liste, vue Rapport, Dashboard) ; le cache redis `_user_settings` est invalidé à l'écriture ; les doctypes/champs absents sont ignorés (site sans `remise_bancaire`, par exemple).

## [1.7.0] - 2026-07-10

### Ajouté

- Nom d'utilisateur (champ `username`) affiché en permanence, centré dans le header du desk, pour que l'utilisateur sache toujours avec quel compte il est connecté. Couleur d'accent dynamique selon la page courante (reprend la couleur « entête » propre à chaque doctype transactionnel — ex. rouge `#b91c1c` sur Retour, bleu `#2563eb` sur Devis, violet `#7c3aed` sur Bon de Commande…), repli sur le vert émeraude `#0f766e` si la page n'a pas de couleur dédiée. Alimenté via un nouveau hook `extend_bootinfo`.

### Modifié

- `System Settings.enable_password_policy = 0` : accepte les mots de passe faibles (ex. `123456`), pour simplifier la création de comptes de test.
- `System Settings.allow_login_using_user_name = 1` : autorise la connexion par Nom d'utilisateur en plus de l'email (nécessite que le champ `username` soit renseigné sur la fiche de chaque utilisateur).
- `public/js/ui_defaults.js` renommé en `public/js/pg_ui_defaults.bundle.js` et chargé en bundle versionné (au lieu d'un chemin `/assets` brut) : évite que les futurs changements de ce fichier restent bloqués jusqu'à 1 an par le cache navigateur (même correctif que `bon_livraison/qz_print.bundle.js`).

## [1.6.4] - 2026-07-10

### Autoriser un prix négatif sur une ligne de vente

- `Selling Settings.allow_negative_rates_for_items = 1` : nécessaire pour les lignes manuelles de type "REMISE" importées depuis Omag (remise ligne à ligne saisie comme un article manuel à prix négatif) — sans ce réglage, ERPNext rejette toute ligne à prix négatif, y compris ces remises légitimes.

## [1.6.3] - 2026-07-04

### Repli sur `dpa_historique` pour `dernier_prix_achat_ttc`

- `sync_last_purchase_ttc_all()` / `sync_last_purchase_ttc_for_items()` : le calcul de `Item.dernier_prix_achat_ttc` bascule désormais sur `dpa_historique` (app `article`) via `COALESCE` tant qu'aucun Bon de Réception validé n'existe pour l'article, au lieu de retomber sur `0`. Dès qu'un BR est validé, sa valeur reprend le dessus automatiquement.
- Vérification de la présence de la colonne (`frappe.db.has_column`) pour ne pas casser un site où `article` ne serait pas installée.

---

## [1.6.2] - 2026-06-22

### Recherche liste Article déléguée à l'app article

- `item_list.js` : suppression de la recherche multi-mots sur le Nom et du filtrage par colonne (désormais gérés par `article/item_list.js`). Ne conserve plus que le tri global par défaut (ID décroissant).

---

## [1.6.1] - 2026-06-12

### Désactivation du filtre-colonne au clic dans les listes

- `ui_defaults.js` : suppression du comportement natif Frappe « clic sur une cellule → filtre automatique » via deux mécanismes : (1) CSS `pointer-events: none` sur `.filterable` (neutralise hover underline, curseur pointeur et clic) ; (2) monkey-patch de `ListView.prototype.setup_filterable` en no-op. Le lien Titre conserve son comportement (ouvre le formulaire) mais perd son soulignement au survol (`.list-subject a:hover { text-decoration: none }`).

---

## [1.6.0] - 2026-06-11

### Exception barre latérale sur la vue impression

- `ui_defaults.js` : la barre latérale reste masquée par défaut, **sauf sur la vue impression** (route `print/...`). Ajout de `_pg_is_print_view()` ; `_pg_apply()` force l'affichage visuel de `.layout-side-section` sur cette route — sans modifier la préférence stockée `pg_show_sidebar`. Permet de choisir le format d'impression (le sélecteur se trouve dans cette barre).

---

## [1.5.0] - 2026-06-09

### Format des nombres — standard français

- `System Settings.number_format` forcé à `#.###,##` dans `apply_global_params()`
  → tous les nombres s'affichent au format français (`1.292,60`, `120,00`)
  partout : écran, impression, PDF, tous les rapports et apps.

## [1.4.0] - 2026-06-05

### Codes tiers : Client et Fournisseur

- Champ custom `code_tiers` (Data, read-only, `in_list_view`) ajouté sur **Customer** et **Supplier**
- Auto-incrément à la création : `C.######` pour les clients (C000001…), `F.######` pour les fournisseurs (F000001…) via hook `before_insert`
- Champ custom `code_fournisseur` (fetch depuis `supplier.code_tiers`, `in_list_view`) ajouté sur **Purchase Receipt**
- Patch `init_code_tiers` : rétro-remplissage de tous les clients et fournisseurs existants
- Patch `init_code_fournisseur_br` : rétro-remplissage de tous les bons de réception existants

---

## [1.3.0] - 2026-06-03

### Ajouté
- Liste Article : recherche multi-tokens sur "Nom de l'article" (tokens dans n'importe quel ordre)
- Liste Article : tri par défaut ID décroissant, réinitialisé au reload et au bouton Refresh
- Champs custom read-only sur Item pour les colonnes de liste :
  - `stock_depot`, `stock_garage`, `stock_principal` — stock par magasin
  - `prix_vente_standard`, `prix_vente2`, `prix_vente3` — prix de vente par liste
  - `dernier_prix_achat_ttc` — dernier prix d'achat TTC (depuis le dernier BR validé)
- Mise à jour en temps réel via `doc_events` sur Purchase Receipt, Delivery Note, Stock Entry, Purchase Invoice, Sales Invoice, Stock Reconciliation et Item Price

---

## [1.2.3] - 2026-06-03

### Corrigé

- Barre latérale toujours cachée par défaut, y compris pour les documents existants (Brouillon, Validé, Annulé) et après un rechargement de page
- Cause : le CSS natif `no-list-sidebar` de Frappe v15 ne couvre que les pages `List/` ; pour les formulaires, Frappe applique un `display` inline via `sidebar_wrapper.toggle()` qui ignorait notre classe
- Fix : injection CSS `body.pg-no-sidebar .layout-side-section { display: none !important }` + écoute des événements `toggleSidebar` / `toggleListSidebar` déclenchés par les boutons toggle de Frappe ; `pg_show_sidebar` réinitialisé à `false` à chaque rechargement du desk

---

## [1.2.2] - 2026-05-28

### Suppression du flash « Espace de Travail » au chargement de la page Workspaces

Frappe posait un titre générique `__("Workspace")` (= « Espace de Travail » en français) sur la page Workspaces à la création via `make_app_page` (page.js l.119), puis le remplaçait par le nom de la workspace courante (~1 s plus tard, via `workspace.js` l.329 : `this.page.set_title(__(page.name))`). Résultat : un flash visible « Espace de Travail » → « Accueil » à chaque ouverture du desk.

Fix : dans `ui_defaults.js`, un wrapper sur `frappe.standard_pages.Workspaces` intercepte temporairement `frappe.ui.make_app_page` lors de la création de la page Workspaces et force `opts.title = ""`. Comme la ligne 119 de `page.js` saute le rendu si `title` est falsy (`if (this.title) this.set_title(this.title)`), rien n'est rendu pendant le chargement. Le `set_title(__(page.name))` ultérieur affiche directement « Accueil ».

Le wrapper utilise `Object.defineProperty` avec un setter pour couvrir les deux ordres de chargement possibles (notre script avant ou après `workspace.js`).

#### Effet secondaire

L'onglet du navigateur reste brièvement vide avant de devenir « Accueil » (au lieu d'afficher « Espace de Travail » puis « Accueil »). Acceptable.

#### Fichiers

- **`public/js/ui_defaults.js`** : wrapper sur `frappe.standard_pages.Workspaces`

---

## [1.2.1] - 2026-05-26

### Affichage du nom article dans les champs lien

- **`install.py`** : active `show_title_field_in_link = 1` sur le DocType `Item` — Frappe affiche désormais `item_name` (nom article) à la place du code dans tous les champs lien vers Item (grilles BL, commandes, factures, etc.), aussi bien dans l'input après sélection que dans la vue compacte des lignes. Idempotent : réappliqué à chaque `bench migrate`.

---

## [1.2.0] - 2026-05-25

### TVA

- **Suppression du template 10%** : `Morroco VAT 10% - AMA` supprimé (Sales + Purchase) — seule la TVA 20% reste
- **Prix TTC par défaut** : `included_in_print_rate = 1` activé sur `Morroco VAT 20% - AMA` (Sales + Purchase) — le prix saisi est désormais traité comme TTC, le HT est rétrocal culé automatiquement

---

## [1.1.0] - 2026-05-25

### Naming Series Articles

- **Naming series activée** : `Stock Settings.item_naming_by = "Naming Series"` (via `set_single_value` + `set_default`)
- **Format numérique pur** : série `######` → premier article `000001`
- **Property Setters** : `item_code` masqué, `naming_series` affiché (via `set_by_naming_series`)

### Interface utilisateur

- **Plein écran par défaut** : `localStorage.container_fullwidth = "true"` à chaque chargement du bureau
- **Barre latérale cachée par défaut** : `localStorage.show_sidebar = "false"` + listener `page-change` pour réappliquer l'état sur chaque navigation SPA

---

## [1.0.0] - 2026-05-24

### Initialisation de l'app

Création de l'app `param_global` dédiée à la gestion des paramètres globaux ERPNext via le mécanisme de custom app (aucune modification manuelle).

### Paramètres Stock

- **Stock négatif activé** : `Stock Settings.allow_negative_stock = 1`
- **UdM par défaut** : `Stock Settings.stock_uom = "Unité"` et mise à jour du default système (`tabDefaultValue`)

### Devises

- **Suppression de toutes les devises** sauf MAD
- **Symbole MAD** : remplacé par un espace `" "` pour ne pas afficher la devise sur les documents (BL, factures, etc.)
