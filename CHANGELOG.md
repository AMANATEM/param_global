# Changelog

Toutes les modifications notables de l'app **Param Global** sont documentées ici.

---

## [1.31.0] - 2026-09-06

### La CI, et le gabarit qui la génère

Nouveau dossier `scripts/` :

- **`ci_tests.yml`** — le gabarit unique du workflow, déployé dans les 21 dépôts.
- **`generer_ci.py`** — l'écrit dans chaque dépôt, en n'y changeant que la ligne `APP:`.
- **`ci_setup_wizard.py`** — l'assistant de configuration du site de test, partagé
  entre la CI et la mise en place manuelle.

⚠️ **La société DOIT être AMANATEM / abrégé AMA.** Laissé à lui-même, le hook
`before_tests` d'erpnext crée « Wind Power LLC » d'abrégé « WP » — or
`garage/sync.py` compare LITTÉRALEMENT à « GARAGE - AMA ». Les entrepôts
s'appelleraient « GARAGE - WP » et toute la détection GARAGE deviendrait
intestable. C'est la raison d'être de `ci_setup_wizard.py`.

### CI GitHub Actions

`.github/workflows/tests.yml` — les tests de l'app tournent désormais à chaque
push et chaque pull request sur `develop`.

⚠️ **PRÉREQUIS MANUEL, une fois par dépôt** : poser le secret `AMANATEM_TOKEN`
(PAT classic, scope `repo`) dans *Settings → Secrets and variables → Actions*.
Sans lui, le job s'arrête au premier `bench get-app` — les autres apps de l'org
sont privées.

⚠️ Le workflow est **généré** depuis `param_global/scripts/ci_tests.yml` et
identique dans les 21 dépôts. Ne pas le modifier ici : modifier le gabarit puis
relancer `python3 apps/param_global/scripts/generer_ci.py`. Le corriger dans un
seul dépôt le ferait diverger des vingt autres — le mécanisme qui a produit dix-
sept copies de `pg_loupes`.

Le job installe **les 21 apps**, pas seulement celle testée : les tests traversent
les frontières d'apps, un sous-ensemble serait faux.

---

## [1.30.0] - 2026-09-06

### Le décor de tests complet, et deux garde-fous élargis à l'assistant de configuration

**Tests.** Le moteur `CycleDeVieTestCase` reçoit les décors partagés du bench :
`creer_client_test` / `creer_fournisseur_test` (avec `mobile_no`, exigé par l'app
`client` à la création), `creer_article_test`, `creer_entrepot_test`, `poser_stock`
et `vider_table`. S'ajoutent **24 tests propres à cette app** : le verrou
chronologique (`test_controle_date.py`) et le verrou administrateur
(`test_verrou.py`), plus l'outil `tests/utils.py`.

⚠️ **`utilisateur_reel()` baisse `frappe.flags.in_test` ET quitte `Administrator`
en même temps.** La moitié des garde-fous du bench sortent d'office sous `in_test`
— c'est la parade qui empêche un `bench migrate` d'échouer — et `Administrator`
passe partout. Sans les DEUX, ces tests s'exécutent et ne prouvent rien.

⚠️ **`frappe.copy_doc()` prend `ignore_no_copy=False`.** Son défaut est `True` : il
CONSERVE les champs `no_copy`, ce que le bouton « Nouv. version » ne fait jamais.
Sur un `Retour`, `delivery_note` était recopié et pointait vers un document annulé
— l'insertion échouait sur « Cannot link cancelled document ».

⚠️ **`vider_table()` existe parce que le rollback NE TIENT PAS partout** :
`bon_livraison/delivery_note.py` et `remise_bancaire/paiement_bl.py` appellent
`frappe.db.commit()`, ce qui valide la transaction entière. 21 `Pointage Garage`
résiduels faisaient répondre « NON OK » à `statut_garage()` quoi qu'on fasse.

**Les entrepôts de test portent les noms RÉELS de la production** (`GARAGE - AMA`,
`PRINCIPAL - AMA`, `DEPOT - AMA`) : `garage/sync.py` les compare littéralement, un
nom de test rendrait la détection GARAGE intestable.

### `in_setup_wizard` ajouté à `controle_date._traitement_systeme()`

L'assistant de configuration ERPNext crée lui aussi des documents sous
`Administrator`, hors de toute interaction humaine. Le drapeau existe
(`frappe/desk/page/setup_wizard/setup_wizard.py`) mais n'était pas testé.

