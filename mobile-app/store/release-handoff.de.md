# Letzte Schritte vor App Review

Stand: 29. Oktober 2026. App: **Talktome Intercom**, Version **1.0.0**.

## In App Store Connect vorbereitet

- **Build 38 (1.0.0)** ist von Apple verarbeitet, in der internen TestFlight-Gruppe
  „Team“ verfügbar und im Store-Entwurf ausgewählt. Deutsche und englische
  Testhinweise sind hinterlegt; die neue Reply-Korrektur ist enthalten.
- Englische und deutsche Texte, Produktivitäts-Kategorie, Screenshots und Support-Link.
- Öffentliche Datenschutzerklärung und lokalisierter deutscher Link.
- Kostenloser Preis; vorläufig alle 175 aktuellen Regionen. Neue Regionen werden
  nicht automatisch hinzugefügt. Diese Auswahl kann vor der Einreichung eingeschränkt werden.
- Altersfragen gespeichert: private Sprachkommunikation unter „Messaging und Chat“;
  keine öffentliche Plattform zur breiten Verteilung von Nutzerinhalten. Apple
  berechnet überwiegend 4+, mit regional abweichenden Ergebnissen.
- Private Review-Anleitung, zwei Demo-Konten und vollständige Review-Kontaktdaten.
- **Manuelle Veröffentlichung** nach einer erfolgreichen App-Prüfung.

„Kopfzeile und Suchergebnisse“ bleibt leer: diese zusätzlichen Creative Assets
sind optional. iPhone-Duo-Screenshots werden für die erste Einreichung noch nicht
ergänzt; Apple nennt April 2027 als Pflichttermin (die technischen Spezifikationen
nennen Apps mit iOS-27.1-SDK oder neuer). Vor einer solchen Ergänzung die echte
Duo-Ansicht testen. [Apple: Screenshots](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications),
[Apple: optionale Creative Assets](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-your-app-store-assets)

## Vom Accountinhaber zu erledigen

1. **App-Datenschutz prüfen und veröffentlichen.** App → App-Datenschutz → Erste
   Schritte bzw. Bearbeiten. Für den bestätigten reinen Client-Betrieb ohne eigenes
   Hosting/Analyse ist „Nein, wir erheben keine Daten aus dieser App“ vorbereitet.
   Speichern und oben „Veröffentlichen“ abschließen. Falls das Label bereits
   veröffentlicht ist, auf Richtigkeit prüfen. Der Zustand ist über die verfügbare
   API nicht einsehbar. [Apple-Anleitung](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy)
2. **EU-Händlerstatus festlegen.** Apple meldet `TRADER_STATUS_NOT_PROVIDED`.
   Geschäftliches → Vereinbarungen → Compliance → Digital Services Act. Die
   Selbsteinstufung und gegebenenfalls Verifikation der Kontaktdaten übernimmt der
   Accountinhaber. [Apple-Anleitung](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements)
3. **Inhaltsrechte beantworten.** App → App-Informationen → Inhaltsrechte. Die
   Erklärung ist noch leer. Anhand der tatsächlich angebotenen Inhalte entscheiden,
   insbesondere ob über Programm-Feeds fremde Inhalte zugänglich werden und dafür
   erforderliche Rechte vorliegen. Diese Erklärung kann der Client-Code nicht ersetzen.
4. **Build 38 auf echten Geräten prüfen.** iPhone und Watch gemeinsam aktualisieren:
   Zweiwege-Audio am Review-Server, AirPods/Lautsprecher-Wechsel, Hintergrundbetrieb,
   QR-Anmeldung, Watch-Reply plus feste Ziele, Swipe-to-lock und Tap-to-stop.
   Das bekannte kurze Statusleistenflackern beim Schließen von Apples Audioauswahl
   bleibt bestehen. Physische Audiogeräte und Touch-Gesten sind nicht vollständig
   durch die automatisierten Tests abgedeckt.
5. **Entwurf durchsehen und zur Prüfung einreichen.** Version, Build, Länder,
   Altersangaben und Store-Texte kontrollieren. Danach „Zur Prüfung hinzufügen“ und
   „Zur Prüfung einreichen“. Die öffentliche Freigabe bleibt anschließend manuell.

Es wurde keine App-Prüfung und keine öffentliche Veröffentlichung ausgelöst.
Zugangsdaten stehen ausschließlich in den privaten Review-Unterlagen.
