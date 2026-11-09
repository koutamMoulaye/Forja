# The business agent

*Français : [agent.md](../agent.md)*

An analyst asks for a data mart in French; Forja understands it, shows what it
understood with a preview the analyst can check, and publishes only after validation.
Questions are in French in 0.1; the examples below are translated in parentheses.

```
question in French
  │
  ├─ 1. local preselection ──── labels, synonyms, distinct values (Lyon, livrée...)
  │                              → a context of ~200 tokens, measured
  ├─ 2. deterministic parser ── « CA par mois », « top 5 des produits au T1 2024 »
  │        │ confident                       │ not confident (unknown word)
  │        ▼                                 ▼
  │     MartSpec                 3. LLM (question + preselection, no value)
  │                                          │ MartSpec | Clarification | refusal
  ├─ 4. strict validation ───── against the semantic layer; values resolved
  │                              locally; unknown term → Clarification
  ├─ 5. SQL compilation ─────── deterministic templates (never SQL from the LLM)
  ├─ 6. verification preview ── summary, rows, pseudonymized sample, SQL, checks
  ├─ 7. validation by the user (+ an engineer's approval when required)
  └─ 8. publication ─────────── dbt model mart_<name>, build, serving, Parquet / CSV
```

Every costly step is a **run** (`mart_request`, `publish_mart`): `POST` answers `202`
with the request and its run, progress is followed with `GET /runs/{id}`
(`progress.step`: `preselection`, `llm`, `validation`, `preview`, `dbt`, `serving`), and
`POST /runs/{id}/cancel` cancels it (the ongoing model call is interrupted).

## 0. Intent of the message

First, `forja_core.agent.intents` cuts the message into clauses (punctuation, « et
la… ») and tells what each is about, without a language model:

- **a request for data**: it names a metric, an axis, a date, a period, or an adjustment
  verb (« ajoute », « retire », « seulement »); it goes to the parser;
- **a question about the data** (« ce cas parle de quoi ? »): a deterministic answer
  written from the semantic layer and the sources (files, rows, metrics and their units,
  axes, dates and years covered, examples the parser understands); the `answered`
  version creates no data mart;
- **out of scope** (« la météo à Paris »): a polite refusal with what Forja can measure.
  A clause naming only a value (« Paris ») is a request only when nothing else in it is
  left unexplained (« et à Paris ? »); with an LLM, also when its other words are not
  about an everyday subject outside any data (weather, time, news). « La météo actuelle
  à Paris » is always out of scope.

**New question or adjustment.** In a conversation that already holds a data mart, a
self-contained sentence (a measure, and an axis, a period or a time grain; no leading
« et », no « aussi », « seulement », « ajoute », « retire », no pronoun) is a **new
question**: its version is of kind `question` and inherits no filter, period, sort or
limit. Otherwise it adjusts the current data mart. Refusals written by the LLM that
mention its inner workings (« couche sémantique fournie ») are replaced by the
deterministic refusal.

A mixed message is cut: the part about the data is handled, the rest set aside in one
sentence added to the summary. An off-topic message never refines the data mart and
never blocks the version ready: the request stays « preview ready ».

## 1. Local preselection

`forja_core.agent.vocabulary` indexes the labels, synonyms and names of the visible
metrics, dimensions and attributes, and the **distinct values** of the filterable
attributes (text, not personal, at most 5,000 values), read from the Gold tables. The
question is normalized (lower case, no accents, apostrophes and punctuation removed,
simple lemmas: plurals, participles « livrées » → « livré ») and matched against the
index (longest match first, typos tolerated on words of 5 letters or more).

Kept: the recognised elements, the base metrics (`default`), the display attribute of
each dimension, the time dimensions and the grains. The context is rendered as compact
text (one line per element); its size is estimated at 3.2 characters per token and
stored with each version of the request (`context_tokens`). Target: under 1,500
tokens; measured on the 20 evaluation questions: **200 tokens on average, 249 at
most**. Distinct values never leave the process.

## 2. Deterministic parser

`forja_core.agent.parser` recognises without a model:

