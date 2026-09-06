"""Écrit `.github/workflows/tests.yml` dans les 21 dépôts, depuis un seul gabarit.

⚠️ Le workflow est IDENTIQUE partout, à une ligne près (`APP:`). Le modifier dans
un seul dépôt le ferait diverger des vingt autres — c'est exactement le mécanisme
qui a produit dix-sept copies de `pg_loupes`. Modifier le gabarit ici, puis
relancer :

    python3 apps/param_global/scripts/generer_ci.py
"""

import os
import sys

RACINE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
GABARIT = os.path.join(os.path.dirname(__file__), "ci_tests.yml")

#: Ordre d'installation, dicté par les `required_apps`. `param_global` d'abord :
#: il porte le moteur de tests dont toutes les autres héritent.
APPS = [
	"param_global", "profils", "client", "fournisseur", "article", "bon_livraison",
	"caisse", "remise_bancaire", "bon_reception", "bon_es", "ecriture_stock",
	"reconciliation_stock", "devis", "bon_commande", "garage", "verification",
	"rapport", "accueil", "commission", "professionnels", "article_manquant",
]


def main():
	gabarit = open(GABARIT, encoding="utf-8").read()
	for app in APPS:
		dossier = os.path.join(RACINE, app, ".github", "workflows")
		if not os.path.isdir(os.path.join(RACINE, app, ".git")):
			print(f"  ignoré (pas un dépôt) : {app}", file=sys.stderr)
			continue
		os.makedirs(dossier, exist_ok=True)
		with open(os.path.join(dossier, "tests.yml"), "w", encoding="utf-8") as f:
			f.write(gabarit.replace("__APP__", app))
		print(f"  écrit : {app}/.github/workflows/tests.yml")


if __name__ == "__main__":
	main()
