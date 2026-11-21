# Vorbereitung der ersten iOS-Store-Version

Stand: 29. Oktober 2026.

- Öffentliche Datenschutzerklärung in Englisch und Deutsch veröffentlicht.
- Privacy-Policy-Link auf Login, Profilübersicht und im Session-Menü eingebaut.
- Store-Name **Talktome Intercom**, Kategorie **Produktivität**,
  Texte in Englisch (UK) und Deutsch sowie Support-/Datenschutz-URLs vorbereitet
  und im bearbeitbaren App-Store-Entwurf gespeichert.
- Kostenloser Preis eingerichtet; öffentliche Freigabe erfolgt manuell.
- Build 33 mit Datenschutz-Link in TestFlight verfügbar.
- Build 34 wurde lokal gebaut, von Apple verarbeitet und ist in der internen
  TestFlight-Gruppe „Team“ verfügbar. Er ergänzt die Audioauswahl innerhalb der App, einen neutralen,
  abgerundeten Play-Pfeil und Scene-Start für das iOS-27-SDK.

- Build 35 wurde lokal gebaut, von Apple verarbeitet und ist in der internen
  TestFlight-Gruppe „Team“ verfügbar. Er entfernt die nicht
  unterstützte iPhone-Ohrhöreroption und ergänzt unter Session → Accessories
  die Watch-Mehrfachauswahl einschließlich Reply. Ein gewähltes Ziel erscheint
  auf der Watch bildschirmfüllend; mehrere als Liste. Die Auswahl bleibt pro
  Profil und Produktion gespeichert.

Der aktuelle Metadatenstand steht in
[app-store.json](../mobile-app/store/app-store.json).
Die noch zu bestätigenden Datenschutz-/Altersfragen und Review-Schritte stehen in
[privacy-and-age-rating.de.md](../mobile-app/store/privacy-and-age-rating.de.md).

TestFlight ist keine öffentliche Store-Veröffentlichung. Vor der Einreichung sind
Gerätetests und ein für Apple erreichbarer Review-Server samt Demo-Zugang nötig.
Die englische Review-Anleitung und beide Demo-Konten sind im privaten
App-Review-Bereich hinterlegt. Beide Konten konnten sich am primären HTTPS-Server
anmelden und haben gegenseitige Sprechberechtigung in derselben Produktion.
Ein echter Zweiwege-Audiotest steht noch aus. Die Backup-Adresse verwendet ein
selbstsigniertes Zertifikat; der private Text erklärt dessen Host-Pinning.
Die öffentliche [Review-Vorlage](../mobile-app/store/app-review-instructions.en.md)
enthält keine Zugangsdaten.

Die Store-Screenshots liegen unter
[mobile-app/store/screenshots](../mobile-app/store/screenshots/manifest.json)
und sind in den englischen und deutschen Store-Entwurf hochgeladen.
Die öffentliche App-Oberfläche ist derzeit Englisch.

Validierung: 423 mobile Tests, TypeScript, iOS-/Android-Bundle-Export und nativer
Swift-Routing-Test erfolgreich. Simulator: Login und Datenschutz-Link vor/nach
Anmeldung, Audio-Menü schließen und außerhalb antippen geprüft. Vorher/Nachher-
Aufnahmen nach „Done“ sind einschließlich der Statusleiste pixelgleich. Die
Screenshot-Kopie deaktiviert ausschließlich im Simulator Audio-I/O wegen eines
RemoteIO-RPC-Absturzes. Deshalb ersetzt dies keine Hör-/AirPods-Prüfung auf echter
Hardware; die veröffentlichte Geräte-App enthält diese Simulator-Anpassung nicht.

Build 35: Watch-Auswahl (ein Ziel, mehrere Ziele, Reply und Wiederherstellung
nach Neustart) im gekoppelten iPhone-/Watch-Simulator geprüft. Geänderte iPhone-Storebilder
auf Build 36 aktualisiert, einschließlich der Watch-Auswahl und des nativen
iOS-Ausgabesymbols. Bilder der aufgegebenen eigenen Audioauswahl entfernt.
Das allgemeine iPad-Bild bleibt mit Build-34-Herkunft im Manifest gekennzeichnet.
Das Watch-Bild zeigt die einzelne Reply-Vollbildansicht aus einer nativen
Build-36-Simulator-Aufnahme; das sichtbare Ruhe-Layout ist in Build 38 unverändert.

Englische und deutsche TestFlight-Testhinweise sind bei Build 34 und 35 hinterlegt.

Build 36: Apples originales Ausgabebedienelement und System-Geräteliste
wiederhergestellt. Alte gespeicherte App-/Panel-Ausgaben werden bei iOS-Anmeldung
nicht über die aktuelle Systemroute gelegt. Die Systemliste wird nicht gefiltert;
deren mögliche optische Wechsel bleiben iOS überlassen.