### L'UOM « Unité » est créée si elle manque

`apply_global_params()` désignait « Unité » comme unité par défaut **sans garantir
son existence**. Sur `amanatem.local` et en production elle existe par accident
historique : l'assistant y a tourné en français et a traduit `_("Unit")` — les deux
bases n'ont d'ailleurs AUCUNE UOM « Unit », ce qui le prouve. Un site neuf n'a pas
cette chance : ses UOM sortent en anglais et l'installation de `bon_livraison` meurt
sur « Could not find Default Unit of Measure: Unité ».

On CRÉE plutôt qu'on ne renomme « Unit » : un `rename_doc` réécrirait toutes les
lignes de documents référençant l'UOM, une création est un ajout pur. Sur les bases
existantes, le `if` sort sans rien écrire — vérifié en production (« Unité » = 1,
« Unit » = 0, 239 UOM).

---

## [1.29.0] - 2026-09-06

### Le moteur de tests de cycle de vie

Nouveau module **`param_global/tests/base.py`** : `CycleDeVieTestCase`, qui déroule
le parcours réel d'un document soumissionnable — créer, enregistrer, valider,
annuler, « Nouv. version », enregistrer — pour n'importe quel doctype du bench.

Écrit **une seule fois** ici plutôt que recopié dans chaque app, pour la même
raison que `pg_loupes` et `controle_date` : une vérification ajoutée au moteur
profite aux treize doctypes, ajoutée dans une copie elle ne profite à personne.
Contrepartie assumée — une modification de ce fichier peut casser les tests des
autres apps, et leur CI ne le verra qu'à leur prochain push.

Le moteur vérifie à chaque cycle que `param_global` pose puis vide bien
`date_validation`, et contrôle les deux conditions du standard « DocTypes
soumissionnables » : présence du champ `amended_from`, et au moins un rôle avec la
permission `amend`. ⚠️ Ce second point est contrôlé sur les **métadonnées** et non
en cliquant, parce que les tests tournent sous `Administrator` — qui court-circuite
`has_permission()`. Un `amend: 1` manquant laisserait donc passer le cycle tout en
privant les vrais utilisateurs du bouton, exactement le défaut qu'avait
`Paiement BL` jusqu'en 0.51.1.

Ajoute aussi les décors partagés `creer_client_test()` et `creer_fournisseur_test()`
— Customer et Supplier sont des doctypes ERPNext, mais leur `code_tiers` est posé
par `param_global.tiers`, c'est donc bien cette app qui sait les fabriquer.

⚠️ **`frappe.copy_doc()` n'efface PAS `docstatus` en mode test**
(`if not local.flags.in_test: fields_to_clear.append("docstatus")`). La copie d'un
document annulé arrive donc avec `docstatus = 2` et `insert()` la refuse. Le moteur
reproduit le vrai geste du desk (`Form.amend_doc` → `newdoc.docstatus = 0`).

⚠️ **`base.py` ne commence pas par `test_`** : il n'est donc jamais collecté par le
lanceur, et `run-tests --app param_global` renvoie « Ran 0 tests ». C'est voulu —
le moteur est exercé par les apps qui l'utilisent. Les tests propres à cette app
(fonctions pures : arrondis, bornes de dates, verrou chronologique) restent à écrire.

---

## [1.28.0] - 2026-09-06

### Le moteur de loupes de colonne, mutualisé pour tout le bench

