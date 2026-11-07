# Daniel’s Soirée

Event-Station für ein iPad im Hochformat: 40. Geburtstag & Gender Reveal.
Die Seite ist rein statisch (HTML, CSS, JavaScript) und braucht keinen Build-Schritt. Als Backend dient Supabase.

**Stationen:** The Guestbook · Baby Predictions · The Party Quiz · Party Beichten (anonym)
**Speicher & Ergebnisse:** kleiner Button unten auf dem Startbildschirm. Alternativ den goldenen Krebs dreimal antippen.

Solange in `js/config.js` keine Supabase-Daten eingetragen sind, läuft die Seite im **Demo-Modus**. Die Daten bleiben dann nur auf dem Gerät, das Passwort ist `soiree`.

---

## So geht nichts verloren

1. Jeder Eintrag wird **zuerst auf dem iPad gesichert** und erst danach an Supabase gesendet.
2. Bricht das WLAN weg, sieht der Gast trotzdem seine Bestätigung. Die Seite sendet den Eintrag automatisch nach, sobald wieder Verbindung besteht. Das passiert alle 15 Sekunden und sofort, wenn das WLAN zurückkommt.
3. Doppelte Einträge entstehen dabei nicht, weil jeder Eintrag schon auf dem iPad eine feste ID bekommt.
4. Unter **Speicher & Ergebnisse** steht oben, ob alles in der Cloud ist oder wie viele Einträge noch warten.
5. Im Tab **Sicherung** gibt es drei Downloads:
   - **Excel:** eine Datei mit je einem Blatt für Gästebuch, Beichten, Predictions und Quiz.
   - **Backup (JSON):** die komplette Cloud-Sicherung.
   - **iPad-Kopie:** jeder Eintrag, der auf diesem iPad gemacht wurde, auch die ohne WLAN.

   Auf dem iPad öffnet sich dafür das Teilen-Menü. Dort kannst du „In Dateien sichern“, AirDrop oder Mail wählen.

👉 **Direkt nach der Party** einmal Excel und Backup herunterladen und sichern.

## 1 · Supabase einrichten (ca. 10 Minuten)

1. Auf [supabase.com](https://supabase.com) ein neues Projekt anlegen. Region: **Frankfurt (eu-central-1)**.
2. **SQL Editor → New query**: Den kompletten Inhalt von `supabase/schema.sql` einfügen und auf **Run** klicken.
3. **Authentication → Users → Add user → Create new user**: Deine E-Mail und ein Passwort eintragen und „Auto Confirm User“ anhaken.
4. Im **SQL Editor** ausführen, mit deiner E-Mail:
   ```sql
   insert into public.admin_users (user_id)
   select id from auth.users where email = 'DEINE@EMAIL.de';
   ```
5. **Authentication → Sign In / Providers**: „Allow new users to sign up“ **ausschalten**.
6. **Project Settings → API Keys**: **Project URL** und **anon / publishable key** kopieren und in `js/config.js` eintragen.
   Der anon-Key darf öffentlich sein. Den `service_role`-Key **niemals** eintragen.

Gäste können nur **einreichen**. Lesen, Markieren, Löschen und Herunterladen geht nur nach dem Login.

## 2 · Inhalte prüfen (`js/config.js`)

- **Quizfragen**: `correct` ist die Position der richtigen Antwort, gezählt ab 0.
- **Emojis**, Inspirationsfragen für die Beichten, Event-Texte.
- `kiosk.idleSeconds`: Nach so vielen Sekunden ohne Berührung springt die Seite zum Startbildschirm und leert alle Felder (Standard 90).
- `kiosk.screensaverSeconds`: Nach so vielen Sekunden ohne Berührung startet der Bildschirmschoner – der Krebs krabbelt über den Bildschirm (Standard 300 = 5 Minuten). Erste Berührung beendet ihn, ohne etwas darunter auszulösen.
- `kiosk.adminIdleSeconds`: Der Bereich „Speicher & Ergebnisse“ meldet sich nach so vielen Sekunden selbst ab (Standard 180). Während einer laufenden Präsentation passiert das nicht.

## 3 · Veröffentlichen (GitHub Pages)

1. Den Inhalt dieses Ordners ins Repository laden.
2. **Settings → Pages → Deploy from a branch →** `main` / `/ (root)`.
3. Nach etwa einer Minute ist die Seite erreichbar unter `https://DEIN-NAME.github.io/REPO-NAME/`.

## 4 · Das iPad als Station einrichten

1. Die Seite in **Safari** öffnen, auf **Teilen → Zum Home-Bildschirm** tippen.
   Sie startet dann im Vollbild ohne Adressleiste, mit dem Krebs als App-Symbol.
2. **Einstellungen → Bedienungshilfen → Geführter Zugriff** einschalten und einen Code festlegen.
   Die App öffnen und **dreimal die Seitentaste** (bzw. den Home-Button) drücken, dann auf **Starten** tippen.
   Jetzt kann niemand die Seite verlassen.
3. **Einstellungen → Anzeige & Helligkeit → Automatische Sperre: Nie**, und das Ladekabel anschließen.
4. Das iPad steht **hochkant**. Die Ausrichtungssperre im Kontrollzentrum aktivieren.
5. Vorher im Gaia Loft das **WLAN** testen.

## 5 · Am Abend

- **Präsentation** (Gästebuch oder Beichten): unter Speicher & Ergebnisse auf „Präsentation starten“ tippen, oder bei einer Karte auf ⛶.
  Weiter geht es mit Tippen auf den linken bzw. rechten Rand, auf einer Tastatur mit den Pfeiltasten. Geöffnete Beichten werden als gelesen markiert.
- „Abmelden & zurück“ führt wieder zum Startbildschirm. Beim Verlassen und beim Neuladen bist du immer abgemeldet.

## Struktur

```
index.html              Einstieg, Szene (Raum aus der Einladung, Licht)
manifest.webmanifest    Home-Bildschirm-App (Hochformat)
css/style.css           Design, inkl. iPad-Hochformat
js/config.js            Supabase-Zugang, Texte, Emojis, Quiz, Kiosk-Zeiten
js/app.js               Stationen, lokale Sicherung, Admin, Export, Präsentation
js/vendor/xlsx…         Excel-Export (lokal, funktioniert auch ohne CDN)
assets/                 Krebs, App-Symbol, Raum-Hintergrund
supabase/schema.sql     Datenbank & Zugriffsregeln
```

Die Seite ist per `noindex` von Suchmaschinen ausgeschlossen.
