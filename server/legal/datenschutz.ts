/**
 * Datenschutzerklärung für SimplaPOS
 * Schweizer Datenschutzgesetz (DSG, rev. 2023), Stand: Juni 2026
 */
export const DATENSCHUTZ_TEXT = `
DATENSCHUTZERKLÄRUNG
SimplaPOS – Cloud-Kassensystem für die Gastronomie

Stand: Juni 2026

1. VERANTWORTLICHE STELLE

Verantwortlich für die Datenbearbeitung im Sinne des Schweizer Datenschutzgesetzes (DSG) ist:
SimplaPOS
(Kontaktdaten gemäss Impressum auf www.simplapos.com)

2. GELTUNGSBEREICH

Diese Datenschutzerklärung informiert über Art, Umfang und Zweck der Bearbeitung personenbezogener Daten im Rahmen der Nutzung der SimplaPOS-Software und der damit verbundenen Dienstleistungen.

3. ERHOBENE DATEN

3.1 Kundendaten (Restaurantbetreiber):
- Firmenname, Adresse, Kontaktdaten (Telefon, E-Mail)
- Name und Kontaktdaten der Ansprechperson
- Bankverbindung und Zahlungsinformationen
- Vertragsdaten und Nutzungshistorie
- MwSt-Nummer

3.2 Mitarbeiterdaten:
- Name, E-Mail-Adresse, Rolle
- Anmeldedaten (verschlüsselt gespeichert)
- Arbeitszeiten und Aktivitätsprotokolle (sofern Modul gebucht)

3.3 Endkundendaten (Gäste des Restaurants):
- Bestelldaten, Zahlungsinformationen
- Reservierungsdaten (Name, Telefon, E-Mail, Personenzahl)
- Treuepunkte und Geschenkkarten-Guthaben
- Bewertungen und Feedback

3.4 Technische Daten:
- IP-Adresse, Browsertyp, Betriebssystem
- Zugriffszeitpunkte und Nutzungsdauer
- Geräte-Identifikatoren

4. ZWECK DER DATENBEARBEITUNG

Wir bearbeiten personenbezogene Daten für folgende Zwecke:
- Bereitstellung und Betrieb der SimplaPOS-Software
- Vertragserfüllung und Abrechnung
- Kundensupport und Kommunikation
- Verbesserung und Weiterentwicklung der Software
- Einhaltung gesetzlicher Aufbewahrungspflichten
- Betrugsprävention und Sicherheit

5. RECHTSGRUNDLAGEN

Die Bearbeitung personenbezogener Daten erfolgt auf folgenden Grundlagen:
- Vertragserfüllung (Art. 31 Abs. 2 lit. a DSG)
- Berechtigte Interessen (Art. 31 Abs. 1 DSG)
- Einwilligung (Art. 6 Abs. 6 DSG), soweit erforderlich
- Gesetzliche Verpflichtungen

6. DATENWEITERGABE

6.1 Wir geben personenbezogene Daten nur in folgenden Fällen an Dritte weiter:
- An Zahlungsdienstleister (z.B. Stripe) zur Zahlungsabwicklung
- An Hosting-Anbieter für den Betrieb der Infrastruktur
- An Behörden, sofern gesetzlich vorgeschrieben

6.2 Unsere Hosting-Infrastruktur befindet sich in der Schweiz und/oder im EWR. Bei einer Datenübermittlung in Drittstaaten stellen wir ein angemessenes Datenschutzniveau sicher (Art. 16 DSG).

7. DATENSICHERHEIT

Wir setzen angemessene technische und organisatorische Massnahmen ein, um Ihre Daten zu schützen:
- Verschlüsselung der Datenübertragung (TLS/SSL)
- Verschlüsselte Speicherung sensibler Daten (Passwörter, Zahlungsdaten)
- Zugriffskontrolle und Rollenmanagement
- Regelmässige Sicherheitsüberprüfungen
- Automatische Backups

8. AUFBEWAHRUNGSDAUER

- Vertragsdaten: 10 Jahre nach Vertragsende (gesetzliche Aufbewahrungspflicht gemäss OR Art. 958f)
- Rechnungsdaten: 10 Jahre (steuerrechtliche Aufbewahrungspflicht)
- Nutzungsdaten: Maximal 12 Monate nach letzter Aktivität
- Endkundendaten: Gemäss den Weisungen des Restaurantbetreibers, maximal 3 Jahre nach letztem Kontakt

9. RECHTE DER BETROFFENEN PERSONEN

Gemäss dem Schweizer Datenschutzgesetz haben Sie folgende Rechte:
- Auskunftsrecht (Art. 25 DSG): Sie können Auskunft über Ihre gespeicherten Daten verlangen.
- Recht auf Berichtigung (Art. 32 Abs. 1 DSG): Sie können die Korrektur unrichtiger Daten verlangen.
- Recht auf Löschung: Sie können die Löschung Ihrer Daten verlangen, sofern keine gesetzliche Aufbewahrungspflicht besteht.
- Recht auf Datenherausgabe (Art. 28 DSG): Sie können Ihre Daten in einem gängigen elektronischen Format verlangen.
- Widerspruchsrecht: Sie können der Bearbeitung Ihrer Daten jederzeit widersprechen.

Zur Ausübung Ihrer Rechte kontaktieren Sie uns unter: datenschutz@simplapos.com

10. COOKIES UND TRACKING

Die SimplaPOS-Software verwendet technisch notwendige Cookies für die Sitzungsverwaltung und Authentifizierung. Es werden keine Tracking-Cookies oder Analyse-Tools von Drittanbietern eingesetzt, die nicht für den Betrieb der Software erforderlich sind.

11. ÄNDERUNGEN

Wir behalten uns vor, diese Datenschutzerklärung jederzeit anzupassen. Die aktuelle Version ist stets über die Software abrufbar. Bei wesentlichen Änderungen informieren wir Sie per E-Mail.

12. KONTAKT UND AUFSICHTSBEHÖRDE

Bei Fragen zum Datenschutz wenden Sie sich an: datenschutz@simplapos.com

Zuständige Aufsichtsbehörde:
Eidgenössischer Datenschutz- und Öffentlichkeitsbeauftragter (EDÖB)
Feldeggweg 1
3003 Bern
www.edoeb.admin.ch
`.trim();