Nouveau bundle desk-wide **`pg_loupes.bundle.js`** (13ᵉ entrée d'`app_include_js`).
Le moteur de recherche par colonne existait en **17 exemplaires** recopiés d'app en
app ; les copies avaient divergé — quatre étaient restées à une version des débuts —
et c'est ce mécanisme qui avait produit la faute de frappe `"hafssa"` restée dans
une seule d'entre elles. Bilan : **11 640 → 4 726 lignes** dans les 17 fichiers,
pour un moteur de 712 lignes, soit **6 202 lignes nettes en moins**.

L'app déclare ses colonnes, le moteur fait le reste :

```js
const loupes = frappe.loupes.installer("Delivery Note", {
    text: [...], number: [...], date: [...], status: ["status"],
    order_by: "...", mise_en_page: { meta_droite: 150, subject_flex: 3.5 },
});
```

Il expose `listview.pg_loupes.effacer()` et `.rafraichir()` : la règle du *quand*
effacer reste à l'app, chacune ayant la sienne.

### La loupe est AUTOMATIQUE

Toute colonne affichée en reçoit une, sans déclaration : c'est le `fieldtype` qui
décide (`Currency`/`Float`/`Int`/`Percent` → nombre, `Date` → date, `Check` →
oui/non, `Data`/`Link`/`Select`/`Text` → texte). Une déclaration explicite prime,
et porte les cas particuliers. `auto: false` et `exclure: [...]` permettent de s'en
retirer.

⚠️ `Datetime` et `Time` sont **hors** de l'inférence : notre analyse de date produit
un `= "2026-12-20"`, qui sur un Datetime ne trouve que les documents posés à minuit
pile — un filtre qui paraît marcher et ment.

⚠️ Les champs virtuels et les types sans valeur en base (HTML, Image, Bouton, Table)
sont écartés : aucun filtre SQL ne peut porter dessus.

⚠️ La colonne Statut n'est inférée que sur un doctype **soumissionnable**, dont le
barème `docstatus` a un sens. Ailleurs l'indicateur est maison et l'app doit
déclarer `config.statut`.

### Un nombre seul est un PRÉFIXE, plus un intervalle

« 29 » ramène 29, mais aussi 290, 293,70 et 2 988 — c'est ainsi qu'on cherche un
montant dont on ne se rappelle que le début. Techniquement un `LIKE '29%'` :
MariaDB convertit le DECIMAL(21,9) en chaîne, la partie entière est donc en tête.
Les opérateurs et les intervalles ne changent pas (`>1000`, `<500`, `100-500`).

⚠️ Contrepartie assumée : un `LIKE` n'utilise pas l'index de la colonne. Sans
conséquence à l'échelle de nos listes, qui ramènent 20 lignes à la fois.

### Trois états visuels, et ils ne peuvent plus mentir

Champ vide → cadre **gris** ; saisie valide → cadre **vert émeraude**, fond teinté,
valeur en gras — le seul repère qui dise d'un coup d'œil sur quelles colonnes porte
la recherche ; saisie fausse → cadre **rouge**.

⚠️ **RÈGLE ABSOLUE : une saisie que la liste ne sait pas honorer donne ZÉRO
résultat, jamais la liste entière.** Le moteur pousse la sentinelle
`["name", "in", ["__aucun__"]]`. Taper « annule » sur la colonne Statut de
l'Article — dont le barème est Activé/Désactivé — laissait auparavant un cadre vert
et n'envoyait **aucun** filtre : les 1 000+ articles s'affichaient comme si la liste
était filtrée.

⚠️ Quand la liste est vide et que l'en-tête est conservé (pour que les loupes
restent atteignables), la zone de résultats reçoit la classe `pg-vide`, qui annule
le `min-height` plein écran de Frappe. Sans elle le message « aucun résultat »
partait ~900 px plus bas, hors de l'écran.

⚠️ **Aucune transition CSS** sur ces trois états, et `transition: none !important` —
une règle de Frappe pose `transition: all`, or Chrome fige les animations d'un
onglet en arrière-plan : le cadre restait bloqué à mi-course, rouge alors que la
saisie était redevenue valide.

### Le moteur style la loupe, jamais la mise en page

Les anciens blocs CSS mêlaient les deux, et chaque liste avait sa propre
répartition : huit à `subject_flex 3.5`, cinq sans aucune règle, l'Article et le
Paiement BL en largeurs fixes avec défilement horizontal. Chaque liste déclare donc
la sienne via `config.mise_en_page`, et **rien n'est émis quand elle se tait**.

### Autres

- un champ laissé **vide se referme au blur**, un champ qui porte du texte reste
  ouvert ;
- les statuts « valide » / « annule » **sans accent** fonctionnent partout (2 listes
  sur 17 auparavant) ;
- l'en-tête d'origine est nettoyé de ses icônes avant d'être mémorisé, sinon une
  colonne pouvait se retrouver avec deux loupes.

## [1.27.1] - 2026-09-06

### « Validé le » retrouve son ancrage par défaut sur les deux paiements

`Paiement BL` était ancré sur « Heure » et `Paiement BR` sur son défaut, faute de
champ `cree_par` sur ces deux doctypes. Ils en ont reçu un le 2026-09-06 — qui
est justement l'ancrage par défaut de ce module. L'exception est donc retirée :
la garder ferait se disputer la même place à deux champs, l'ordre dépendant alors
de celui des hooks.

