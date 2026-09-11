// « Article en double » — les sept grilles du bench.
//
// Le cas réel : sur un document d'une trentaine de lignes, on ressaisit un
// article déjà présent plus haut sans le voir. Ce n'est PAS forcément une
// erreur — deux lignes du même article à deux prix ou deux remises différents
// sont parfaitement légitimes — donc on ne tranche pas à la place de
// l'utilisateur : on lui pose la question, et il répond Oui ou Non.
//
// **Non retire l'article de la ligne** et rend le curseur à la cellule, prêt
// pour une autre saisie. Si la ligne portait déjà un autre article (on était en
// train de le CORRIGER), c'est l'article précédent qui revient — et non une
// ligne vidée : annuler une correction doit ramener l'état d'avant, pas un
// troisième état que personne n'a demandé.
//
// ⚠️ CE MOTEUR VIT ICI ET NULLE PART AILLEURS. Sept formulaires le partagent ;
// le recopier dans chaque app rejouerait exactement ce qui est arrivé aux
// loupes de colonne — dix-sept copies divergentes, dont une portant une faute
// de frappe que personne n'a vue pendant des mois (cf. pg_loupes.bundle.js).
//
// Bilingue français + arabe, comme les refus de `controle_date` : une partie des
// utilisateurs du comptoir lit mieux l'arabe, et c'est à eux que la question
// s'adresse pendant la saisie.

frappe.provide("param_global.doublon_article");

