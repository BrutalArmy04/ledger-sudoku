# Ledger Sudoku în Azure — one-pager

Proiect final, Cloud Computing (MS Azure) · 26 noiembrie 2026

Proiectul construiește în Azure backend-ul pentru [Ledger Sudoku](https://github.com/BrutalArmy04/ledger-sudoku): un API ASP.NET Core, o funcție programată, o bază de date SQL și Blob Storage, într-un VNet privat, cu identități gestionate, monitorizare și deployment din cod. Clientul existent (React + Electron) doar consumă API-ul; GitHub Pages și buildurile Electron rămân distribuția clientului și nu fac parte din livrabilul de cloud.

## Ce necesită backend și stocare

Azi aplicația rulează integral pe client, iar setările și statisticile stau în localStorage, deci rămân pe un singur dispozitiv. Patru funcționalități noi nu se pot face fără server:

- **Conturi și statistici sincronizate.** Istoricul jocurilor trebuie să existe în afara dispozitivului, ca să fie regăsit pe desktop și pe web. → API + Azure SQL.
- **Puzzle-ul zilei.** Același puzzle pentru toți jucătorii, generat o dată pe zi pe server, nu pe fiecare client. → Azure Function cu timer + SQL.
- **Clasament cu validarea soluției.** Clientul nu e de încredere: serverul verifică soluția față de puzzle-ul emis de el și față de ora de start, apoi înregistrează scorul. → API, Service Bus, Function + SQL.
- **Bancă de puzzle-uri pre-generate.** Generarea pe client blochează interfața (la Master, până la 16 s). Serverul ține puzzle-uri gata gradate pe fiecare dificultate. → Function + Blob Storage.

Aplicația rămâne jucabilă offline. Jocurile se salvează local și se trimit când revine conexiunea; fiecare joc are un id generat de client, deci o retrimitere nu dublează rezultatul.

## Servicii alese

Totul e PaaS sau serverless: pe abonamentul Azure for Students VM-urile nu sunt disponibile (capacitate sau quota 0 în regiunile permise). Regiunea țintă e France Central, una din cele cinci permise de policy.

**Compute**

- **Azure App Service, plan Basic B1 (Linux)** — API-ul REST în ASP.NET Core (.NET 10): `/api/games` (sincronizarea jocurilor), `/api/daily` și `/api/daily/submit`, `/api/leaderboard`, `/api/puzzles/{dificultate}`, `/api/health`. Nu F1, pentru că F1 nu are integrare cu VNet.
- **Azure Functions, plan Flex Consumption** — două funcții cu timer: puzzle-ul zilei (zilnic, 00:00 UTC) și reumplerea băncii de puzzle-uri, plus una declanșată de Service Bus, care procesează rezultatele jocurilor. Se plătește per execuție și suportă integrare cu VNet.

**Mesagerie**

- **Azure Service Bus, tier Basic, coada `game-results`** — API-ul verifică semnătura puzzle-ului, pune rezultatul în coadă și răspunde 202; funcția validează grila și actualizează statisticile și clasamentul. Id-ul jocului e și id-ul operației, iar o cheie unică în SQL face ca o livrare repetată să nu dubleze rezultatul. Mesajele invalide ajung în dead-letter queue.

**Storage**

- **Azure SQL Database, serverless, cu oferta gratuită** (100.000 vCore-secunde și 32 GB pe lună) — utilizatori, jocuri, puzzle-urile zilei, scoruri. Am ales relațional pentru că clasamentul e o interogare cu join și agregare. Acces prin EF Core; identitățile aplicației sunt useri Entra în bază, cu GRANT doar pe tabelele și operațiile folosite.
- **Azure Blob Storage** — banca de puzzle-uri (JSON, câte un container pe dificultate) și arhiva puzzle-urilor zilei. Contul de date e separat de cel al funcției: LRS, fără acces anonim, soft delete de 7 zile și Shared Key dezactivat, deci la date ajung doar identități Entra cu rol.

## Networking

Singurul punct public e API-ul; datele sunt accesibile doar din rețeaua privată.

- **VNet** `10.10.0.0/16` cu trei subrețele: `snet-app` (delegată App Service, pentru integrarea API-ului), `snet-func` (delegată Flex Consumption) și `snet-pe` (private endpoints).
- **Azure SQL** are accesul public dezactivat. API-ul și funcția ajung la el prin private endpoint în `snet-pe`, cu zona DNS privată `privatelink.database.windows.net` legată de VNet.
- **Blob Storage și Key Vault** au firewall pe „selected networks”: acceptă doar `snet-app` și `snet-func`, prin service endpoints. Private endpoint pe fiecare ar fi mai strict, dar fiecare e taxat pe oră.
- **NSG** pe subrețele: permis doar traficul necesar (spre SQL pe 1433 și HTTPS spre serviciile Azure), restul blocat.
- **Intrare:** API-ul acceptă doar HTTPS (TLS 1.2+), cu CORS limitat la originea versiunii web. Funcția nu expune endpoint-uri HTTP.
- **Clientul desktop** rulează din `file://` (origin `null`), așa că apelurile spre API trec prin procesul principal Electron, nu printr-un CORS deschis.

## Security

Nicio parolă sau cheie nu stă în cod, în pipeline sau în client.

- **Autentificarea jucătorilor** se face prin Microsoft Entra External ID (gratuit până la 50.000 de utilizatori activi pe lună). Clientul obține token-ul prin MSAL, iar API-ul îl validează (Microsoft.Identity.Web). Scrierile cer token; puzzle-ul zilei și clasamentul se pot citi anonim.
- **Managed Identity** pentru API și funcție. Cu ea se conectează la SQL prin autentificare Entra, fără parolă în connection string. Rolurile sunt minime: API-ul are Storage Blob Data Reader pe containerele băncii și Azure Service Bus Data Sender pe coadă; funcția are Storage Blob Data Contributor și Azure Service Bus Data Receiver; Key Vault Secrets User e dat doar API-ului, doar pe secretul HMAC.
- **Key Vault** păstrează cheia HMAC cu care API-ul semnează fiecare puzzle emis și ora de start. La trimiterea soluției, semnătura dovedește că puzzle-ul și timpul nu au fost falsificate. App Service citește cheia prin Key Vault references.
- **Azure SQL** acceptă doar autentificare Entra; autentificarea SQL cu user și parolă e dezactivată.
- **Service Bus** are autentificarea locală (cheile SAS) dezactivată, deci acceptă doar Entra ID. Pe Basic nu intră în VNet (private endpoints doar pe Premium), așa că accesul e limitat prin roluri.
- **Autorizarea de business** rămâne în API: fiecare utilizator citește și scrie doar jocurile lui, după `oid` din token. Rolurile Azure ale API-ului nu decid asta.

## Observabilitate

API-ul și funcția trimit telemetrie într-un singur Application Insights, legat de un workspace Log Analytics.

- **Telemetrie automată:** cereri, dependențe (SQL, Blob), excepții și trasare distribuită între API și SQL.
- **Metrici proprii:** timpul de generare pe dificultate, soluțiile respinse la validare, câte puzzle-uri au rămas în bancă.
- **Test de disponibilitate** pe `/api/health`, care întoarce versiunea și commit-ul rulat.
- **Alerte:** rata de răspunsuri 5xx peste prag, funcția zilnică eșuată sau puzzle-ul zilei lipsă, banca sub un minim. Separat, un buget în Cost Management cu alertă pe creditul de student.
- **Un workbook** care adună toate acestea, folosit și la prezentare.

## Deployment

Toată infrastructura de mai sus e descrisă în Terraform, deci mediul se poate recrea de la zero: VNet, subrețele, NSG, private endpoint, DNS, servicii, role assignments și alerte. Codul stă în același repo, în `/api`, `/functions` și `/infra`.

GitHub Actions se autentifică în Azure prin OIDC (federated credential), fără secrete stocate. Există trei workflow-uri:

1. **infra:** `terraform plan` la pull request, `apply` la push pe branch-ul `azure`, cu aprobare manuală.
2. **api:** build și teste, deploy în App Service, apoi un smoke test pe `/api/health`, care trebuie să raporteze commit-ul nou.
3. **functions:** build și deploy pe Flex Consumption.

Clientul primește adresa API-ului la build, prin `VITE_API_URL`.

## De verificat înainte de implementare

- France Central apare în lista Flex Consumption și are quota pentru App Service B1; abonamentul permite și servere Azure SQL acolo (pe Azure for Students, nu în toate regiunile).
- Pe contul de student se poate crea un tenant Entra External ID. Altfel, login cu conturi Microsoft în tenantul existent.
- Costul lunar B1 + private endpoint, comparat cu creditul rămas.
- Consumul bazei serverless: o cerere după pauză așteaptă circa un minut, iar la limita gratuită lunară baza se oprește până luna viitoare.