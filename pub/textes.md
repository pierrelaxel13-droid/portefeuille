# Textes de pub — Pierrel & Co — portefeuille

Remplacer `[LIEN]` par l'adresse du site avant de publier.

## Slogans
- Votre argent, enfin lisible.
- Le prix, c'est ce que vous payez. La valeur, c'est ce que vous obtenez.
- Six chiffres qu'aucun tableur ne vous donne.
- Le patrimoine, sans le tableur.

## Légende de post (réseaux sociaux)
Votre patrimoine est éparpillé entre plusieurs comptes, plusieurs applis et un tableur que vous n'osez plus ouvrir ?

Pierrel & Co — portefeuille rassemble tout au même endroit :
- valeur totale, répartition et performance dans le temps
- quatorze indicateurs : concentration, liquidité, poids de chaque ligne
- loyers, dividendes et intérêts suivis
- plusieurs portefeuilles séparés : perso, société, famille
- s'installe sur le téléphone et fonctionne hors ligne

Un outil de suivi, pas un conseil : il ne recommande aucun placement.

👉 [LIEN]

## Script vidéo (28 s, `video.mp4`)
1. 0–4 s : la valeur totale s'emballe jusqu'à « 248 630 € » (▲ +12,3 %). Mention : portefeuille d'exemple, chiffres fictifs.
2. 4–8 s : « Livret. Assurance-vie. PEA. Immobilier. Bitcoin. » puis « Un seul écran. »
3. 8–15 s : « Tout se recalcule. » : anneau de répartition, courbe, investi / valeur / gain.
4. 15–19 s : « 14 indicateurs » : tuiles qui s'allument une à une.
5. 19–23 s : « Sur votre téléphone. » : maquette, icône, « Même hors ligne ».
6. 23–28 s : « Votre argent, enfin lisible. », bouton, « Un outil de suivi, pas un conseil ».

Pour la refaire : `node rendre-video.mjs video.mp4` (Chromium + ffmpeg + Node 22).

## Films 3D (la version « ouf »)
| Fichier | Format | Durée | Usage |
|---|---|---|---|
| `film.mp4` | 1080×1920 | 25 s | Reels, TikTok, Stories |
| `film-16x9.mp4` | 1920×1080 | 25 s | YouTube, LinkedIn, site |
| `film-15s.mp4` | 1080×1920 | 15 s | Stories courtes, publicité |

Scénario : « Combien avez-vous vraiment ? » → cinq comptes en tourbillon (« Zéro vue d'ensemble ») → une ville de tours dont la hauteur suit la répartition → la courbe en 3D (« Ce que ça vaut. Ce que ça rapporte. ») → tunnel de 14 indicateurs → téléphone (« Dans votre poche. Même hors ligne. ») → « Votre argent, enfin lisible. » (la version de 15 s saute le téléphone).

Source : `film.html` (three.js, dossier `vendor/`), son : `son_film.py` + `synth.py`.
Régénérer :
```
python3 son_film.py son.wav [--cut=15]
node rendre-video.mjs film.mp4 --page=film.html [--cut=15] [--fmt=16x9] --blur=3 --audio=son.wav
```
L'enregistrement 3D est lent (environ 1 h pour les trois versions sur 4 cœurs, rendu logiciel).
`--resume=dossier` reprend un enregistrement interrompu.

## Fichiers vidéo (première version, animation 2D)
| Fichier | Format | Durée | Usage |
|---|---|---|---|
| `video.mp4` | 1080×1920 | 28 s | Reels, TikTok, Stories (version complète) |
| `video-15s.mp4` | 1080×1920 | 15 s | Stories courtes, publicité (valeur, tableau de bord, 14 indicateurs, final) |
| `video-16x9.mp4` | 1920×1080 | 28 s | YouTube, LinkedIn, site |

Les trois vidéos ont une bande-son synthétisée (`son.py`, sans échantillon ni droits à gérer) et un flou de mouvement.

Régénérer :
```
python3 son.py son.wav [--cut=15]
node rendre-video.mjs sortie.mp4 [--cut=15] [--fmt=16x9] [--blur=4] [--audio=son.wav]
```
