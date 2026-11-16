# Ledger Sudoku în Azure — one-pager

Proiect final, Cloud Computing (MS Azure) · 16 noiembrie 2026

## Pe scurt

Proiectul mută în Azure aplicația mea [Ledger Sudoku](https://github.com/BrutalArmy04/ledger-sudoku): conturi, progres sincronizat între desktop și web, puzzle-ul zilei generat automat și un clasament comun. Proiect individual, dezvoltat pe branch-ul `azure` al acestui repo; `main` rămâne versiunea publicată până la final.

Punctul de plecare există deja: o aplicație React + Electron (Windows, Linux, macOS și browser), cu generator de puzzle-uri și un grader care clasifică dificultatea după tehnicile de rezolvare necesare. Azi rulează integral pe client, fără backend.

## Problema și obiectivele

Azi tot ce face jucătorul se pierde la închiderea aplicației: statisticile sunt ținute doar în memorie, iar progresul nu trece de pe un dispozitiv pe altul. În plus, statisticile existente sunt calculate greșit („Played” crește doar la victorie, deci win rate-ul e mereu 100%).

Obiective:

- Utilizatorul își face cont și își regăsește statisticile oriunde joacă.
- Toți jucătorii primesc același puzzle al zilei, cu un clasament comun.
- Serverul validează soluțiile trimise, ca să conteze doar rezultatele reale.
- Aplicația rămâne jucabilă offline; sincronizarea se face când revine conexiunea.

## Funcționalități

MVP-ul e ce livrez sigur până la 11 ianuarie; restul intră doar dacă rămâne timp și buget.

- **MVP:** conturi și autentificare; statistici salvate, sincronizate și corectate; puzzle-ul zilei generat automat în fiecare noapte; clasament cu validarea soluției pe server; endpoint `/api/health` cu versiunea rulată.
- **Opțional:** salvarea jocului în curs în cloud; banca de puzzle-uri în Blob Storage; versiunea web mutată de pe GitHub Pages în Azure.

## Arhitectura în Azure

Aplicația vorbește doar cu API-ul, după login prin Entra ID; bazele de date și fișierele nu sunt expuse public.

API-ul citește și scrie statisticile în Azure SQL; funcția rulează noaptea, generează puzzle-ul zilei cu motorul existent și îl salvează. Toate componentele trimit telemetrie în Application Insights, iar infrastructura se creează din cod prin GitHub Actions.

## Cum acoperă criteriile de notare

Fiecare criteriu din barem are cel puțin un serviciu cu rol real în aplicație, nu adăugat doar ca să bifeze.

- **Compute:** App Service (API-ul), Azure Functions (puzzle-ul zilei)
- **Storage:** Azure SQL, Blob Storage
- **Networking:** VNet, private endpoints, acces public dezactivat pe date
- **Security:** Entra ID, Managed Identity, Key Vault
- **Observabilitate:** Application Insights
- **Deployment:** Bicep sau Terraform, GitHub Actions
