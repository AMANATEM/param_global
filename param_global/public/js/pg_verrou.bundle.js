// Verrou administrateur — dialogue de saisie du mot de passe, partagé par le
// desk entier (accueil, page Caisse, listes verrouillées).
//
// Rien ici ne protège quoi que ce soit : la vraie serrure est côté serveur
// (param_global/verrou.py, appelé par chaque endpoint sensible). Ce fichier ne
// fait qu'éviter à l'utilisateur de se heurter à une erreur de permission.

frappe.provide("param_global.verrou");

param_global.verrou = {
	// Ouvre `zone` si besoin, puis exécute `action`. Si la zone est déjà
	// déverrouillée, `action` part immédiatement, sans dialogue.
	// `sur_verrouillage` est appelé quand on découvre la zone fermée, AVANT le
	// dialogue : l'écran appelant peut ainsi se vider au lieu de laisser à
	// l'affichage les chiffres du déverrouillage précédent.
	proteger(zone, action, sur_verrouillage) {
		frappe.call({
			method: "param_global.verrou.etat",
			args: { zone: zone },
			no_spinner: true,
			callback: (r) => {
				const etat = (r && r.message) || {};
				if (etat.deverrouille) {
					action(etat);
				} else {
					if (sur_verrouillage) sur_verrouillage();
					param_global.verrou.demander(zone, action);
				}
			},
		});
	},

	// Dialogue de saisie. `action(etat)` n'est appelé qu'après un déverrouillage
	// accepté par le serveur.
	demander(zone, action) {
		const d = new frappe.ui.Dialog({
			title: __("Écran protégé"),
			fields: [
				{
					fieldtype: "HTML",
					options:
						'<p style="margin-bottom: 12px; color: var(--text-muted);">' +
						__("Saisissez le mot de passe administrateur pour ouvrir cet écran.") +
						"</p>",
				},
				{
					// Fieldtype Data et NON Password : Chrome ne propose
					// d'enregistrer un mot de passe, et ne propose sa liste de
					// comptes en surimpression, que sur un <input type="password">.
					// Le masquage des caractères est fait en CSS (voir
					// _blinder_champ), donc invisible pour le gestionnaire de mots
					// de passe — c'est le seul moyen fiable : `autocomplete="off"`
					// est ignoré par Chrome sur un vrai champ mot de passe.
					fieldname: "mot_de_passe",
					fieldtype: "Data",
					label: __("Mot de passe"),
					reqd: 1,
				},
			],
			primary_action_label: __("Ouvrir"),
			primary_action: (valeurs) => {
				frappe.call({
					method: "param_global.verrou.deverrouiller",
					args: { zone: zone, mot_de_passe: valeurs.mot_de_passe },
					// Le message d'erreur du serveur (mot de passe incorrect, trop de
					// tentatives) est affiché par nous, dans le dialogue resté ouvert :
					// sinon Frappe empile une boîte d'erreur par-dessus.
					error: () => {},
					callback: (r) => {
						const etat = (r && r.message) || {};
						if (!etat.deverrouille) return;
						d.hide();
						action(etat);
					},
				});
			},
		});

		// Entrée = valider, comme dans tous les écrans de saisie de la maison.
		d.$wrapper.on("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				d.get_primary_btn().trigger("click");
			}
		});

		d.show();
		param_global.verrou._blinder_champ(d.get_field("mot_de_passe").$input);
		setTimeout(() => d.get_field("mot_de_passe").$input.focus(), 150);
	},

	// Chien de garde : referme l'écran à l'expiration, SANS attendre une
	// navigation. Sans lui, le serveur a beau refuser les nouvelles requêtes, les
	// chiffres déjà affichés restent lisibles indéfiniment à l'écran — c'est
	// exactement ce qui se passait sur la page Caisse laissée ouverte.
	veiller(zone, secondes, quand_ferme) {
		param_global.verrou._minuteurs = param_global.verrou._minuteurs || {};
		const minuteurs = param_global.verrou._minuteurs;
		if (minuteurs[zone]) clearTimeout(minuteurs[zone]);

		const restant = Math.max(0, Math.round(secondes || 0));
		minuteurs[zone] = setTimeout(() => {
			minuteurs[zone] = null;
			quand_ferme();
		}, restant * 1000 + 500); // +0,5 s : on ferme APRÈS le serveur, jamais avant
	},

	// Masque la saisie et rend le champ inintéressant pour les gestionnaires de
	// mots de passe (Chrome, LastPass…) : caractères remplacés par des points en
	// CSS, nom d'attribut aléatoire, autocomplétion coupée. Un mot de passe
	// administrateur tapé au comptoir n'a rien à faire dans le navigateur d'un
	// poste partagé.
	_blinder_champ($input) {
		if (!$input || !$input.length) return;

		if (!document.getElementById("pg-verrou-style")) {
			$("<style id='pg-verrou-style'>")
				.text(
					".pg-verrou-masque { -webkit-text-security: disc; text-security: disc; " +
						"letter-spacing: 2px; font-family: inherit; }"
				)
				.appendTo(document.head);
		}

		// Identifiants neutres : Chrome classe aussi les champs d'après leur `id`
		// et leur `name`, et « mot_de_passe » en fait partie. Le libellé suit le
		// nouvel identifiant pour rester cliquable.
		const neutre = "pgv-" + Math.random().toString(36).slice(2, 10);
		$input
			.addClass("pg-verrou-masque")
			.attr({
				type: "text",
				id: neutre,
				name: neutre,
				autocomplete: "off",
				autocorrect: "off",
				autocapitalize: "off",
				spellcheck: "false",
				"data-lpignore": "true",
				"data-form-type": "other",
			})
			.closest(".frappe-control")
			.find("label")
			.attr("for", neutre);
	},

	// « 4 min 20 s » — pour le compte à rebours des cartes de l'accueil.
	formater_restant(secondes) {
		const s = Math.max(0, Math.round(secondes || 0));
		const m = Math.floor(s / 60);
		const r = s % 60;
		if (m && r) return `${m} min ${String(r).padStart(2, "0")} s`;
		if (m) return `${m} min`;
		return `${r} s`;
	},
};
