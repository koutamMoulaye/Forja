# Analyst guide: ask for a data mart

*Français : [guide-analyst.md](../guide-analyst.md)*

An analyst does not need to know the tables: they ask their question and check what
Forja understood before anything is published. **The interface and the questions are
in French in 0.1** (English comes in the next version); labels are quoted as they
appear on screen, followed by their meaning.

Sign in at <http://localhost:3000>; you land on the **Accueil** (home).

## 1. Ask a question

On the home page, write for instance « Chiffre d'affaires par mois et par ville en 2024,
clients Pro » (revenue per month and city in 2024, business customers), or start from a
suggestion or from an indicator of the catalog (*Indicateurs*). Forja tells how fresh
the data is (« mis à jour ce matin à 06:00 », updated this morning at 6 am).

The conversation shows the preparation step by step. Simple questions are understood
at once; the others go through the deeper analysis, which may take a moment: « Me
prévenir à la fin » (notify me when done) lets you work elsewhere, and a notification
announces the result.

If a term is ambiguous (« ventes », sales: revenue or quantity?), Forja asks back with
two to four choices, each saying what it covers (« 1 284 clients »). It never guesses.
A request outside the data is refused, with what Forja can measure.

## 2. Check the preview

« Ouvrir l'aperçu » (open the preview) shows:

- **Ce que Forja a compris** (what Forja understood), one sentence whose underlined
  terms are corrected in a click (another measure, another grain, another period);
- the **contrôles** (checks): totals reconciled with the model, period covered, rows;
- a **sample** of the rows, personal data pseudonymized, and the SQL;
- where the figures come from (the tables of the model used).

« Affiner » (refine) adds an instruction (« seulement l'Île-de-France », only one region;
« par trimestre », per quarter): a new version of the preview is computed.

## 3. Validate and publish

Choose the destination (Power BI, the serving database, a CSV or Parquet file), then
**Valider et publier** (validate and publish). Depending on the setup, an engineer
approves first: the step « En attente d'approbation » (waiting for approval) shows, and
a notification announces the decision, with the reason of a rejection. Once published,
the data mart is refreshed at every run of the model; the preview offers its exports.

## 4. Find your data marts

*Mes data marts* lists your requests by status (drafts, waiting, published). The
notifications (bell, top right) sum up what happened; « Activer » at the bottom of the
panel adds browser notifications, outside the Forja tab.

A word is not understood? After you answer a question of Forja, you can propose that
word as a synonym; the data team accepts it in the semantic layer.