Watch: Vollbild unterstützt links Wischen zum Einrasten und Antippen zum Stoppen.
Zwei Ziele verwenden feste obere/untere Tasten, weitere Ziele eine Liste. Bei
gewählter externer iPhone-Ausgabe spielt der Bereitschaftston auf dieser Ausgabe
und nicht auf Watch. Phone und Watch müssen gemeinsam aktualisiert werden.

Die Zweierdarstellung und der Start-/Lock-/Loslass-/Stop-Protokollablauf wurden
im gekoppelten Simulator geprüft. Eine zusätzliche temporäre Watch-Teststeuerung
übte die Kommandos aus; sie ist nicht im Gerätebuild enthalten. Physische
Swipe-Gesten, AirPods-Wechsel, Headset-Ton und das iOS-Systemmenü sind auf echten
Geräten zu prüfen.

Build 36 ist von Apple verarbeitet und in der internen TestFlight-Gruppe „Team“
verfügbar. Englische und deutsche Testhinweise sind hinterlegt. Die aktualisierten
iPhone-Bilder sind in beiden Store-Sprachen vollständig verarbeitet.

Build 37 vereinheitlicht die Watch-Halte-/Swipe-Geste für Einzelziel, Zweieransicht
und Liste. Jede Sprechaktion erhält die Vollbildanzeige; „Talking · Ziel“ und
Swipe-Hinweis stehen im oberen Bildschirmbereich. Die Zweieransicht nutzt die
vertikale Fläche bis an die Bildschirmränder. Das eingerastete Vollbild kann
überall zum Stoppen angetippt werden. Zusätzliche native Swift-Gestentests prüfen
Wischrichtung, Abstand am linken Rand, Abbruch und Loslassen nach dem Einrasten.

Build 37 wurde lokal als Version 1.0.0 (37) gebaut, von Apple als gültig verarbeitet
und ist in der internen TestFlight-Gruppe „Team“ verfügbar. Englische und deutsche
Testhinweise sind hinterlegt. 423 Mobile-Tests, TypeScript, native Routing- und
Gestenzustandstests sowie der Produktionsbuild für iPhone, Widget und Watch sind
erfolgreich. Zweieransicht und Vollbild aus Zweieransicht/Liste wurden als native
Simulator-Vorschauen kontrolliert. Die tatsächlichen Touch-Gesten und Audiogeräte
benötigen weiterhin einen Gerätetest; dafür auch die Watch-App aktualisieren.

Build 38 wurde lokal mit der Korrektur für getrennte Watch-Reply-/Festziel-Buttons
gebaut (Quellstand `d1df053`). Reply behält einen eigenen Platz, auch bei identischem
Ziel oder ohne aktuellen Gesprächspartner. 426 Mobile-Tests, TypeScript und native
Swift-Gesten-/Modellprüfungen sind erfolgreich. Der Produktionsbuild enthält die
korrekten App-/Widget-/Watch-IDs und Team-Signierung; keine Simulator-Teststeuerung.

In App Store Connect sind Altersfragen gespeichert, die deutsche Datenschutz-URL
lokalisiert, der kostenlose Preis kontrolliert und vorläufig alle 175 aktuellen
Store-Regionen ausgewählt. Neue Regionen werden nicht automatisch hinzugefügt.
Die Veröffentlichung steht wieder auf manuell. Review-Text und private Anleitung
erklären die getrennten Reply-Buttons. Zugangsdaten bleiben im privaten Bereich.

Der Accountinhaber muss Datenschutzlabel, Inhaltsrechte und EU-Händlerstatus
abschließen sowie den Gerätetest durchführen. Apple meldet den fehlenden
Händlerstatus für 27 EU-Regionen. Die genauen Klicks stehen in der
[Übergabe zur Einreichung](../mobile-app/store/release-handoff.de.md).
Das Statusleistenflackern beim Schließen von Apples Audioauswahl bleibt als
bekannte optische Unschönheit bestehen; die System-Geräteauswahl bleibt erhalten.

Expo Doctor meldet weiterhin Versions-/Verzeichnis-Hinweise und warnt pauschal
vor einer Hermes-V1-Speicherregression. Laut Expo betrifft die beschriebene
Speicherregression Apps mit Worklets/Reanimated; beide Pakete sind hier nicht
installiert/importiert. Dies wurde nicht durch einen SDK-Wechsel im Release
verändert. [Expo-Hinweise](https://expo.dev/changelog/sdk-57#known-regressions)

Apple hat Build 38 als gültig verarbeitet; er ist in der internen TestFlight-Gruppe
„Team“ verfügbar und im Store-Entwurf für Version 1.0.0 ausgewählt. Englische und
deutsche TestFlight-Hinweise sind gespeichert. Keine App-Prüfung eingereicht.

Store-Grafiken: „Kopfzeile und Suchergebnisse“ bleibt optional leer. Duo-Bilder
werden für diese erste Einreichung noch nicht ergänzt; zunächst die tatsächliche
Duo-Ansicht testen. Der bisherige Watch-Listen-Screenshot wird in beiden
Store-Sprachen durch die einzelne Reply-Vollbildansicht ersetzt.
