# Changelog

Toutes les modifications notables de l'app **Param Global** sont documentées ici.

---

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
