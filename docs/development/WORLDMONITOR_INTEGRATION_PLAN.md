# WorldMonitor Integration — Plan d'analyse et recommendations

## Analyse de la situation

### WorldMonitor (koala73/worldmonitor)

WorldMonitor est un projet massif :
- **60+ composants** (Map.ts seul = 4000 lignes)
- **100+ services** (earthquakes, conflicts, military, maritime, webcams, etc.)
- **Protobuf RPC** pour la communication client/serveur
- **API protégée par Cloudflare** (`api.worldmonitor.app` retourne 403 pour les appels tiers)
- **CSP bloque l'iframe** (`X-Frame-Options: SAMEORIGIN` + `frame-ancestors` restreint)
- **Sources de données** : USGS, NASA EONET, GDACS, ACLED, UCDP, OpenSky, Windy, FIRMS, etc.

### Ce qui existe déjà dans Fincept (tab News)

| Feature | Statut |
|---------|--------|
| Carte 3D globe (Globe.gl + Three.js) | ✅ Implémenté |
| Carte 2D (Leaflet + OpenStreetMap) | ✅ Implémenté |
| Marqueurs news sur la carte | ✅ Implémenté |
| Breaking news banner | ✅ Implémenté |
| Live TV / HLS / YouTube (14 chaînes) | ✅ Implémenté |
| RSS feeds (backend Rust) | ✅ Implémenté |
| Clustering Jaccard | ✅ Implémenté |
| Keyword monitors + alertes | ✅ Implémenté |
| AI article analysis | ✅ Implémenté |

### Ce qui manque par rapport à WorldMonitor

| Feature WorldMonitor | Complexité | Source de données |
|---------------------|-----------|-------------------|
| Tremblements de terre temps réel | Moyenne | USGS API (public, gratuit) |
| Événements naturels (volcans, feux, tempêtes) | Moyenne | NASA EONET API (public, gratuit) |
| Zones de conflit ACLED/UCDP | Haute | ACLED (nécessite API key), UCDP (public) |
| Bases militaires | Basse | Données statiques (config WorldMonitor) |
| Câbles sous-marins | Basse | Données statiques |
| 45 layers toggleables | Très haute | Multiple sources |
| Country Intelligence Index | Très haute | Calcul composite multi-sources |
| Day/night terminator | Basse | Calcul astronomique |
| Webcams live | Moyenne | Windy.com API |
| Corrélation cross-stream | Très haute | ML/NLP custom |
| Finance radar (92 bourses) | Haute | Multiple API payantes |

## Contraintes

1. **WorldMonitor API inaccessible** : `api.worldmonitor.app` renvoie 403 pour les appels depuis des origines tierces (protection Cloudflare)
2. **Iframe bloqué** : `X-Frame-Options: SAMEORIGIN` empêche l'embedding dans notre app
3. **Pas de lib partageable** : WorldMonitor n'est pas un package npm — c'est un monolithe Vite/Tauri
4. **Map.ts = 4000 lignes** : le composant carte n'est pas extractible facilement

## Approche recommandée

### Phase 1 — Données temps réel sur la carte (sources publiques)

Intégrer directement les API publiques que WorldMonitor utilise :

1. **USGS Earthquakes** (`earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson`)
   - Tremblements de terre M4.5+ des dernières 24h
   - GeoJSON avec lat/lng, magnitude, profondeur, timestamp
   - Rafraîchissement toutes les 5 min

2. **NASA EONET** (`eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=50`)
   - Volcans actifs, feux, tempêtes, inondations
   - GeoJSON avec catégories et coordonnées
   - Rafraîchissement toutes les 15 min

3. **Ajouter les marqueurs** sur la carte 3D/2D existante avec icônes spécifiques (🔴 earthquake, 🔥 wildfire, 🌋 volcano, 🌀 storm)

### Phase 2 — Layers statiques géopolitiques

Extraire les données statiques de WorldMonitor (`/src/config/`) :
- Bases militaires (`military.ts`)
- Zones de conflit (`geo.ts`)
- Installations nucléaires (`irradiators.ts`)
- Câbles sous-marins
- Ports stratégiques

### Phase 3 — Enrichissements avancés

- Day/night terminator overlay
- Country risk scoring (simplifié)
- Webcams via Windy embed
- Corrélation news/événements géopolitiques

## Conclusion

La transposition complète de WorldMonitor est irréaliste dans le cadre actuel (60+ composants, 100+ services, API protégée). L'approche pragmatique est d'intégrer les mêmes sources de données publiques directement dans notre carte existante, en commençant par les données les plus impactantes (earthquakes, natural events, bases militaires).