- **periods**: a year (`en 2024`), a quarter (`T1 2024`, `premier trimestre`), a
  half-year, a month, a range of months (`de janvier à mars 2024`), relative periods
  (`l'année dernière`, last year; `cette année`; `depuis le début de l'année`, year to
  date); without a year, the year of the data;
- **grain**: `par mois` (per month), `mensuel`, `par trimestre`...; `évolution`
  (trend) without a grain means per month;
- **top N**: `top 5`, `les 3 meilleurs` (best 3), `les 10 premiers` (descending),
  `les 5 pires` (worst 5, ascending), ordering `par <metric>`; « Top N des X les plus
  Y »: X is the axis, sorted descending on Y, limit N;
- **values**: recognized only when the request holds the **whole** value, stop words
  included (« musées » is never the value « Musée de l'affiche »); a span naming a
  measure, a dimension or an attribute is that element, never a value; quoted text
  looks for the values containing it (one: a filter; several: a question);
- **entity counts**: « nombre de musées », « combien de musées » read the generated
  « Nombre de <entity> » metric (distinct keys, unknown member left out);
- **compound measures**: « fréquentation payante et gratuite » = paying + free entries;
- **hierarchies**: « par géographie », « par territoire » read the coarsest level;
- **metrics**, **axes** (`par ville`, `par catégorie et segment`, `des produits`) and
  **filters** by value (`à Lyon`, `livrées`, `clients de Lyon et Paris` → `in`, `hors
  jardin` → `neq`, `segment Pro` → the unique prefix of a value of the named attribute).

It is **confident** when every meaningful word is explained (stop words and known
linking words aside). A word naming several metrics (« ventes »: revenue or quantity?)
or a metric and an attribute (« prix »: average selling price or list price?) produces
a Clarification at once. Otherwise the LLM is called; **without a configured LLM**,
Forja asks about the unknown word (close options + « Ignorer », ignore) or refuses when
nothing comes close. An **unknown adjective after an entity** (« musées labellisés ») is
asked before any LLM call, with the attributes that could hold it: a secondary date
filled in (`not_null` filter), that date as the date of the breakdown, or ignore. The answer says which path was taken: `path` = `parser`, `llm` or
`llm_cache`.

## 3. LLM

`forja_llm.agent.LLMMartInterpreter` sends the instructions, the question, the
preselection (rendered by `SemanticContext`, a closed Pydantic model whose fields are
names, labels and synonyms) and, for a refinement, the current MartSpec; never a data
value. It answers with an `AgentAnswer` validated by Pydantic: `mart` (a MartSpec), a
`clarification` (question, term, 2 to 4 options `metric:` / `attribute:`) or a
`refusal`. Answers are cached by fingerprint (provider, model, schema, prompt): the same
question on the same semantic layer does not call the model again. Tokens and duration
of every call are logged (`llm_calls`, run, version of the request).

### MartSpec

```json
{
  "metrics": ["montant", "nb_commandes"],
  "axes": ["client.ville"],
  "time_grain": "mois",
  "time_dimension": "date_commande",
  "filters": [{"field": "client.segment", "operator": "eq", "value": "professionnel"}],
  "period": {"start": "2024-01-01", "end": "2024-12-31", "label": "2024"},
  "order_by": [{"field": "montant", "direction": "desc"}],
  "limit": 10,
  "name": "ca_commandes_par_mois_ville_2024"
}
```

Operators: `eq`, `neq`, `in`, `not_in`, `gt`, `gte`, `lt`, `lte`, `contains`. A filter
on a metric (`montant > 100`) applies to the totals (`having`).

## 4. Validation

`forja_core.agent.validate`: every reference must exist and be visible; the metrics of
one data mart come from one fact; an axis must be related to that fact; a text filter
value is resolved against the distinct values (exact, unique prefix, then close:
« Lyonn » → Lyon); a value not found or ambiguous becomes a Clarification (close values)
or a refusal. No filter on the value of personal data. A grain or a period without a
date in the fact is refused. Nothing is guessed.

An axis on an attribute that a filter pins to a single value (« CA par ville à Lyon »,
revenue per city in Lyon) would only give a constant column: a model sometimes asks for
it. Forja removes the axis, deterministically, and says so at the end of the summary. A
filter on several values keeps its axis.

## 5. SQL

`forja_core.agent.compile` writes one query from templates:

```sql
with base as (
    select
        cast(date_trunc('month', date_commande.date) as date) as mois,
        client.ville as ville,
        f.montant as _m_montant,
        f.id_commande as _m_nb_commandes
    from fct_ventes as f
    left join dim_date as date_commande on date_commande.date_key = f.date_commande_key
    left join dim_clients as client on client.client_key = f.client_key
    where client.segment = 'professionnel'
        and date_commande.date >= DATE '2024-01-01'
        and date_commande.date <= DATE '2024-12-31'
)
select mois, ville, sum(_m_montant) as montant, count(distinct _m_nb_commandes) as nb_commandes
from base
group by mois, ville
order by mois asc, montant desc, ville asc
```

Ratios: `cast(<numerator> as double) / nullif(<denominator>, 0)` (rounded to 2
decimals for amounts), never `avg`. Semi-additive metrics: the value at the last date of
each group. Values are escaped literals coming from the validation. The same query,
with `{{ ref('fct_ventes') }}`, becomes the published dbt model.

## 6. Verification preview

| Element | Content |
|---|---|
| `summary` | « Chiffre d'affaires et nombre de commandes par mois et par ville, sur 2024, clients segment professionnel. » |
| `preview.row_count`, `rows` | number of rows and a sample (`FORJA_MART_PREVIEW_ROWS`, 50) |
| `preview.pseudonymized` | pseudonymized personal columns (always for an analyst; as the plan says for an engineer) |
| `sql` | the compiled SQL, readable |
| `controls` | see below |
| `summary_parts` | the summary cut into terms: each element of the MartSpec (metric, grain, axis, period, filter, limit) with its question and its options |
| `option_counts` | for a question back, what each option covers: members having the value (« 1 284 clients »), distinct values of an attribute, total of a metric |

The options of a term come from the semantic layer and the data: other metrics of the
same fact, other attributes of the dimension (« retirer cet axe », remove this axis),
years and quarters covered, values of the filtered attribute (« retirer ce filtre »),
top 5, 10 or 20. Correcting a term creates a `correction` version whose chosen MartSpec
is previewed as is, without parser or LLM.

Checks (`ok`, `info`, `warning`, `error`):

- **reconciliation**: for each additive metric, the total of the data mart equals the
  total of the fact on the same scope (same filters and period, before the row limit);
  a gap (`error`) blocks the validation; non-additive metrics are marked `info`;
- **unknown member**: share of fact rows attached to the "unknown" member (-1) of a
  dimension used (`warning` when not zero);
- **empty columns**: fully (`warning`) or partly (`info`);
- **empty result**: `error` (blocking) saying why (a period outside the data, a filter
  too narrow) and what to try (`details.suggestions`); « Valider et publier » is
  disabled;
- **total and parts**: when the source has a total column that adds up others (total =
  payant + gratuit, found at profiling), the preview measures the gap on its scope and
  flags it (`warning`).

The answer in the conversation draws one line per measure asked (legend), describes
each series (start, end, high and low points, largest change) and their split; beyond
15 members, the first 10 and an « Autres » bar with the full ranking to unfold. All of
it is computed, never written by the LLM.

## 7. Life cycle

| Status | Meaning |
|---|---|
| `drafted` | being understood, or a question waits for an answer |
| `previewed` | the preview is ready |
| `validated` | validated by its author; waits for approval when `FORJA_MART_REQUIRE_APPROVAL=true` |
| `published` | model built, served, exported |
| `rejected` | rejected by the author or an engineer |

Each question, answer or refinement creates a **version** (`iterations`): interpreted
text, path, preselection and context size, LLM call (tokens, duration), MartSpec,
Clarification or refusal, summary, SQL, preview.

| Method | Route | Effect |
|---|---|---|
| `POST` | `/projects/{id}/mart-requests` | `{"question"}`: a new request (v1) |
| `GET` | `/projects/{id}/mart-requests` · `/mart-requests/{id}` | your own (all for an engineer) |
| `POST` | `/mart-requests/{id}/answer` | `{"option": 0}` or `{"text": "…"}`: answers the question |
| `POST` | `/mart-requests/{id}/refine` | `{"instruction": "seulement le T1"}`: a new version |
| `POST` | `/mart-requests/{id}/correct` | `{"version", "term", "option"}`: corrects an underlined term |
| `POST` | `/mart-requests/{id}/validate` | `{"destination": "powerbi"}` (optional): publishes, or waits for approval |
| `POST` | `/mart-requests/{id}/approve` | engineer: approves and publishes |
| `POST` | `/mart-requests/{id}/reject` | `{"reason"}` |

An engineer (allowed to approve) who validates their own request approves it at the
same time if `FORJA_MART_ALLOW_SELF_APPROVAL` allows it: true by default in local mode,
false in multi-user mode, where another engineer approves. The preview keeps the
publication steps (validated, waiting for approval when there was one, approved by,
published); each decision is notified to the author, a rejection with its reason.

`GET /projects/{id}/mart-requests` returns a page (`limit`, `offset`, `status`) of the
requests most recently changed; by default each carries only its last version, and the
last one with a preview (`versions=all` for the full history, which
`GET /mart-requests/{id}` also gives). `GET /projects/{id}/agent/overview` gives the
date of the last successful Gold build and suggested questions: written from the
semantic layer (default metrics, named axes, never a code or an id), they are kept only
if the parser understands them alone and they pass the validation, hence an immediate
preview.

An answer by option fixes the meaning of the term for the rest of the request
(`bindings`); a free answer replaces the term in the request. A refinement (« ajoute le
nombre de commandes », add the number of orders; « seulement le T1 », first quarter
only; « retire la ville », remove the city; « par trimestre », per quarter) applies to the
MartSpec of the last previewed version; a quarter without a year takes the year of the
current period.

## 8. Publication

The `publish_mart` run: model `models/marts/mart_<name>.sql` (description = the
summary, columns documented with their additivity), `dbt build --select mart_<name>`,
table registered (`layer = mart`, owner, published), serving database rebuilt, exports
`exports/mart_<name>.parquet|csv` pseudonymized. A published data mart is kept in the
dbt project at each generation; a refinement followed by a new validation publishes it
again under the same name.

## Evaluation

`tests/agent_eval`: 20 questions on the e-commerce fixture with the expected result —
9 simple (parser alone), 5 complex phrasings (LLM), 4 ambiguous (a Clarification is
expected), 2 out of scope (a refusal). The score compares metrics, axes, grain,
filters (normalized values), period and limit.

```bash
uv run pytest tests/test_agent_eval.py                     # simulated provider (CI)
uv run python -m tests.agent_eval                          # same, detailed report
uv run python -m tests.agent_eval --provider ollama --subset    # 5 questions, local model
uv run python -m tests.agent_eval --provider anthropic     # full set, cloud model
```

With a real provider the cache is off: duration and tokens are measured for each
question.

`tests/agent_eval/museums.py` holds the real questions of manual case 1 bis, on the
yearly attendance fixture, answered by the parser alone (`--museums`; checked in CI by
`tests/test_agent_eval.py`). The French page lists them with the scores before and after
the second batch of fixes.

| Provider | Score | Without LLM | Average context |
|---|---|---|---|
| simulated (20 questions) | 20/20 | 65 % (13/20) | 200 tokens |
| Ollama `qwen3.5:9b`, CPU (5 questions) | 5/5 | 2/5 | 193 tokens |

On a CPU (Snapdragon X Plus, 32 GB), a question that needs the model takes about **two
minutes** (1,566 to 1,671 tokens read, 49 to 166 written); a GPU or a remote provider
brings it to a few seconds. The successive Ollama runs, and what each failure taught
(filters found locally kept when the model forgets them, « vendus » asked back by the
parser instead of guessed, instructions that ask back only between two equally
plausible metrics), are detailed in the [French version](../agent.md#évaluation).

Limit: with a 9B model on a CPU, the result of a question may change when the
instructions change, even at temperature 0. The deterministic guards (the parser's
questions, kept filters, strict validation) make the result depend less on the model;
the full set of 20 questions remains to be run on a cloud model
(`--provider anthropic`).