Ordre obtenu : `date · heure · cree_par · date_validation` sur le Paiement BL,
`date · cree_par · date_validation` sur le Paiement BR.

## [1.27.0] - 2026-09-05

### Le verrou chronologique déménage ici, et couvre les neuf documents

`controle_date.py` vivait dans `bon_livraison`, où il ne servait que les trois
documents de la vente. La direction a décidé d'appliquer la même règle aux six
documents restants — Bon de Réception, Bon E/S, Paiement fournisseur, Écriture de
Stock, Réconciliation de Stock, Remise Bancaire. L'y laisser aurait obligé quatre
apps à dépendre de `bon_livraison`, ce que l'architecture du bench interdit : le
module est donc transverse, comme `verrou.py` et `validation.py`.

Un employé ne peut donc plus annuler un Bon de Réception de 2022 ni une Écriture de
Stock de juin — gestes qui étaient jusqu'ici parfaitement ouverts, alors qu'ils
déplacent du stock et des soldes fournisseurs rétroactivement.

Le volet client devient un bundle desk-wide, `pg_controle_date.bundle.js`, qui
branche lui-même les six nouveaux documents. Les trois documents de vente
continuent d'appeler le helper depuis leur propre formulaire — les y ajouter
afficherait la confirmation deux fois.

⚠️ Les libellés arabes des six documents ajoutés ont été écrits sur le modèle des
trois premiers (« سند » + complément) et méritent une relecture par un lecteur
arabophone : c'est le texte que voit quelqu'un à qui l'on refuse un geste.

⚠️ Le Bon de Réception fait exception à la **validation** : le bon d'un fournisseur
remonte parfois avec quelques jours de retard, la validation antidatée y est donc
libre. Son annulation reste verrouillée.

### Fin des filtres dupliqués dans les listes

`pg_init_doctype.bundle.js` : un doctype n'est plus initialisé qu'une fois par
session.

`frappe.model.init_doctype()` ré-exécute le fichier `*_list.js` de l'app
propriétaire (`new Function(meta.__list_js)()`), et `with_doctype()` ne
court-circuite que si la meta est **déjà** arrivée : deux appels lancés avant la
première réponse partaient tous les deux. Comme nos quinze fichiers de liste
s'enchaînent sur leur propre `settings.onload`, la liste s'ouvrait ensuite avec ses
filtres Période / Date / Mode en double, voire en triple.

On ne corrige pas les quinze fichiers un par un : on rend vraie l'hypothèse qu'ils
font tous, à savoir être évalués une seule fois. Les listes écrites plus tard en
héritent.

⚠️ Contrepartie assumée : modifier un doctype en cours de session ne recharge plus
le JS de sa liste avant le prochain rafraîchissement de la page.

## [1.26.1] - 2026-09-01

### Placement de « Validé le » sur Paiement BL

Le champ « Validé le » suit désormais l'heure dans le formulaire Paiement BL.
Il reste invisible sur les brouillons et absent de la liste par défaut, tout en
restant disponible comme colonne à afficher ultérieurement.

## [1.26.0] - 2026-08-28

### « Validé le » — la date et l'heure de validation, sur les treize documents

Nouveau module `validation.py` : un champ `date_validation` (Datetime, « Validé le ») posé sur **les treize doctypes soumissionnables du bench**, horodaté en `on_submit` et vidé en `on_cancel`.

Le besoin de départ était de savoir *quand* un document a été validé. La première piste — faire porter cette information à `posting_time` — a été écartée : ce champ est la date de **comptabilisation**, il pilote le Stock Ledger et la valorisation, et il est éditable. Un document peut être saisi un jour et validé un autre ; mêler les deux aurait fait porter un risque comptable à un besoin d'affichage.

Le champ vit dans `param_global` et non dans chacune des neuf apps concernées : il ne relève d'aucun domaine, et une définition unique évite que deux apps se la réécrivent à chaque migration.

**Le champ ne s'affiche qu'une fois le document validé** (`depends_on: eval:doc.date_validation`) : vide sur un brouillon, il reste invisible. Il n'est **pas** une colonne de liste par défaut (`in_list_view: 0`), mais reste proposé dans « Ajouter une colonne » le jour où on en a besoin. Il n'est pas imprimé.

