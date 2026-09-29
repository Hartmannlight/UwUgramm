# Betrieb mit Docker und PostgreSQL

Voraussetzung: Docker mit Compose v2 sowie ein HTTPS-Reverse-Proxy fÃ¼r die Domain.

```bash
cp .env.example .env
# .env bearbeiten: Domain, drei unabhÃ¤ngige Zufallswerte und Google-Zugangsdaten.
# Je Wert: openssl rand -hex 32
chmod 600 .env
docker compose up -d --build
docker compose ps
```

`POSTGRES_PASSWORD` sollte hexadezimal sein, da es in einer Datenbank-URL verwendet wird.
`SECRET_KEY` und `IDENTITY_KEY` mÃ¼ssen unabhÃ¤ngig und mindestens 32 Zeichen lang sein.
Die API verweigert den Produktionsstart mit den BeispielschlÃ¼sseln oder ohne HTTPS-Origin.
Den Identity-Key dauerhaft sichern: Ein Wechsel wÃ¼rde die Zuordnung bestehender Google-Konten Ã¤ndern.

Nginx ist unter **127.0.0.1:8080** erreichbar. Der bestehende Reverse Proxy leitet die
gewÃ¤hlte Domain dorthin und Ã¼bernimmt HTTPS, HSTS und Zertifikatserneuerung. API und
PostgreSQL verÃ¶ffentlichen keine Host-Ports. Migrationen laufen vor der API automatisch.
Der Subnetzbereich `172.30.20.0/24` muss auf dem Host frei sein; bei Anpassung auch
`FORWARDED_ALLOW_IPS` Ã¤ndern. Alle Runtime-Container auÃŸer PostgreSQL verwenden ein
schreibgeschÃ¼tztes Dateisystem; die API lÃ¤uft ohne Root-Rechte.

Rate-Limits verwenden standardmÃ¤ÃŸig die Peer-IP von Nginx. Hinter einem weiteren
Proxy ist das ggf. dessen IP, wodurch alle Besucher ein Limit teilen. FÃ¼r einen
Ã¶ffentlichen Betrieb Nginx `set_real_ip_from` ausschlieÃŸlich auf die konkrete
vertrauenswÃ¼rdige Proxy-Adresse begrenzen und `real_ip_header X-Forwarded-For` setzen.
Niemals beliebige Ã¶ffentliche Forwarded-Header vertrauen.

### Google einrichten

1. In der Google Cloud Console einen OAuth-Client vom Typ **Webanwendung** erstellen.
2. Consent-Screen konfigurieren; wÃ¤hrend der Testphase die gewÃ¼nschten Testkonten freigeben.
3. Die exakte Redirect-URL eintragen:
   `https://deine-domain.example/api/auth/callback`.
4. `GOOGLE_CLIENT_ID` und `GOOGLE_CLIENT_SECRET` nur in der serverseitigen `.env` setzen.
5. `APP_ORIGIN=https://deine-domain.example` ohne Pfad setzen und API neu starten.

Es wird nur `openid` angefordert. Keine E-Mail, Namen, Avatare oder Google-Tokens
werden persistiert. Eine HMAC-basierte Kontokennung ist dennoch ein pseudonymes
personenbezogenes Datum. Projektinhalte kÃ¶nnen ebenfalls personenbezogene Daten enthalten.
Siehe [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect).

### Daten und Betrieb

PostgreSQL liegt im Volume `postgres_data`. RegelmÃ¤ÃŸige verschlÃ¼sselte Backups,
getestete Wiederherstellung, Betriebssystem-/Image-Updates und ein passendes
LÃ¶sch-/Aufbewahrungskonzept gehÃ¶ren zum Betrieb. `docker compose down` erhÃ¤lt das
Volume; **`down -v` lÃ¶scht die Daten**. Im Konto-Dialog kÃ¶nnen Benutzer ihre
Cloud-Daten inklusive Sitzungen und Freigaben lÃ¶schen. Bereits erstellte fremde
Kopien bleiben beim jeweiligen Besitzer; Backups folgen ihrer eigenen Aufbewahrung.

Zugriffslogs sind standardmÃ¤ÃŸig deaktiviert, um IPs und OAuth-Queries nicht zu speichern.
Auch der vorgeschaltete Reverse Proxy sollte keine OAuth-Queries, Cookies oder Inhalte loggen.
Abgelaufene Sitzungen/Freigaben und Rate-Buckets werden bei rate-limitierten Aktionen bereinigt.
Keine Analytics, externen Fonts oder CDN-Scripts. Alle Schriftarten liegen im Frontend-Bundle.
