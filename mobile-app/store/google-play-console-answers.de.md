# Play Console: Antworten und letzte Schritte

Stand: 30. Oktober 2026, Android 1.0.0 (39), `com.talktome.mobile`.
Dies ist eine Ausfüllhilfe. Die folgenden Fragebögen wurden **nicht** in der
Console gespeichert. Einträge, die dort bereits vorhanden sind, zuerst prüfen.

## Aktuell bei Google geprüft

- AAB 39, deutsche und englische Store-Texte, Icon und Feature-Grafiken sind gespeichert.
- `internal` und `alpha` enthalten Build 39 als Entwurf. Kein Produktionsrelease.
  Dieser Build enthält den Android-Fix für Einstellungen, Navigationsleisten-Abstand
  und Disconnect beim Schließen aus der App-Übersicht (Issue #186 / PR #187).
- In beiden Store-Sprachen fehlen echte Android-Telefon-Screenshots.
- Der geschlossene Test übernimmt die Produktions-Länderauswahl
  (`syncWithProduction: true`). Die API liefert für Produktion keine Länderliste.
  Deshalb in der Console die Länder ausdrücklich auswählen und kontrollieren.
- Eine Freigabeprüfung in einer anschließend verworfenen API-Transaktion wurde
  mit „Only releases with status draft may be created on draft app“ abgewiesen.
  Die App-Einrichtung muss zuerst abgeschlossen werden. Keine Testfreigabe wurde
  dadurch gespeichert oder gestartet.
- E-Mail-Testerlisten sind über die hier verfügbare API nicht lesbar oder pflegbar.
  Eine leere Google-Gruppen-Liste sagt nichts über vorhandene E-Mail-Listen aus.

## Store-Einstellungen

| Feld | Eintrag |
| --- | --- |
| App-Name | Talktome Intercom |
| App oder Spiel | App |
| Kategorie | Produktivität / Productivity |
| Preis | Kostenlos |
| Sprachen | Englisch (USA), Deutsch |
| Support | talktome@platonstudio.de |
| Website | https://github.com/thepoison606/talktome |
| Datenschutzerklärung | https://platonstudio.de/talktome/privacy/ |
| Länder | Alle gewünschten verfügbaren Länder; für weltweiten Start „Alle Länder/Regionen“ prüfen |

Kategorie, Preis, Länder und Datenschutz-Link lassen sich mit den verwendeten
Store-Listing-Endpunkten nicht setzen. Die Support-Adresse und Website sind gespeichert.

## App-Inhalte

Die Punkte stehen innerhalb der App unter „App-Inhalte“; die Navigation kann je
nach Console-Version „Richtlinien“ oder „Überwachen und verbessern“ heißen.

### App-Zugriff

**Alle oder einige Funktionen sind eingeschränkt**, da ein Server und ein
Operator-Konto nötig sind. Zugangsanleitung aus der privaten Datei
`~/Library/Application Support/Talktome/review/google-play-app-access.en.md`
in den geschützten Console-Bereich übernehmen. Dort sind die beiden echten
Review-Zugänge enthalten. Keine Passwörter in Store-Beschreibungen oder Git ablegen.

Die Anleitung enthält Anmeldung, Mikrofonfreigabe, einen Test mit zwei Teilnehmern
und den Backup-Server. Vor Einreichung auf zwei Geräten gegenseitiges Audio prüfen.

### Werbung und sonstige Funktionsangaben

| Frage | Antwort für den aktuellen App-Code |
| --- | --- |
| Enthält Werbung? | Nein |
| In-App-Käufe / Abonnements? | Nein |
| Nachrichten-/Presse-App? | Nein |
| Gesundheitsfunktionen? | Keine |
| Finanzfunktionen? | Keine |
| Staatliche App? | Nein |
| Standortfunktion? | Nein. Die ältere Android-Berechtigung dient dem Bluetooth-Scan, nicht GPS oder einer Standortübertragung. |

Nur beantworten, wenn die Console die jeweilige Frage tatsächlich stellt.

### Zielgruppe und Inhaltsbewertung

Vorschlag zur Bestätigung: **18 Jahre und älter** als beabsichtigte Zielgruppe
des Team-/Produktionswerkzeugs. Das ist eine Zielgruppenentscheidung, keine
Behauptung über eine automatisch berechnete Altersfreigabe.

Für den IARC-Fragebogen:

- Kontakt: `talktome@platonstudio.de`.
- Direkte Kommunikation zwischen Nutzern: **Ja** (Live-Sprachkommunikation).
- Kein öffentlicher Social-Media-Feed und kein allgemeiner In-App-Webbrowser.
- Keine eingebauten Inhalte zu Gewalt, Sexualität, Glücksspiel oder Drogen.
- Keine Standortfreigabe an andere Nutzer, keine Käufe und keine Werbung.
- Bei Fragen zu nutzergenerierten Inhalten den genauen Wortlaut beachten:
  Sprachkommunikation ist von Nutzern erzeugt; nicht pauschal jede solche Frage
  mit Nein beantworten. Private Team-Kommunikation ausdrücklich berücksichtigen.

Die regionale Altersfreigabe berechnet IARC. Die Apple-Einstufung nicht übernehmen.
[Google: Zielgruppe](https://support.google.com/googleplay/android-developer/answer/9867159)

## Datensicherheit: auf den Android-Code abgestimmter Entwurf

**Erhebt oder teilt die App relevante Daten? Ja.** Die Übertragung an den vom
Nutzer gewählten Server ist für diesen Fragebogen relevant, auch ohne eigenes
Hosting-Angebot des Herausgebers. Rein lokale QR-Kamerabilder zählen nicht dazu.
„Nur kurzzeitig verarbeitet“ befreit nicht vom Ausfüllen.
[Google: Datensicherheit](https://support.google.com/googleplay/android-developer/answer/10787469)

| Datentyp | Tatsächliches Verhalten | Vorschlag für Zweck und Erforderlichkeit |
| --- | --- | --- |
| Name | Anzeigename/Spitzname geht bei Anmeldung und Signalisierung an den Server | App-Funktion und Anmeldung; für eine Operator-Sitzung erforderlich, kein Klarname nötig |
| Nutzer-IDs | Kontokennung, Benutzername und Sitzungskennung identifizieren den Operator | App-Funktion/Kontoverwaltung; für Anmeldung erforderlich |
| Audio → Sprach- oder Tonaufnahmen | Live-Mikrofon-Audio wird an den Medienserver und ausgewählte Gesprächspartner übertragen; die App erstellt keine Audio-Dateiaufnahme | App-Funktion; Senden ist vom Nutzer steuerbar, reines Zuhören übermittelt keine Sprache |
| Geräte- oder andere IDs | Audio-Ausgangskennungen und Gerätenamen werden im Remote-Panel-Status an unterstützende Server gemeldet | App-Funktion; wird bei unterstützten angemeldeten Operator-Sitzungen automatisch gemeldet |
| App-Aktivität → App-Interaktionen | Sprech-/Lock-Ziele, Feed- und Lautstärkeeinstellungen sowie Bedienzustände gehen an den Server | App-Funktion und serverseitige Bedienung/Einstellungen; Teil der verbundenen Sitzung |

Für alle Tabellenzeilen zunächst **„erhoben“** berücksichtigen. „Geteilt“ separat
prüfen: Google kennt eine Ausnahme für ausdrücklich vom Nutzer veranlasste,
erwartete Übermittlungen. Serverwahl und gezieltes Sprechen passen grundsätzlich
dazu; das ist die Begründung für den Vorschlag „keine deklarationspflichtige
Weitergabe“, keine Aussage, dass kein Server oder Gesprächspartner Daten erhält.

Keine pauschale Zusage „alles nur flüchtig“: Konten und Einstellungen können auf
dem Server gespeichert und Anmeldungen protokolliert werden. Live-Audio wird im
Client nicht aufgezeichnet; eine Zusage zur ausschließlichen RAM-Verarbeitung
aller unabhängig betriebenen Server wäre durch den Client-Code nicht belegt.
Diese Detailantworten deshalb anhand der eingesetzten Serverkonfiguration prüfen.

Weitere Antworten:

- **Transportverschlüsselung:** Ja für die vorgesehenen App-Verbindungen:
  Serveradresse und QR-Verbindung verlangen HTTPS, Audio nutzt WebRTC/DTLS-SRTP.
  Eine bewusste Zertifikatsfreigabe ist weiterhin TLS. Das ist keine durchgehende
  Ende-zu-Ende-Verschlüsselung gegenüber dem Medienserver. Bei abweichenden
  Server-/Redirect-Konfigurationen die tatsächliche Verbindung zuerst prüfen.
- **Kontoerstellung:** Kein Registrierungsablauf für dauerhafte Konten in der App;
  bestehende Serverkonten oder vom Server erlaubte Gast-Sitzungen. Auch kein Link
  zu einer dauerhaften Konto-Registrierung. Die konkrete Console-Auswahl dafür
  verwenden; nicht „Kontoerstellung mit Benutzername/Passwort“ nur wegen Login wählen.
- **Löschen:** Lokales Profilentfernen löscht kein Serverkonto. Eine universelle
  Server-Datenlöschung bietet der Client nicht. Kein unbelegtes globales
  Löschversprechen auswählen. Auskunft/Löschung beim jeweiligen Serverbetreiber;
  Datenschutzkontakt für Daten beim Herausgeber wie in der Erklärung.
- Kein Werbe-/Tracking-SDK oder eigener Analytics-/Crash-Upload im App-Code gefunden.
  Lokale Konsolenlogs sind kein eigener Diagnose-Upload. Google Play kann separat
  Plattform-Diagnosedaten verarbeiten.
- Keine GPS-Daten, Adressbücher, Fotos, Videos, Finanz- oder Gesundheitsdaten werden
  von den geprüften Client-Funktionen ausgelesen und hochgeladen. Server-/IP-Adressen
  sind technisch sichtbar; eine daraus abgeleitete Standortauswertung wurde nicht
  im Client implementiert.
- Kein unabhängiges Sicherheitszertifikat/MASA-Badge behaupten.

Codegrundlage: `src/auth/apiClient.ts`, `src/signaling/client.ts`,
`src/servers/parseServerAddress.ts`, `src/servers/parseConnectPayload.ts`,
`src/media/engine.ts`, `src/session/remotePanelCoordinator.ts` und die nativen Module.
Die Auswertung gilt für Build 38 und 39; der Fix in 39 ändert Layout und
Sitzungsbeendigung, keine der hier beschriebenen Datenübertragungen.
Keine Datensicherheits-Erklärung wurde
über die schreibende API eingereicht; vorhandene Antworten wären dadurch überschrieben.

[Google: Konto-Löschung](https://support.google.com/googleplay/android-developer/answer/13327111)

## Foreground Services: englische Texte zum Einfügen

Das hochgeladene AAB deklariert `microphone`, `mediaPlayback` und `connectedDevice`.
Für die von der Console angefragten Typen jeweils Beschreibung, Auswirkung einer
Unterbrechung und den Link zum echten Android-Nachweisvideo eintragen.

### MICROPHONE — Background Audio Access

> Talktome is a live team intercom client. After the user connects to their chosen
> server and grants microphone permission, they can transmit using push-to-talk
> or a deliberately locked talk target. The active intercom session can continue
> while the app is in the background. A persistent session notification provides
> a Disconnect action. The app does not save voice recordings. Delaying or
> interrupting the service would cut off live speech and break team communication.

### MEDIA_PLAYBACK — Media Playback

> After the user starts an intercom session, Talktome plays incoming live speech
> and user-selected audio feeds. Playback continues when the user switches apps
> or locks the screen, with a persistent session notification and Disconnect
> action. Delaying or interrupting playback would cause the user to miss live
> calls and production cues. Playback belongs to the user-started session, not an
> automatic soundtrack on app launch.

### CONNECTED_DEVICE — Continuous Data Transfer to an External Device

> The user can pair and connect a compatible external Bluetooth push-to-talk
> accessory in Talktome's Accessories settings and assign its button targets.
> During the active intercom session, Talktome receives accessory button events
> so the user can start and stop live transmission while the app is in the
> background. Delaying or interrupting this connection would make the physical
> push-to-talk control stop working. The session can be ended in the app or using
> the notification's Disconnect action.

Diese letzte Erklärung braucht einen **tatsächlichen kompatiblen PTT-Button**.
Ein normaler Bluetooth-Audio-Kopfhörer allein belegt den Zubehör-Steuerkanal nicht.

### Aufnahmeplan für ein gemeinsames Nachweisvideo

1. Android-Bildschirmaufnahme starten; keine privaten Passwörter zeigen.
2. Bereits eingerichtetes Review-/Demo-Profil verbinden, Mikrofon erlauben.
3. Mit zweitem Gerät eingehende Sprache zeigen; selbst ein Ziel drücken und sprechen.
4. Sprechen gezielt locken, App in den Hintergrund schicken; das zweite Gerät
   zeigt/hört die fortlaufende Übertragung. Dann Übertragung stoppen.
5. Einen Feed oder eingehende Sprache bei minimierter App hörbar demonstrieren.
6. Dauerhafte Talktome-Benachrichtigung mit Disconnect zeigen.
7. Für `connectedDevice`: Accessories öffnen, echten kompatiblen Button verbinden,
   Ziel zuweisen und Sprechen/Loslassen über den Button demonstrieren, auch bei
   minimierter App.
8. Sitzung mit Disconnect beenden. Video ohne Zugangsdaten für Google erreichbar
   bereitstellen und denselben Link bei passenden Service-Typen eintragen.

[Google: Foreground-Service-Nachweise](https://support.google.com/googleplay/android-developer/answer/13392821)

## Android-Screenshots

Mindestens zwei echte Aufnahmen, beispielsweise:

1. Verbundene Operator-Ansicht mit freigegebenen Demo-Zielen und aktiver Konferenz.
2. Dieselbe App beim Sprechen oder mit bewusst gelocktem Ziel.
3. Optional Accessories/Einstellungen mit tatsächlich verbundenem PTT-Zubehör.

PNG/JPEG, Portrait beispielsweise 1080 × 1920; keine Passwörter, privaten
Produktionsnamen oder Dialoge über der UI. Die vorhandenen iOS-/Watch-Bilder nicht
umetikettieren. Hier ist weder ein Android-SDK/Emulator noch eine bedienbare
Android-Geräteverbindung verfügbar; deshalb wurden keine Aufnahmen vorgetäuscht.

[Google: Store-Grafiken](https://support.google.com/googleplay/android-developer/answer/9866151)

## Test freischalten

1. App-Dashboard: offene Einrichtungsaufgaben anhand der Angaben oben abschließen.
2. Geschlossener Test → Alpha → Länder/Regionen kontrollieren und auswählen.
3. Tester → E-Mail-Liste erstellen/auswählen, Google-Konten der Tester eintragen,
   Liste dem Track zuweisen. Feedback: `talktome@platonstudio.de`.
4. Release 1.0.0 (39) prüfen und den geschlossenen Test zur Prüfung/Freigabe senden.
5. Sobald der Track verfügbar ist, den **von der Console angezeigten** Teilnahme-Link
   an die freigeschalteten Personen geben. Keine Einladungen wurden automatisch versendet.
6. Teilnehmer müssen dem geschlossenen Test mit genau diesem Google-Konto beitreten.
   Erst dann installieren und testen. Mindestens zwölf bleiben 14 Tage durchgehend
   angemeldet; danach Produktionszugang beantragen. Interner Test zählt nicht mit.

Anleitung für Tester: [google-play-beta-test.de.md](google-play-beta-test.de.md).

[Google: Testanforderungen](https://support.google.com/googleplay/android-developer/answer/14151465)