⚠️ **Rien n'est rétro-rempli, volontairement.** `tabVersion` garde pourtant la trace du passage `docstatus 0 → 1` pour 99,7 % des BL — mais **94 % de ces traces datent des fenêtres d'import Omag** (09/07 → 06/08/2026) : ce sont des heures d'IMPORT, pas de validation. Un champ vide sur l'historique dit la vérité : ces documents n'ont jamais été validés dans ERPNext, ils y sont entrés déjà validés.

⚠️ **`param_global` devient propriétaire du champ**, que `bon_es` portait déjà pour les seuls Bons E/S sous le même nom. Sans cette reprise, les deux apps se seraient réécrit sa définition à chaque `bench migrate`, selon l'ordre des hooks — le piège déjà connu sur les grilles. Nécessite `bon_es` 0.2.0, qui cesse de le définir et de le remplir.

⚠️ **`update_modified=False` à l'écriture** : `modified` est le tri par défaut des listes Frappe, le remuer ferait remonter en tête tout document validé.

### Placement du champ, et suppression de la mention de fuseau

`ANCRAGES_SPECIFIQUES` fixe la position au cas par cas — sous « Client » sur le Bon de Livraison, en 2ᵉ colonne sur le Devis et le Bon de Commande. Partout ailleurs le champ suit « Créé par », les deux informations se lisant ensemble.

⚠️ **C'est le seul endroit où se décide `insert_after`.** Une app qui le réécrirait dans son propre `after_migrate` entrerait en bagarre avec celui-ci à chaque migration, le dernier hook exécuté l'emportant.

La mention « Africa/Casablanca » qu'affichait le champ disparaît. Elle n'est pas du texte en dur : le contrôle Datetime de Frappe injecte le fuseau du site en **description** du champ, sauf si `hide_timezone` est vrai.

⚠️ `hide_timezone` **n'existe pas comme colonne de « Custom Field »** — le mettre dans la définition du champ serait ignoré en silence. Il passe par un Property Setter : `Meta.apply_property_setters()` pose la propriété sur le docfield même quand elle ne fait pas partie du schéma.

## [1.25.0] - 2026-08-27

### Les nombres au format français jusque dans les dialogues écrits à la main

`pg_nombres` reconnaissait un champ numérique à son `fieldtype`, lu sur le contrôle Frappe qui l'enveloppe. Un `<input>` posé à la main dans un dialogue n'en a pas : il passait au travers des deux volets de saisie, **en silence** — pavé numérique inutilisable, lettres acceptées sans broncher.

- Nouvelle classe d'adhésion **`pg-numerique`** : une app la pose sur son input brut, et le champ entre dans le volet 1 (point → virgule) et le volet 3 (refus des lettres).
- Le test est extrait dans `est_numerique()`, **appelé par les deux volets**. Ils doivent viser exactement le même ensemble de champs : viser large d'un côté et étroit de l'autre bloquerait des caractères là où le point n'est pas converti, ou l'inverse.

⚠️ **Un champ marqué doit être en `type="text"`.** Un `type="number"` REFUSE la virgule — `.value` revient vide — donc les deux volets n'auraient rien où écrire. On y perd les flèches ▲▼ et l'attribut `min`, à reprendre côté app.

Premier utilisateur : le tableau « Prix de vente » de `bon_reception` 0.36.0.

**Fichiers touchés** — `public/js/pg_nombres.bundle.js`

## [1.24.0] - 2026-08-24

### Le curseur arrive toujours, et il arrive vite

Nouveau bundle `pg_focus_grille.bundle.js`. On ne programme plus un `focus()` à l'aveugle derrière un `setTimeout` : on **déclare une intention**, et un moteur la maintient jusqu'à ce qu'elle soit réellement satisfaite.

- Boucle à ~16 ms au lieu d'une cascade de délais fixes (500 + 150 + 40 ms sur le trajet Client → Article).
- `MutationObserver` sur la cible : un re-rendu **ré-arme** l'intention au lieu de l'emporter. Peu importe que le serveur réponde en 200 ms ou en 4 s.
- Arrivée **vérifiée** : atteinte seulement si `document.activeElement` est bien la cible pendant 3 tours sans mutation. Un focus posé puis balayé n'est plus compté comme un succès.
- **Cicatrisation automatique**, sans modification d'app : un champ de grille qui perd le curseur parce qu'un re-rendu l'a détruit le récupère. Couvre les sept grilles du bench.
- Le geste de l'utilisateur prime : un clic ailleurs, Échap ou Tab abandonnent la reconquête.
- L'échec n'est plus silencieux : passé l'échéance, une trace console dit ce qui était visé et ce qui a le focus à la place.