(function () {
	// L'article support des lignes manuelles (cf. param_global/article_manuel.py).
	//
	// ⚠️ Il est EXCLU de la détection, et ce n'est pas un détail : toutes les
	// lignes manuelles d'un document portent ce même code en base, le texte réel
	// vivant dans `designation_manuelle`. Sans cette exclusion, deux lignes
	// manuelles sans aucun rapport — « main-d'œuvre » et « transport » — se
	// signaleraient l'une l'autre comme doublons, sur chaque document.
	const ARTICLE_MANUEL = "I00001";

	// Les sept tables enfants du bench, toutes sous le champ `items` de leur
	// parent (vérifié sur les sept JSON le 2026-09-11).
	const TABLES = [
		"Delivery Note Item", // Bon de Livraison
		"Retour Item", // Retour
		"Quotation Item", // Devis
		"Purchase Order Item", // Bon de Commande
		"Purchase Receipt Item", // Bon de Réception (et Bon E/S)
		"Stock Entry Detail", // Écriture de Stock
		"Stock Reconciliation Item", // Réconciliation de Stock
	];

	const CHAMP_TABLE = "items";

	function echapper(texte) {
		return frappe.utils.escape_html(String(texte === undefined ? "" : texte));
	}

	// Le libellé de l'article, tel qu'il est RÉELLEMENT affiché dans la grille :
	// « 015176 — TUBE PVC 32 ». C'est ce que l'utilisateur doit reconnaître d'un
	// coup d'œil ; un code nu ne lui dirait rien.
	//
	// ⚠️ On lit le nom sur la ligne DÉJÀ EN PLACE, jamais sur celle qu'on vient
	// de saisir : `item_name` y arrive par un fetch asynchrone et n'est pas
	// encore rempli au moment où l'événement `item_code` se déclenche.
	function designation(ligne_existante, code) {
		const nom = (ligne_existante && ligne_existante.item_name) || "";
		if (!nom || nom === code) return `<b>${echapper(code)}</b>`;
		return `<b>${echapper(code)} — ${echapper(nom)}</b>`;
	}

	function corps(ligne_existante, code, idx_existante, nb_total) {
		const article = designation(ligne_existante, code);

		// ⚠️ La désignation est isolée en LTR dans les DEUX langues. Un code et un
		// libellé latins posés dans un paragraphe arabe sont réordonnés par
		// l'algorithme bidirectionnel : « 000001 — INTERRUPTEUR … INGELEC » se
		// lisait « INTERRUPTEUR … JADE — 000001 ⚠️ INGELEC », l'emoji atterrissant
		// au milieu du nom. Même piège que les dates de `controle_date.py::_ltr`,
		// mais sur un bloc entier. `text-align:right` garde l'alignement arabe.
		const bloc_article = (rtl) =>
			`<div dir="ltr" style="font-size:1.08em;margin-bottom:.5em` +
			`${rtl ? ";text-align:right" : ""}">⚠️ ${article}</div>`;

		const total_fr =
			nb_total > 2 ? ` Il apparaît sur <b>${nb_total}</b> lignes en tout.` : "";

		// ⚠️ En arabe, le nombre ne se colle PAS au mot « سطر » : l'accord y est à
		// trois formes (singulier, DUEL pour 2, pluriel de 3 à 10), et « 2 أسطر »
		// — ce qu'écrivait la première version — est fautif, c'est « سطرين » qu'il
		// faut. Plutôt que de coder cet accord, on énonce le nombre après deux
		// points : la tournure est juste quel que soit le chiffre.
		const total_ar = nb_total > 2 ? ` عدد الأسطر التي يظهر فيها: ${nb_total}.` : "";

		const fr =
			bloc_article(false) +
			`<div>Cet article est <b>déjà saisi</b> à la ligne <b>${idx_existante}</b>.` +
			`${total_fr}</div>` +
			`<div style="margin-top:.6em;font-weight:600">Voulez-vous l&rsquo;ajouter ` +
			`quand même&nbsp;?</div>`;

		const ar =
			bloc_article(true) +
			`<div>هذا المنتج <b>مُدرَج مسبقاً</b> في السطر <b>${idx_existante}</b>.` +
			`${total_ar}</div>` +
			`<div style="margin-top:.6em;font-weight:600">هل تريد إضافته رغم ذلك؟</div>`;

		return (
			`<div>${fr}</div>` +
			`<div dir="rtl" lang="ar" style="text-align:right;margin-top:.8em;` +
			`padding-top:.8em;border-top:1px solid rgba(0,0,0,.15)">${ar}</div>`
		);
	}

	// Les lignes du document qui portent déjà ce code, hors la ligne courante.
	function doublons(frm, code, nom_ligne_courante) {
		return (frm.doc[CHAMP_TABLE] || []).filter(
			(ligne) => ligne.item_code === code && ligne.name !== nom_ligne_courante
		);
	}

	// « Non » : on remet la ligne dans l'état d'AVANT la saisie, puis on rend le
	// curseur à la cellule Article.
	function annuler_saisie(frm, cdt, cdn, precedent) {
		const ligne = locals[cdt] && locals[cdt][cdn];
		if (!ligne) return;

		// ⚠️ Sans ce drapeau, réécrire `item_code` relance NOTRE propre handler :
		// si l'article précédent était lui aussi un doublon (correction d'une
		// ligne déjà en double), la question se reposerait en boucle.
		ligne.__pg_ignorer = true;
		ligne.__pg_precedent = precedent || "";

		frappe.model.set_value(cdt, cdn, "item_code", precedent || "").then(function () {
			const l = locals[cdt] && locals[cdt][cdn];
			if (l) l.__pg_ignorer = false;

			// ⚠️ ERPNext ne nettoie PAS les champs dépendants quand `item_code` est
			// vidé : le libellé et le prix de l'article refusé restaient affichés
			// sur une ligne pourtant vide — on lisait « 35,36 » en face d'un
			// article absent. Constaté à l'écran le 2026-09-11.
			//
			// Uniquement quand la ligne redevient VIDE : si un article précédent a
			// été restauré, ce sont SES valeurs qui viennent d'être refetchées, et
			// les effacer serait une régression.
			if (l && !precedent) {
				["item_name", "rate", "price_list_rate", "amount"].forEach(function (champ) {
					if (l[champ] !== undefined) frappe.model.set_value(cdt, cdn, champ, champ === "item_name" ? "" : 0);
				});
			}

			const grid = frm.fields_dict[CHAMP_TABLE] && frm.fields_dict[CHAMP_TABLE].grid;
			if (!grid || !param_global.focus_grille) return;

			// L'indice de la ligne dans la table, recalculé : une ligne a pu être
			// retirée ailleurs pendant que la question était à l'écran.
			const idx = (frm.doc[CHAMP_TABLE] || []).findIndex((r) => r.name === cdn);
			if (idx < 0) return;

			param_global.focus_grille.exiger({
				grid: grid,
				ligne: idx,
				champ: "item_code",
				raison: "doublon refusé",
			});
		});
	}

	function demander(frm, cdt, cdn, premiere, code, nb_total, precedent) {
		const d = new frappe.ui.Dialog({
			title: "Article en double · منتج مُكرَّر",
			fields: [
				{
					fieldtype: "HTML",
					options: corps(premiere, code, premiere.idx, nb_total),
				},
			],
			primary_action_label: "✅ Oui, ajouter · نعم",
			primary_action: function () {
				d.hide();
			},
			secondary_action_label: "❌ Non, retirer · لا",
			secondary_action: function () {
				d.hide();
				annuler_saisie(frm, cdt, cdn, precedent);
			},
		});

		// ⚠️ Fermer par la croix ou par Échap ne retire RIEN : entre deux lectures
		// possibles d'un geste ambigu, on choisit celle qui ne détruit pas la
		// saisie. Seul le bouton « Non » retire l'article.
		d.show();
	}

	function avertir(frm, cdt, cdn) {
		const ligne = locals[cdt] && locals[cdt][cdn];
		if (!ligne) return;

		// La mémoire du code précédent est tenue à CHAQUE passage, y compris quand
		// on ressort aussitôt : c'est elle qui permet à « Non » de restaurer l'état
		// d'avant plutôt que de vider la ligne.
		const precedent = ligne.__pg_precedent;
		ligne.__pg_precedent = ligne.item_code || "";

		if (ligne.__pg_ignorer) return;
		if (!ligne.item_code) return;
		if (ligne.item_code === ARTICLE_MANUEL) return;
		// Une ligne basculée en saisie libre porte I00001 ; le garde-fou ci-dessus
		// suffit, mais le drapeau est testé aussi : les apps le posent AVANT
		// d'écrire le code, et l'ordre des deux écritures leur appartient.
		if (ligne.ligne_manuelle) return;
		if (frm.doc.docstatus !== 0) return;

		const autres = doublons(frm, ligne.item_code, ligne.name);
		if (!autres.length) return;

		// La PREMIÈRE occurrence est celle qu'on cite : c'est celle que
		// l'utilisateur doit remonter voir.
		const premiere = autres.reduce((a, b) => (a.idx <= b.idx ? a : b));

		// Le code d'AVANT est passé en paramètre, et non relu sur la ligne : il y a
		// déjà été écrasé par le code courant en tête de fonction.
		demander(frm, cdt, cdn, premiere, ligne.item_code, autres.length + 1, precedent || "");
	}

	// Exposé pour qu'une app puisse le rejouer elle-même après un ajout de ligne
	// qui ne passe pas par l'événement `item_code` (reprise depuis un BL source,
	// boîte de dialogue de sélection…).
	param_global.doublon_article = {
		ARTICLE_MANUEL: ARTICLE_MANUEL,
		verifier: avertir,
	};

	// ⚠️ Les handlers de `frappe.ui.form.on` s'ACCUMULENT : celui-ci s'ajoute à
	// ceux que les apps posent déjà sur `item_code` (le prix d'achat du BL, la
	// TVA du BR…), il ne les remplace pas. L'ordre entre eux est sans importance,
	// aucun ne dépend du résultat de l'autre.
	TABLES.forEach(function (table) {
		frappe.ui.form.on(table, {
			item_code: function (frm, cdt, cdn) {
				avertir(frm, cdt, cdn);
			},
		});
	});
})();
