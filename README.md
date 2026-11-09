# Tura Mea 🚗

Aplicație personală (PWA) care **planifică, urmărește și te motivează** în săptămâna de lucru ca șofer ride-sharing (Bolt) în București.

Îi dai o țintă de **profit NET**, iar ea calculează cât trebuie să încasezi pe zi și pe oră după toate costurile. Apoi construiește un program săptămânal pe obiceiurile tale, pe cererea din București și pe bonusurile săptămânii, și te ține la curent în timpul săptămânii.

- Totul în română, sume în lei, ora României (Europe/Bucharest).
- Datele stau **doar pe telefon** (IndexedDB). Fără cont și fără server.
- Merge offline și se instalează pe ecranul principal al telefonului Android.

---

## Cuprins

1. [Ce face aplicația](#ce-face-aplicația)
2. [Cum o folosești în fiecare săptămână](#cum-o-folosești-în-fiecare-săptămână)
3. [Rulare pe laptop](#rulare-pe-laptop)
4. [Publicare gratuită pe GitHub Pages](#publicare-gratuită-pe-github-pages)
5. [Instalare pe telefonul Android](#instalare-pe-telefonul-android)
6. [Cum calculează](#cum-calculează)
7. [Cererea în București (presupuneri)](#cererea-în-bucurești-presupuneri)
8. [Notificări: ce merge și ce nu](#notificări-ce-merge-și-ce-nu)
9. [Structura codului (unde schimbi reguli)](#structura-codului-unde-schimbi-reguli)
10. [Date și backup](#date-și-backup)
11. [Stadiul proiectului / de unde continuăm](#stadiul-proiectului--de-unde-continuăm)

---

## Ce face aplicația

| Ecran | Ce găsești |
|---|---|
| **Azi** | Planul zilei, butoanele mari **Începe tura / Pauză / Termină**, inele de progres (azi, săptămâna, luna), încasat și rămas, lei/oră acum față de cât îți trebuie, progresul bonusurilor (de exemplu „7/12 curse, 2h 10m rămase”), butoane rapide de înregistrare. |
| **Înregistrare rapidă** | Tastatură numerică mare pentru: cursă (suma brută), alimentare GPL, bonus încasat sau totalul zilei copiat din Bolt. Sumele folosite recent apar ca butoane. Fiecare înregistrare se poate anula imediat. |
| **Plan** | Săptămâna zi cu zi: blocuri de lucru, pauze, ferestre de bonus, ținta fiecărei zile, net estimat. Atingi o zi ca s-o modifici. Dacă rămâi în urmă sau ești înainte, diferența se redistribuie automat pe zilele rămase. |
| **Planificarea de duminică** | Asistent în 4 pași: țintă → bonusuri → program generat (cu verdictul pentru fiecare bonus) → salvare, export în calendar și notificări. |
| **Statistici** | Pe săptămână și pe lună: profit net față de țintă, comision, combustibil, costuri fixe, ore, medie pe oră, cele mai bune ore și zile, ce a învățat aplicația din datele tale. |
| **Setări** | Ținta (lunară sau săptămânală), costuri fixe (poți adăuga oricâte), comision, taxe, GPL, estimări, șablonul săptămânii, harta cererii, pauze, notificări, backup. |
| **Istoric** | Toate înregistrările pe zile, cu ștergere. |

Valorile de pornire: țintă **5.500 lei net pe lună** (≈ 1.270 lei pe săptămână, la 4,33 săptămâni pe lună), chirie 500 lei + contract 420 lei = **920 lei pe săptămână**, comision **10%** (din curse **și** din bonusuri), GPL **10 L/100 km**. **Prețul GPL trebuie completat de tine** (Setări sau primul pas al planificării).

## Cum o folosești în fiecare săptămână

**Duminică dimineața (până la 10:00):**
1. Primești mementoul de la 09:00 sau apeși bannerul de pe ecranul Azi.
2. Verifici ținta și actualizezi prețul GPL.
3. Introduci bonusurile din Bolt (zi/zile, interval orar, număr de curse, recompensă). Butonul „Copiază de săptămâna trecută” te scutește de scris când bonusurile se repetă.
4. Te uiți pe programul propus. La fiecare bonus poți alege „Decide tu”, „Îl vreau” sau „Nu”.
5. Salvezi, descarci programul în calendar (.ics) și permiți notificările.
6. *(Recomandat)* Setări → **Exportă toate datele** pentru backup.

**În timpul săptămânii:**
- Apeși **Începe tura** când pleci, **Pauză** la masă, **Termină** când ajungi acasă.
- După fiecare cursă: **+ Cursă** și suma (sau un buton cu o sumă recentă). Dacă nu ai timp, seara pui doar **Total zi din Bolt**.
- La alimentare: **Combustibil** și suma. Din alimentări aplicația învață cât te costă de fapt GPL-ul pe oră.
- La bonus încasat: **Bonus încasat**.

O tură începută după miezul nopții (până la 05:00) se socotește la ziua de dinainte, deci noaptea de sâmbătă rămâne la **Sâmbătă**.

## Rulare pe laptop

Ai nevoie de [Node.js](https://nodejs.org) 20 sau mai nou.

```bash
npm install
```

```bash
npm run dev
```

Deschide adresa afișată (de obicei http://localhost:5173). În Chrome poți simula un telefon din DevTools (F12 → iconița de telefon).

Alte comenzi:

```bash
npm test
```

```bash
npm run build
```

`npm test` rulează testele unitare pentru logica de business. `npm run build` face versiunea de producție în folderul `dist/`.

## Publicare gratuită pe GitHub Pages

Aplicația e publicată pe **GitHub Pages**, gratuit:

- **Adresa aplicației:** https://alphabusinessstrategysuport-tech.github.io/tura-mea/
- **Codul:** https://github.com/alphabusinessstrategysuport-tech/tura-mea (ramura `main`)
- **Versiunea publicată:** ramura `gh-pages`, care conține doar fișierele construite. Nu o modifica de mână.

**Cum publici o versiune nouă** după ce modifici codul:

```bash
git push
```

```bash
npm run deploy
```

`npm run deploy` (fișierul [scripts/deploy.mjs](scripts/deploy.mjs)) rulează testele, construiește aplicația pentru adresa `/tura-mea/` și o urcă pe ramura `gh-pages`. GitHub o publică în 1–2 minute. Telefonul preia versiunea nouă la următoarea deschidere a aplicației.

> **Publicare automată (opțional, mai târziu):** cu GitHub Actions, aplicația s-ar publica singură la fiecare `git push`. Pentru asta, contul GitHub CLI are nevoie de permisiunea `workflow` (`gh auth refresh -h github.com -s workflow`). Un fișier workflow gata făcut există în ramura locală `backup-inainte-de-publicare`, la `.github/workflows/deploy.yml`.

> Alternativă: pe Netlify sau Vercel imporți repository-ul, comanda de build e `npm run build` și folderul de publicat e `dist`.

## Instalare pe telefonul Android

1. Deschide adresa aplicației în **Chrome** pe telefon.
2. Meniul ⋮ → **Adaugă pe ecranul de pornire** (sau **Instalează aplicația**).
3. Deschide-o de pe ecranul principal: pornește pe tot ecranul, ca o aplicație normală.
4. La prima deschidere: Setări → **Permite notificările**.
5. Ca să meargă notificările cât mai bine:
   - Setări Android → Aplicații → Chrome (sau Tura Mea) → **Baterie → Fără restricții**.
   - Setări Android → Notificări → permite notificările pentru Chrome/Tura Mea.
   - În tură, lasă aplicația deschisă (ecranul rămâne aprins dacă ai bifat opțiunea).

## Cum calculează

```
păstrezi       = (1 − comision) × (1 − taxe)            ex.: 0,90
combustibil/h  = km pe oră × L/100 km ÷ 100 × preț GPL  ex.: 22 × 10 ÷ 100 × 3,9 ≈ 8,6 lei/h
BRUT necesar   = (țintă NET + costuri fixe + combustibil/h × ore) ÷ păstrezi
```

- „Brut” = suma din Bolt, înainte de comision. Bonusurile intră în brut, iar comisionul se aplică și lor.
- **Ținta lunară** se împarte la 4,33 ca să obții ținta săptămânală. Progresul lunar se urmărește pe luna calendaristică.
- **Câștigul pe oră** depinde de cerere: `lei/h la o oră = medie × (0,5 + cerere/100)`. La cerere 50 iei media, la 100 cu 50% peste, la 0 cu 50% sub.
- **Planificatorul** (fișierul `src/domain/scheduler.ts`) lucrează pe intervale de 30 de minute:
  1. pune orele minime ale fiecărei zile în cele mai bune ore din intervalele permise;
  2. pune ore în ferestrele bonusurilor care merită (cu 20% marjă de siguranță la curse); doar aici poate trece de 21:00;
  3. adaugă ore în cele mai bine plătite intervale până atinge ținta NET, fără să depășească orele maxime ale zilei;
  4. pune automat pauza de masă (după ~4 h, la momentul cel mai liniștit) și pauze scurte (10 min la ~2 h).
- **Bonus „merită?”**: compară câștigul net pe oră din fereastra bonusului, cu tot cu recompensă, față de media ta normală. Dacă bonusul te obligă să stai după 21:00, trebuie să fie cu cel puțin 30% mai bun. Verdicte: *Realizabil*, *La limită*, *Neplanificat* (nu merită sau nu încape), *Imposibil*.
- **Reechilibrare** (`src/domain/rebalance.ts`): după fiecare zi, ce lipsește (sau ce e în plus) se împarte pe zilele rămase proporțional cu potențialul lor, fără să treacă de orele maxime. Butonul „Refă programul zilelor rămase” regenerează blocurile.
- **Învățare** (`src/domain/learning.ts`): din ture și curse calculează câștigul real pe oră, valoarea medie a unei curse și costul GPL pe oră (din alimentări). Încrederea în datele reale crește până la 100% după 40 de ore înregistrate. Pentru fiecare oră din săptămână, datele reale înlocuiesc treptat harta cererii.

## Cererea în București (presupuneri)

Valori implicite de la 0 la 100 (50 = medie), editabile în **Setări → Cererea în București pe ore**:

- **Luni–Vineri dimineața 7–10** (vârf 8–9): naveta spre birouri (Pipera, Floreasca, Centru).
- **Prânz 12–14**: moderat.
- **Seara 17–20**: cel mai puternic vârf din zilele lucrătoare (trafic, tarife dinamice).
- **După 22:00 în zilele lucrătoare**: slab (Joi puțin mai bine).
- **Aeroportul Otopeni**: zboruri devreme 04–07, sosiri seara 21–01.
- **Vineri 19–03 și Sâmbătă 20–05**: viață de noapte (Centrul Vechi, Floreasca, Herăstrău, cluburi) și întoarceri acasă.
- **Sâmbătă ziua**: mall-uri, cumpărături, moderat.
- **Duminică**: dimineață liniștită, zi moderată, seara 17–22 întoarceri (Gara de Nord, aeroport).

Sunt estimări de bun-simț, nu date oficiale Bolt. După câteva săptămâni, orele tale reale corectează automat estimările.

## Notificări: ce merge și ce nu

Tipuri, fiecare cu pornit/oprit din Setări: plecare la drum, pauze și masă, progres bonus („Încă 3 curse… mai ai 1h 20m”), timpul de mers acasă, planificarea de duminică (09:00 și 09:45), ținta zilei atinsă.

**Limitare importantă:** o aplicație web (PWA) **nu poate programa notificări sigure la o oră fixă când e complet închisă**. Chrome a renunțat la API-ul care ar fi permis asta, iar notificările „push” cer un server.

Ce merge în practică:
1. **Cât timp aplicația e deschisă** (sau a fost folosită de curând în fundal), notificările apar la timp. În tură, ecranul rămâne aprins ca aplicația să nu fie oprită.
2. **Mementouri garantate prin calendar**: după planificare apeși „Descarcă programul (.ics)”. Blocurile de lucru (cu alarmă cu 15 minute înainte), mesele și mementoul de duminică intră în calendarul telefonului, care sună sigur. Dacă Google Calendar de pe telefon nu deschide fișierul, îl imporți de pe laptop: calendar.google.com → Setări → Import.
3. Butonul **„Memento duminică 09:00 în Google Calendar”** creează dintr-o atingere un eveniment care se repetă în fiecare duminică.

Mai târziu se poate adăuga un mic server gratuit (de exemplu Cloudflare Workers + Web Push) pentru notificări sigure și cu aplicația închisă.

## Structura codului (unde schimbi reguli)

```
src/
  domain/            ← logica de business, TypeScript pur, fără UI, cu teste
    types.ts           toate tipurile de date
    defaults.ts        setări implicite, șablonul săptămânii, harta cererii
    finance.ts         țintă, costuri, comision, combustibil, brut necesar
    model.ts           câștig așteptat pe oră din harta cererii
    breaks.ts          unde se pun masa și pauzele
    scheduler.ts       generarea programului săptămânal
    bonus.ts           bonusuri: instanțe, curse estimate, progres live
    rebalance.ts       redistribuirea pe zilele rămase
    actuals.ts         ce s-a întâmplat de fapt (ture, curse, totaluri)
    learning.ts        învățare din datele reale
    stats.ts           rezumate săptămână/lună
    notifications.ts   CE și CÂND notificăm (texte incluse)
    ics.ts             export în calendar
    time.ts            zile, săptămâni, fus orar București
    *.test.ts          teste unitare (npm test)
  data/
    db.ts              baza de date locală (Dexie/IndexedDB)
    backup.ts          export/import JSON
  store/
    app.ts             starea aplicației + salvare
    derived.ts         calcule pentru ecrane (azi, săptămână, lună)
  notifications/
    runner.ts          permisiuni, afișare, buclă, ecran aprins
  ui/
    theme.css          tema întunecată (culori în :root)
    components.tsx     butoane, inele, tastatură numerică etc.
    Timeline.tsx       bara de program a zilei
    screens/           ecranele
  i18n/ro.ts           texte comune în română
```

Exemple de modificări:
- **Alt mod de a plasa pauzele** → `src/domain/breaks.ts`
- **Cât de strict e „merită bonusul?”** → `src/domain/scheduler.ts` (căutați `baselineNetPerHour` și `relax ? 1.3 : 1.0`) și marja `BONUS_MARGIN`
- **Valorile de pornire** → `src/domain/defaults.ts`
- **Textele notificărilor** → `src/domain/notifications.ts`
- **Culorile** → începutul fișierului `src/ui/theme.css`

**Tehnologii:** React 18 + TypeScript + Vite (rapid și ușor de modificat), vite-plugin-pwa (offline și instalare), Dexie (IndexedDB), Zustand (stare), Vitest (teste). Fără biblioteci grele de UI; graficele sunt SVG simplu, deci aplicația rămâne mică (~370 KB) și rapidă.

## Date și backup

- Datele sunt doar în browserul telefonului. **Dacă ștergi datele Chrome sau dezinstalezi aplicația, se pierd.**
- **Setări → Exportă toate datele** salvează un fișier `tura-mea-backup-AAAA-LL-ZZ.json` în Descărcări. Pune-l pe Google Drive sau trimite-l pe e-mail.
- **Setări → Importă din backup** înlocuiește toate datele cu cele din fișier (cere confirmare).
- Același fișier îl poți importa pe laptop (în `npm run dev`) ca să verifici sau să analizezi datele.

## Stadiul proiectului / de unde continuăm

**Făcut (v0.1):**
- [x] Setări și calcule (țintă lunară/săptămânală, costuri, comision, GPL, taxe)
- [x] Planificator săptămânal cu cerere, pauze, bonusuri, „acasă până la 21:00”
- [x] Asistentul de duminică cu bonusuri și export în calendar
- [x] Urmărire live: ture cu pauze, curse, GPL, bonusuri, total zi, reechilibrare
- [x] Notificări (în aplicație și sistem) + mementouri prin calendar
- [x] Statistici săptămână/lună + învățare din datele reale
- [x] Backup JSON, offline, instalare PWA, publicare pe GitHub Pages (`npm run deploy`)
- [x] 53 de teste unitare pentru logica de business

**Idei pentru pașii următori:**
- Web Push printr-un server gratuit (notificări sigure cu aplicația închisă)
- Publicare automată cu GitHub Actions (cere permisiunea `workflow`)
- Bonus săptămânal cu praguri multiple (de ex. 50 curse = 150 lei, 80 curse = 300 lei)
- Factor de vreme sau evenimente (ploaie, concerte) care crește cererea pe o zi
- Grafic cu evoluția pe mai multe luni
- Backup automat săptămânal (de exemplu partajare directă spre Google Drive)

**Pentru o sesiune nouă cu Claude:** spune-i să citească acest README și `src/domain/types.ts`. Comenzile de verificare sunt `npm test` și `npm run build`.