`exiger_champ({frm, champ})` vise un champ ordinaire du formulaire. À l'ouverture d'un nouveau document, Frappe place son propre curseur sur le **premier champ** — « Séries », pas le tiers (`form.js`, `focus_on_first_input`) ; il s'abstient dès que le curseur est déjà dans le formulaire, donc arriver tôt sur le tiers le neutralise par son propre garde-fou. Les délais fixes d'avant laissaient au contraire Frappe gagner la course.

⚠️ **`requestAnimationFrame` ne suffit pas seul** : il est gelé dans un onglet en arrière-plan (mesuré : 1 frame en 300 ms). La boucle est doublée d'un `setTimeout`, et l'échéance ne court pas pendant que l'onglet est caché — avec un **plafond de vie absolu** de 60 s, sans lequel une intention impossible à satisfaire ne se terminait jamais.

**Fichiers touchés** — `public/js/pg_focus_grille.bundle.js` (nouveau), `hooks.py`

## [1.23.0] - 2026-08-24

### La liste Client / Fournisseur s'affiche toujours en « Code — Nom »

Le dropdown d'un champ tiers sortait tantôt en « C000001 — PARTICULIER », tantôt au format standard de Frappe « Nom, Groupe client, Région ». Environ une fois sur deux, et de façon **stable pour toute la vie du document** — pas un clignotement. Deux mécanismes s'additionnaient :

1. **`get_query` est un emplacement « le dernier qui écrit gagne »** — `frm.set_query()` se réduit à `fields_dict[champ].get_query = q`. Nos affichages tiers y écrivaient leur requête, les contrôleurs ERPNext la leur. Sur le Devis, `set_dynamic_field_label` la remettait carrément à `null`.
2. **Le cache de `link.js` figeait ensuite le perdant** — les résultats sont mémorisés dans `$input.cache[doctype][terme]`, **sans que la requête entre dans la clé**. La liste qui gagnait la toute première ouverture s'imposait jusqu'à la fermeture du document.

Le correctif précédent réécrivait `get_query` dans un `setTimeout(…, 0)` puis au focus : il tentait de **gagner la course en écrivant plus tard**. Une course ne se gagne pas, elle se supprime. `pg_recherche_tiers.bundle.js` impose donc la requête dans `ControlLink.set_custom_query`, dernier point de passage avant l'appel serveur, une fois `get_query` déjà consulté. Vérifié en détruisant `get_query` de quatre façons (écrasé, mis à `null`, supprimé) : la requête part inchangée.

⚠️ **Ne jamais vider le cache depuis `set_custom_query`.** `link.js` crée `cache[doctype]` juste avant d'appeler cette méthode et son callback y écrit au retour du serveur ; remplacer `$input.cache` y fait lever un `TypeError` **avant** la ligne qui alimente `awesomplete.list` — plus aucune liste ne s'affiche, sur tous les champs tiers à la fois. Essayé, panne immédiate, correctif retiré le jour même. Le forçage de requête se suffit à lui-même.

**Fichiers touchés** — `public/js/pg_recherche_tiers.bundle.js` (nouveau), `hooks.py`

## [1.22.0] - 2026-08-22

### Le tri des listes de recherche d'articles, la file des Entrée, et les lettres refusées dans les champs numériques

**Tri de la liste d'articles par clic sur un titre de colonne** (`public/js/pg_tri_dropdown.bundle.js`) — 1er clic descendant, 2e ascendant, flèche affichée. Le même dropdown étant dupliqué **sept fois** (BL, Retour, Devis, BC, BR, Écriture de Stock, Réconciliation), le tri est posé une seule fois ici : il reconnaît les en-têtes à leur suffixe de classe commun et trie sur l'indice de colonne, sans rien savoir du domaine.

