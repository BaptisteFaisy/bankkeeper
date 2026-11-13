# Connexion réelle — FastAuth ou relayeur sponsorisé

> Ce que le track exige, ce que le dépôt fait, et **pourquoi la voie du
> relayeur sponsorisé est retenue**. Écrit le 10 novembre 2026. Chaque
> affirmation renvoie à un fichier, à une commande ou à un chiffre mesuré ;
> rien ici n'est une intention.

## 1. L'exigence, et l'état du dépôt

Le track *Games With Real Economies* demande :

> Players sign in with a social or email login. **No seed phrases, no wallet
> popups, no gas prompts** in the normal game loop.

Le dépôt aujourd'hui :

| Attendu | État | Preuve |
|---|---|---|
| un email, sans wallet | ✅ **l'email ouvre un compte NEAR** | le client appelle `POST /login` du relais (`web/src/near/chainSession.ts`) ; le relais dérive `p-<sha256(email)[:20]>.<suffix>` et rend le compte (`tests/e2e_chain_public.py`, `tests/relay_sponsor.py`) |
| pas de phrase de récupération | ✅ | aucune clé ne quitte le navigateur (`web/src/near/chain.ts`) |
| pas de popup de wallet | ✅ | pas de wallet dans `web/` ; la chaîne n'est jointe que sur demande (`?chain`, `web/src/near/chain.ts:chainRequested`) |
| pas de demande de gas | ✅ | le joueur ne signe rien lui-même ; la bande dit que la maison paie |

La boucle de jeu, elle, ne demande **rien** à la chaîne : le moteur wasm tourne
dans le navigateur (`web/src/engine.ts`), le relais `server/relay.py` ne parle
qu'au binaire `sim`. Le contrat porte les licences, les notes de dette et les
votes (`docs/ONCHAIN.md`).

Il manquait donc **une seule chose** : que l'email soit une identité, et que
cette identité puisse signer une transaction sans que le joueur voie quoi que
ce soit. C'est ce que ce document tranche, et ce que la preuve du bas
(le test automatisé sur `near-sandbox`) établit.

## 2. Les deux voies

### Voie A — FastAuth / NEAR Account Manager (email → clé MPC en enclave)

Un service tiers prend l'email (ou un compte social), fait tourner un
**MPC dans une enclave** et détient la clé NEAR du joueur. Le navigateur ne
voit jamais la clé : il demande au service de signer.

