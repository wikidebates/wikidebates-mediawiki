Interlanguage centralisé pour MediaWiki 1.43

Cette version reprend la logique de votre variante "Pavel" :
- les liens interlangues peuvent être saisis sur un seul wiki central ;
- les autres wikis n'ont pas besoin de dupliquer les liens dans chaque langue.

Adaptations faites pour MediaWiki 1.43 :
- remplacement des accès directs à certaines propriétés internes par des getters ;
- remplacement de DB_MASTER par DB_PRIMARY ;
- branchement explicite du hook SkinTemplateOutputPageBeforeExec sur sa méthode ;
- conservation de la table interlanguage_links et du module API langlinks modifié.

Installation
1. Déposer ce dossier dans extensions/Interlanguage
2. Sur le wiki central : require_once "$IP/extensions/Interlanguage/InterlanguageCentral.php";
3. Sur les wikis dépendants : require_once "$IP/extensions/Interlanguage/Interlanguage.php";
4. Régler les variables globales comme dans votre installation actuelle
5. Sur le wiki central, lancer update.php pour créer la table interlanguage_links

Remarque
Cette extension est archivée côté Wikimedia et n'a pas de branche officielle REL1_43 maintenue. Ce paquet est donc un port pragmatique vers MediaWiki 1.43, pas une version officielle Wikimedia.
