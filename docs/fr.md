# WebRTC Camera

Amenez les caméras de votre serveur **go2rtc** dans Gladys : images sur le tableau de bord, état
des caméras, direct WebRTC, déclencheurs et actions de scène.

[go2rtc](https://github.com/AlexxIT/go2rtc) est le serveur de caméras qui lit presque toutes les
caméras (RTSP, ONVIF, Tapo, Reolink, HomeKit, Ring…) et les diffuse en WebRTC. Il tourne seul, et
il est aussi inclus dans **Frigate** et dans l'add-on **Home Assistant** : vous en avez peut-être
déjà un.

## Prérequis

- Gladys 5.3 ou plus récent.
- Un serveur go2rtc joignable par Gladys sur votre réseau (API sur le port **1984** par défaut).
- Vos caméras déclarées dans go2rtc (section `streams:` de `go2rtc.yaml`).

## Configuration

| Champ                           | Quoi mettre                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Adresse de go2rtc               | L'API go2rtc, par exemple `http://192.168.1.20:1984`.                                                                     |
| Identifiant / Mot de passe      | Seulement si l'API go2rtc est protégée (`api.username` / `api.password`).                                                 |
| Caméras                         | Noms des flux à ajouter, séparés par des virgules. Vide : tous les flux.                                                  |
| Rafraîchissement des images (s) | Secondes entre deux images de chaque caméra (60 par défaut). Détecte aussi une caméra qui ne répond plus. 0 : désactivé.  |
| Largeur des images (px)         | Largeur des images (640 par défaut). Gladys accepte 150 Ko max : une image trop lourde est redemandée plus étroite.       |
| Adresse du direct (https)       | Facultatif : go2rtc derrière un reverse proxy https, tel que votre navigateur le voit. Ajoute un bouton de direct WebRTC. |
| Journaux détaillés              | Journalise chaque image et chaque erreur. Désactivez-le ensuite.                                                          |

Ensuite :

1. Cliquez sur **Tester la connexion** : la réponse donne la version de go2rtc et les caméras
   trouvées.
2. Ouvrez l'onglet **Découvrir** et ajoutez les caméras dans Gladys.
3. Facultatif : **Tester une image** vérifie une caméra (taille, durée).

Chaque flux go2rtc devient une caméra dans Gladys. L'identifiant de l'appareil vient du nom du
flux : **renommer un flux dans go2rtc crée une nouvelle caméra** dans Gladys.

## État des caméras

- Une caméra est **hors ligne** après deux images ratées de suite, ou tout de suite si go2rtc
  lui-même ne répond pas. Son badge affiche alors « injoignable ».
- L'état de l'intégration (écran Configuration) indique si go2rtc répond, et sinon pourquoi
  (mauvaise adresse, mauvais mot de passe…).
- Avec « Rafraîchissement des images » à 0, l'état n'est mis à jour que lorsqu'une image est
  demandée.

## Scènes

**Déclencheurs**

- **Une caméra ne répond plus** — filtre : caméra. Variables : nom de la caméra, raison (code :
  `http_error`, `timeout`, `server_unreachable`, `auth`, …).
- **Une caméra répond de nouveau** — filtre : caméra. Variables : nom de la caméra, durée hors
  ligne (s).

Ils se déclenchent une fois, au changement. Une caméra déjà en panne au démarrage de Gladys est
affichée hors ligne, mais ne déclenche rien.

**Actions**

- **Prendre une image de caméra** — prend une image fraîche tout de suite. Placez-la juste avant
  l'action Gladys « Envoyer une image de caméra » pour envoyer une image à jour. Sorties : image
  prise (oui/non), taille (Ko).
- **Relire les caméras go2rtc** — ajoute les nouveaux flux. Sorties : nombre de caméras, caméras
  non hors ligne.

Exemple : _Une caméra ne répond plus_ → _Envoyer un message_ « La caméra {{device_name}} est hors
ligne ({{reason}}) ».

## Widgets du tableau de bord

- **Caméras** : toutes les caméras avec leur dernière image, leur état et un lien vers le direct ;
  l'état de go2rtc ; un bouton pour actualiser toutes les images.
- **Caméra** : une caméra en grand (choisie dans les réglages du widget), son état, un bouton
  **Nouvelle image** et un bouton **Direct**.

Le direct ouvre le lecteur WebRTC de go2rtc (`stream.html?mode=webrtc`). Gladys n'ouvre que des
liens https : renseignez l'**Adresse du direct** avec une adresse https de go2rtc (reverse proxy).
Sans elle, les boutons de direct sont masqués.

## Dépannage

| Message                                          | Que faire                                                                         |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| go2rtc est injoignable                           | Vérifiez l'adresse et le port, et que Gladys joint bien cette machine.            |
| go2rtc a refusé l'identifiant ou le mot de passe | Comparez les champs avec `api.username` / `api.password` de go2rtc.               |
| cette adresse n'est pas une API go2rtc           | L'adresse pointe vers un autre service : utilisez le port de l'API go2rtc (1984). |
| go2rtc n'a pas pu lire la caméra                 | go2rtc n'arrive pas à ouvrir le flux : vérifiez-le dans la page web de go2rtc.    |
| l'image dépasse 150 Ko                           | Baissez la **Largeur des images**.                                                |

Les images demandent à go2rtc de décoder la vidéo : pour les caméras H.264/H.265, go2rtc utilise
**FFmpeg** (inclus dans son image Docker et dans Frigate).

## Vie privée

- L'intégration ne parle qu'à votre serveur go2rtc. Pas de cloud.
- Les URL des caméras listées par go2rtc (souvent avec mot de passe) ne sont jamais envoyées à
  Gladys ni journalisées.
- Les images restent en mémoire (la dernière par caméra).