⚠️ **Le tri porte sur TOUT le catalogue filtré, pas sur les lignes affichées** (`recherche_articles.py`). Un tri purement local aurait donné une réponse **fausse** : demander « les articles en stock au garage » sur une recherche qui en compte 255 n'aurait montré que les rares en stock parmi les 70 premiers codes. La colonne et le sens partent donc dans la requête, le `ORDER BY` se fait en SQL **avant le `LIMIT`**, et la fenêtre passe de **20 à 70 résultats**. Les six fonctions `recherche_article` des apps y sont branchées ; les jointures (prix, stocks, TVA) ne sont posées que si l'on trie dessus, donc la frappe courante garde exactement la requête d'avant (50 ms sans tri, ~100 ms avec).

⚠️ **« Dern. achat » ne se calcule pas pareil d'une app à l'autre** et le tri doit porter sur la valeur **affichée** : `bon_livraison` montre `dernier_prix_achat_ttc`, les cinq autres recalculent `last_purchase_rate × (1 + TVA)`. La multiplication n'étant pas monotone — 100 HT à 20 % passe devant 110 HT à 0 % —, trier sur le HT aurait réordonné la colonne sur un chiffre que personne ne voit.

⚠️ **Le tri ne vaut que pour la recherche en cours** : effacer le champ et chercher un autre article le remet à zéro, flèche comprise, et la requête repart sans tri.

**Aucune Entrée perdue dans les grilles** (`public/js/pg_grille_entree.bundle.js`). La navigation Article → Quantité → Prix → ligne suivante déplace le curseur dans un `setTimeout` de 150 à 250 ms ; une 2ᵉ Entrée frappée dans cet intervalle retombait sur le **même** champ et rejouait la même étape — le curseur s'arrêtait sur le Prix, la touche semblait « ne pas prendre ». Elle est désormais mise en file puis rejouée sur le champ qui reçoit le curseur : une Entrée = une étape, quelle que soit la vitesse de frappe. Posé en phase de capture sur `document`, seule position qui précède les gestionnaires des apps.

**Les lettres n'entrent plus dans un champ numérique** (`pg_nombres.bundle.js`, volet 3). Taper « abc » dans une Quantité passait sans broncher, et Entrée écrivait `0` en base — sans message, sans trace. La touche est refusée à la frappe dans tout champ `Currency` / `Float` / `Percent` / `Int` ; chiffres, virgule, point et signe moins restent acceptés, les touches de contrôle et les raccourcis Ctrl/Cmd intacts.

**Fichiers touchés** — `recherche_articles.py` (nouveau), `public/js/pg_tri_dropdown.bundle.js` (nouveau), `public/js/pg_grille_entree.bundle.js` (nouveau), `public/js/pg_nombres.bundle.js`, `hooks.py`

## [1.21.0] - 2026-08-20

### Repère d'environnement — le desk de DEV ne ressemble plus à la production

La VM de développement est un clone de la prod : mêmes données, même interface, mêmes identifiants. Rien à l'écran ne disait sur laquelle des deux on travaillait — alors qu'une saisie faite en dev est perdue au prochain `bddevprod`, et qu'un geste cru « de test » passé en prod ne se rattrape pas.

Tout site qui n'est **pas** la production affiche désormais une **barre de navigation ambre** portant « DEV — CE N'EST PAS LA PRODUCTION », et un titre d'onglet préfixé `[DEV]` — ce dernier pour distinguer deux onglets ouverts côte à côte sans avoir à cliquer.

⚠️ **La PRODUCTION reste strictement intacte** : ni teinte, ni libellé, ni préfixe de titre. C'est la règle de conception, pas un effet de bord — l'écran des utilisateurs finaux ne doit rien porter de plus.

La bascule est la clé `environnement` de `site_config.json`, exposée dans le bootinfo par `extend_bootinfo`. Ce fichier est le seul qui reste **propre à sa machine** : hors git (donc `git pull` ne le copie pas) et hors du périmètre de `bench restore` (donc `bddevprod` ne le contamine pas), là où le code des apps et la base voyagent tous deux de la DEV vers la PROD.

**Clé absente = production**, donc aucun marquage : rien à configurer sur le serveur de prod, et une machine oubliée s'affiche comme production plutôt que de donner un faux sentiment de sécurité.

Choix de rendu :

* **ambre clair et non fond sombre** — le texte de la navbar reste celui de Frappe, dont le nom d'utilisateur que `pg_ui_defaults` place au centre de cette même barre ; un fond sombre aurait obligé à repeindre les icônes et ce nom, bien au-delà d'un simple repère ;
* **le complément de phrase disparaît sous 768 px** — la navbar d'un téléphone n'a pas la place, et « DEV » seul suffit à alerter ;
* **rien ne sort à l'impression** — un bon de livraison imprimé depuis la dev ne doit pas être barbouillé d'ambre.