- Identité : le SDK officiel `@fast-auth-near/browser-sdk` (npm, 1.4.2,
  publié le 24 juillet 2026) s'appuie sur **Auth0** pour l'email et le social
  (`@auth0/auth0-spa-js`, `react-native-auth0`) et sur `near-api-js` pour la
  signature (métadonnées : <https://registry.npmjs.org/@fast-auth-near/browser-sdk/latest>).
- Le dépôt a déjà la **couture** pour ça : `web/src/near/session.ts` déclare
  l'interface `NearSession` (« FastAuth adapter seam ») et n'implémente que
  `LocalSession`. Un adaptateur FastAuth remplacerait `LocalSession` sans
  toucher au reste du jeu.
- Le compte NEAR obtenu est un compte NEAR **ordinaire** : côté contrat, rien
  ne change.

### Voie B — Relayeur sponsorisé (le serveur détient la clé du joueur)

Le serveur garde la clé du joueur et signe pour lui ; il paie le gas, ou
maintient le compte approvisionné pour qu'il paie lui-même. Le navigateur ne
poste qu'un email et une intention, et reçoit un hash et un solde.

- **Le code est déjà dans le dépôt** : `scripts/sandbox/{start,stop,lib}.mjs`
  (chaîne locale), `scripts/relayer/src/{relayer,chain}.mjs` (le relais qui
  tient les clés), `web/src/near/chain.ts` + `web/src/components/ChainBar.tsx`
  (le côté navigateur), `tests/e2e_onchain.py` (la preuve navigateur).
- Ce qui manquait : l'email ne produisait aucun compte. C'est ce que ce lot
  ajoute (`scripts/relayer/src/identity.mjs`, `guard.mjs`, le semis de bourse
  dans `chain.mjs`) et ce que `tests/relay_sponsor.py` prouve.

## 3. Comparaison, sur des critères vérifiables ici

| Critère | A — FastAuth / Account Manager | B — Relayeur sponsorisé |
|---|---|---|
| **Ce qu'il faut héberger** | l'application seulement ; la clé est dans l'enclave du service, mais **le navigateur doit charger la page de connexion du service** (redirection hors de notre domaine) | un service HTTP de 120 lignes (`scripts/relayer/src/relayer.mjs`, `node:http` + `near-api-js`) et un RPC NEAR — **notre propre nœud en local**, un RPC public en testnet |
| **Qui détient les clés** | l'enclave du tiers ; nous ne détenons rien, nous ne pouvons ni exporter, ni faire tourner, ni contrôler l'arrêt du service | **nous** : `TW_CHAIN_HOME/players/<sha256(email)[:20]>.json`, mode `0600`, jamais dans l'arbre (vérifié par le test) ; le joueur n'a **ni clé, ni export, ni copie** (`docs/ONCHAIN.md` §6) |
| **Ce que ça coûte en gaz** | le compte doit détenir du NEAR pour signer ; si le service ne le finance pas, **c'est nous** — le même problème que B | mesuré sur le sandbox : **0,31 Tgas** brûlés par un `buy_licence` (le relais attache 100 Tgas) ; au prix plancher du réseau (1 Tgas ≈ 1·10⁻⁴ NEAR, `docs/ONCHAIN.md` §3) ≈ 3·10⁻⁵ NEAR par clic, et le compte doit garder ≈ 1 NEAR — la maison le **recharge** (`TW_NEAR_FLOOR`) |
| **Ce que ça change dans `web/`** | un adaptateur `NearSession` + le bouton de connexion ; la boucle de jeu ne bouge pas | **rien d'obligatoire** : `web/src/near/chain.ts` et `ChainBar.tsx` existent et ne sont montés que si `VITE_CHAIN=1` (`web/src/App.tsx:397`) ; il ne manque que l'ouverture de session chaîne au moment du login → diff exact en §7 |
| **Ce que ça change dans `server/`** | rien : `server/relay.py` garde son jeton opaque | `server/relay.py` doit **lier la session au compte NEAR** : aujourd'hui son jeton ne sait rien de la chaîne (→ §7) |
| **Ce que ça change dans le contrat** | rien : un compte FastAuth est un compte NEAR ordinaire | rien — et c'est **prouvable** : depuis le commit `7b2c542` (« make `mt_transfer` payable, seed the bank licence pool »), le contrat sait déplacer l'or entre comptes, ce qui rend possible le semis de bourse d'un nouveau capitaine. `docs/ONCHAIN.md` §6 dit encore le contraire : c'est périmé, corrigé dans ce lot |
| **Risque d'abus (un joueur qui vide le compte sponsor)** | le purse est chez le tiers : le risque n'est pas le nôtre, mais **nous ne pouvons pas l'auditer** | il est **entièrement nôtre** : la maison tient l'or du monde sur le sandbox. Sans garde-fous, mille emails suffiraient à le vider. D'où les quatre dials de `scripts/relayer/src/guard.mjs` (§5) |
| **Dépendance à un service tiers** | **totale** : Auth0 (identité) + le service FastAuth (clés, signature) + son SDK npm. S'ils changent d'API ou s'arrêtent, notre connexion meurt et **aucune clé n'est récupérable** | **aucune** hors le RPC NEAR ; le SDK est `near-api-js` (MIT) ; tout le chemin se prouve **hors ligne**, sur notre nœud |
| **Temps de mise en œuvre** | **indéterminé** : surface d'API d'un tiers, compte à ouvrir, et une e2e qui ne peut tourner que sur son mainnet — donc **non prouvable localement**. Ce soir, le faucet est en limite de débit (10 comptes / 3 h / IP) : toute voie qui demande des comptes mainnet est bloquée | **fait** : le code était déjà là ; ce lot ajoute le login qui manquait, les garde-fous et une preuve headless. La preuve tourne en ≈ 2 min sur le sandbox |
| **Preuve possible aujourd'hui, hors ligne** | ❌ non | ✅ oui — `python3 tests/relay_sponsor.py` |

## 4. Recommandation

**Voie B, le relayeur sponsorisé, dès maintenant.** Quatre raisons, dans
l'ordre de poids :

1. **C'est la seule voie que l'on peut prouver.** La voie A dépend d'une
   enclave que nous ne contrôlons pas : rien de ce qu'elle fait ne peut être
   vérifié sur notre sandbox, et le faucet est fermé ce soir. La voie B se
   prouve de bout en bout, hors ligne, en deux minutes.
2. **Zéro dépendance tierce.** Le chemin complet — identité, clé, signature,
   gas — tient dans ce dépôt et dans `near-api-js`.
3. **Le code est déjà là.** `scripts/relayer/`, `scripts/sandbox/`,
   `web/src/near/chain.ts` : il ne manquait que le maillon « email → compte ».
4. **La garde que le joueur nous demande reste possible.** Le joueur ne voit
   ni wallet, ni phrase, ni gas : c'est l'exigence, et elle est tenue.

**Ce que la voie B ne cache pas** : la maison détient la clé du joueur. Le
joueur ne peut rien emmener (`docs/ONCHAIN.md` §6). C'est le prix de « pas de
phrase de récupération », et c'est un engagement de politique, pas un
détail technique : les plafonds ci-dessous doivent être publics.

**La voie A reste ouverte** : la couture `NearSession`
(`web/src/near/session.ts`) est toujours là. Si un jour FastAuth doit
remplacer la maison (custody dans une enclave, pas chez nous), on n'écrit
qu'un adaptateur — le jeu ne bouge pas. Ne pas y investir avant que le
faucet ne se rouvre et qu'une e2e FastAuth soit prouvable.

## 5. Les garde-fous

### Ce que chaque voie exige

| Garde-fou | A — FastAuth | B — Relayeur sponsorisé |
|---|---|---|
| **Plafond de dépense par compte** | hors de nos mains si le service finance le compte ; à demander au service | **chez nous** : une bourse, une fois, et un plafond en milli-gold |
| **Rate-limit** | à demander au service (nos appels au SDK sont des requêtes HTTP) | **chez nous** : un compteur glissant par appelant |
| **Clé par session** | la clé est dans l'enclave, elle ne sort jamais | la clé est **par compte**, côté serveur ; la **session** du joueur doit y être liée (token de `server/relay.py` → compte NEAR) |
| **Rotation** | gérée par le service | **chez nous** : on ne peut pas faire tourner la clé d'un joueur sans le prévoir ; la rotation consiste à remplacer la clé plein accès d'un compte et à réécrire son fichier `0600` |
| **Qui peut déclencher une écriture** | l'email est authentifié par Auth0 | l'email + le jeton de session ; le relais ne signe que pour un email connu |

### Ce qui est posé aujourd'hui

`scripts/relayer/src/guard.mjs` — quatre dials, tous réglables par variable
d'environnement, tous vérifiés par `tests/relay_sponsor.py` :

| Dial | Réglable | Défaut | Effet |
|---|---|---|---|
| Rate-limit par appelant (IP + email) | `TW_RATE_LIMIT_PER_MIN` | 30/min | une rafale est **refusée (429)**, pas mise en file |
| Plafond de bourse par compte | `TW_SEED_GOLD_MILLI` | 1 000 000 milli-gold (1 000 or) | la maison prête **une fois**, jamais plus |
| Budget de nouveaux capitaines par heure | `TW_SEED_LIMIT_PER_HOUR` | 50/h | mille emails en une minute ne vident pas la maison |
| Transactions sponsorisées par compte | `TW_ACTION_LIMIT_PER_HOUR` | 200/h | un capitaine ne peut pas faire tourner le relais |
| Recharge NEAR du compte | `TW_NEAR_FLOOR` | 1 NEAR | le compte peut toujours payer son gas : **jamais de demande au joueur** |

Le ledger (`TW_CHAIN_HOME/ledger.json`, mode `0600`) tient les compteurs :
il **survit au redémarrage** (un redémarrage ne remet pas les plafonds à
zéro) et il ne contient **ni clé, ni email, ni montant de NEAR** — seulement
le hash de l'email et des compteurs.

### Ce qui reste à poser (et comment)

- **Lier la session à la chaîne** : le jeton de `POST /api/auth` doit retenir
  l'email **et** le compte NEAR, et le relais ne doit signer que
  pour une session valide. → le diff est en §7.
- **Rotation** : remplacer la clé plein accès d'un compte (ajouter la
  nouvelle, retirer l'ancienne) et réécrire le fichier `0600`. Non codé à ce
  jour ; à faire avant toute mise en production, car c'est la seule fuite
  possible côté serveur.
- **Journal d'audit** : qui a demandé quelle transaction, pour quel hash
  d'email. Le ledger compte, il ne retrace pas.
- **Politique publique** : plafonds, durée de conservation des clés, sort de
  la maison (transparence, pas de récupération) — à publier avec le jeu.

## 6. La preuve sur `near-sandbox`

```bash
cd contracts/tidewater && cargo near build non-reproducible-wasm   # le contrat
python3 tests/relay_sponsor.py                                      # la preuve
```

Le test (stdlib only, **aucun appel réseau, aucun faucet, aucun testnet**)
démarre un `near-sandbox` local, déploie le contrat, démarre le relais et
prouve, dans l'ordre :

1. **déterminisme** — l'email `captain@tidewater.dev` donne toujours le même
   compte `p-41abb460db76f2549fb3.test.near`
   (`p-<sha256(email)[:20]>.<suffix>`), et un autre email donne un autre
   compte ;
2. **garde des clés** — la clé existe, mode `0600`, sous
   `TW_CHAIN_HOME/players/`, **absente du dépôt** et absente du journal du
   relais (le test vérifie que la chaîne secrète n'apparaît nulle part) ;
3. **sponsorship** — la maison prête la première bourse (1 000 000
   milli-gold, hash de transaction renvoyé) et le compte garde 10 NEAR pour
   payer son gas ;
4. **transaction sponsorisée** — le relais signe et envoie `buy_licence` :
   hash `9wtwz8waFFPF1Z1N8boPYTieLiyoK4zyXRE71ExnMDpz`, reçu du contrat
   `{"buyer": "p-41abb460db76f2549fb3.test.near", "price_milli": 280000,
   "reasoning": "Licence bought for 280.0 gold."}`, **0,31 Tgas** brûlés ;
5. **le solde a bougé** — `mt_balance_of` lu **directement au RPC** :
   licence `0 → 1`, or `1 000 000 → 720 000` (prix 280 000) ;
6. **les garde-fous** — une rafale de 14 appels est refusée (429), la
   deuxième transaction sponsorisée du même capitaine est refusée
   (`E_ACTION_CAP`), et le ledger montre une bourse prêtée **une seule fois**.

Dernière exécution : **PASS**, hash
`9wtwz8waFFPF1Z1N8boPYTieLiyoK4zyXRE71ExnMDpz`.

Le navigateur n'a rien vu : pas de wallet, pas de phrase, pas de gas. La
preuve navigateur du même chemin est `tests/e2e_onchain.py` (Chrome, lecture
du hash affiché par la page) : elle repasse au vert dans ce lot — le fond du
tutoriel couvrait l'écran et interceptait le clic sur la bande « On-chain »
(`dismiss_tutorial` a été déplacé dans `tests/e2e_tidewater.py`, partagé avec
`tests/e2e_offline.py`). Dernière exécution : la page affiche
`tx 7Re4xMC7…hkn5`, et le solde de licences passe de 4 à 5.

## 7. Branchement côté client — livré

Le diff annoncé ici est **appliqué**, et il a changé de forme en route : il ne
s'agit plus d'un appel « best effort » oublié dans un coin, mais d'un mode que
le joueur choisit et qu'il peut quitter.

**Un seul build public, deux modes.** L'activation était une constante de
compilation (`VITE_CHAIN=1`), donc il aurait fallu deux sites. Elle est
maintenant décidée à l'exécution (`web/src/near/chain.ts`) :

```ts
export function chainRequested(): boolean {
  if (chainBuildOnly()) return true;                    // VITE_CHAIN === '1'
  return new URLSearchParams(window.location.search).has('chain');
}
```

`?chain` (avec ou sans valeur) allume le mode ; `?chain=<url>` dit en plus
quel relais joindre, ce qui passe devant `VITE_CHAIN_URL` (valeur cuite au
build) et devant le proxy `/chain` du dev. Le mode hors-ligne reste le défaut
bit pour bit : sans `?chain`, la page ne fait **aucun** appel au relais
(`tests/e2e_offline.py` compte maintenant les requêtes vers `/api/` *et* vers
le relais, et il en trouve zéro).

**La porte, et ce qu'elle dit.** La carte de connexion
(`web/src/components/Auth.tsx`, désormais la seule — l'`AuthGate` dupliqué
d'`App.tsx` a disparu) porte un bouton « Play on chain (testnet) » qui recharge
en `?chain=1`, et la phrase honnête qui va avec : l'email devient un vrai
compte NEAR testnet, la maison paie le gaz, il n'y a **pas** de phrase de
récupération. En mode chaîne, la même carte et la bande `ChainBar` proposent
« Play offline instead », qui retire `?chain` et recharge : la partie
sauvegardée n'est pas touchée, le joueur repart en hors-ligne.

**Le login est réel.** `Auth.tsx` appelle `chain.login(email)` ; la session
chaîne vit dans `web/src/near/chainProvider.tsx` + `chainSession.ts`, un seul
état partagé par la carte et la bande (jamais deux logins). Le joueur ne voit
ni wallet, ni phrase, ni gaz : la bande affiche le compte NEAR obtenu, le hash
raccourci de la dernière transaction et un lien `explorer` qui, lui, porte le
hash entier. Un capitaine qui revient (session en `localStorage`, pas encore de
compte NEAR) voit son compte s'ouvrir au chargement — une seule fois par email,
pour qu'un refus ne devienne jamais une boucle.

**Le repli.** Un relais absent, un 429, un 504 : la carte affiche la raison
dans une phrase lisible (`chainErrorMessage`, `E_RATE_LIMIT` → « The relayer is
rate-limiting right now… ») **et** le bouton « Continue offline instead ». La
bande ajoute « Try again ». Aucun écran mort : c'est le défaut bloquant qui
venait d'être corrigé, il ne revient pas.

**La garde anti double-clic est celle du jeu.** Les quatre actions sponsorisées
passent par `mutate()` (`web/src/actions.ts`), donc par le verrou `inFlight` et
le debounce de 500 ms déjà éprouvés par `tests/audit_web.py` — pas une deuxième
garde inventée à côté. La quatrième, « Propose quota » (60 licences par défaut),
passe par la même garde serveur (`guarded()`, `scripts/relayer/src/guard.mjs`)
que les trois autres et n'est active que quand la session chaîne est prête ; le
vote sans `proposalId` vise la dernière motion non résolue.

**Ce qui reste à faire côté serveur** (hors de ce lot, `server/` est interdit
ici) : lier le jeton de `POST /api/auth` au compte NEAR, comme décrit plus bas.

`server/relay.py` — lier le jeton de session au compte NEAR (route
`POST /api/auth`) :

```diff
@@ def _handle_auth(self, body: dict)
     token = secrets.token_urlsafe(16)
     with MUTATION_LOCK:
         store = load_sessions(sessions_path())
-        store[token] = clean
+        store[token] = {**clean, "chainAccount": chain_account(clean["email"])}
         save_sessions(sessions_path(), store)
     self._send_json(200, {"ok": True, "token": token,
-                          "pseudo": clean["pseudo"]})
+                          "pseudo": clean["pseudo"],
+                          "chainAccount": store[token]["chainAccount"]})
```

où `chain_account(email)` interroge le relais de chaîne
(`TW_CHAIN_RELAYER_URL`, par défaut `http://127.0.0.1:8786`) et renvoie
`None` si la chaîne est absente — **le jeu hors-ligne continue de marcher
exactement comme avant**, avec ou sans chaîne.

**La preuve publique** est `tests/e2e_chain_public.py` : elle lit l'URL du
relais dans `TW_CHAIN_URL` (ou dans le `?chain=<url>` de `TW_SITE`), **se
désactive proprement** (`SKIP`, pas un échec trompeur) tant que le relais n'est
pas joignable, et sinon ouvre la démo en `?chain=1`, se connecte avec un email
unique, attend le compte NEAR affiché, clique « Buy a licence », exige un hash
base58 de longueur plausible, puis relit `tx` **et** `mt_balance_of` sur
`https://rpc.testnet.near.org`. Elle n'écrit aucun secret.

## 8. Ce que ce lot ne fait pas

- Il ne déploie rien, n'héberge aucune clé, ne touche pas au testnet et ne
  demande rien au faucet.
- Il ne change **rien** à la boucle de jeu : le moteur wasm reste le
  défaut, la build hors-ligne ne fait toujours **zéro appel** à `/api/` ni au
  relais (`tests/e2e_offline.py` les compte tous les deux), et la chaîne ne
  s'allume qu'à la demande (`?chain`, ou un build `VITE_CHAIN=1`).
- Il n'implémente pas FastAuth : la voie est étudiée, pas codée.
- La rotation des clés et le journal d'audit restent à faire (§5).