Le préfixe de titre passe par `frappe.utils.set_title_prefix`, mécanisme natif que **personne d'autre n'utilise** dans Frappe : le préfixe se réapplique seul à chaque changement de titre, sans patcher quoi que ce soit. Repli manuel au tout premier chargement, où `frappe._original_title` vaut encore `undefined` et ferait échouer le `.replace()` interne.

**Fichiers touchés** — `public/js/pg_environnement.bundle.js` (nouveau), `install.py`, `hooks.py`

## [1.20.0] - 2026-08-18

### Verrou administrateur : mot de passe redemandé pour les écrans d'argent

Nouveau module `verrou.py`, socle partagé par `caisse`, `verification` et `rapport`. Trois zones, chacune avec sa durée : **`caisse` 5 min**, **`encaissements` 5 min**, **`verification` 1 h**. Le délai est **absolu** — il court à partir de la saisie du mot de passe et ne se prolonge pas avec l'activité.

Pourquoi ce module doit exister : `frappe.permissions.has_permission()` commence par `if user == "Administrator": return True`. **Aucun rôle, aucune permission ne peut donc protéger une session Administrator laissée ouverte au comptoir** — et c'est précisément le risque, puisque l'administration travaille sous ce compte et que les 9 comptes du personnel sont tous `System Manager`. Le verrou est donc un état explicite, tenu côté serveur, que chaque endpoint sensible consulte lui-même via `exiger()` ou `est_deverrouille()`. Un contrôle posé uniquement dans le navigateur serait un décor : il suffirait d'appeler la méthode whitelistée à la main.

* État en redis, indexé sur le **`sid` de la session** : déverrouiller au bureau n'ouvre rien sur le poste du comptoir. C'est le TTL de la clé, et lui seul, qui porte l'expiration.
* Mot de passe vérifié contre le compte `Administrator` (`frappe.utils.password.check_password`). **5 essais ratés → 15 min de blocage** : sans ce compteur, un mot de passe se teste en boucle depuis la console du navigateur, le dialogue n'étant qu'un appel whitelisté de plus.
* `appel_direct()` distingue les appels HTTP des appels Python internes — `verification` appelle les fonctions de `caisse` en interne, un garde-fou aveugle casserait la vérification journalière dès que la zone `caisse` est refermée.

Côté desk, `pg_verrou.bundle.js` (chargé desk-wide) apporte `proteger()`, `demander()` et `veiller()`. Ce dernier **referme l'écran à l'expiration sans attendre une navigation** : sans lui, le serveur a beau refuser les nouvelles requêtes, les chiffres déjà affichés restent lisibles indéfiniment.

Le champ de saisie est un **`Data` masqué en CSS** (`-webkit-text-security`) et non un `Password` : Chrome ne propose d'enregistrer un mot de passe, et ne déroule sa liste de comptes, que sur un `<input type="password">`. C'est le seul moyen fiable — `autocomplete="off"` est ignoré par Chrome sur un vrai champ mot de passe. En renfort, `id`/`name` aléatoires (Chrome classe aussi les champs d'après ces attributs) et `data-lpignore`.

**Fichiers touchés** — `verrou.py` (nouveau), `public/js/pg_verrou.bundle.js` (nouveau), `hooks.py`

## [1.19.0] - 2026-08-14

### Grille du Bon de Réception : « Prix » brut et « Remise % » saisissable

L'entrée `Purchase Receipt` de `GRILLES` suit le découpage introduit par `bon_reception` 0.31.0 :

```
Code de l'Article (4) · Quantité (1) · Prix (1) · Prix HT (1) · Remise % (1) · Montant (1) · Entrepôt (1)  = 10
```

Deux échanges à somme nulle, la grille reste donc à 10 :

- `rate` → **`price_list_rate`** : la colonne Prix porte désormais le prix **brut** fournisseur. `rate` (prix net) sort de la grille — c'est le Montant qui le donne.
- `discount_amount` → **`discount_percentage`** : l'ancienne colonne était un champ **calculé** (`price_list_rate − rate`) que la saisie ne pilotait pas, au point d'afficher des remises négatives.

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
