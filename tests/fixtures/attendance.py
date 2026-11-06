"""A denormalized yearly attendance file, generated on the fly (never committed).

It has the shape of an open-data export where each row is one entity for one year:

- grain entity x year: ``IDMuseofile`` + ``annee`` (an integer column of plausible years);
- the attributes of the entity repeated on every row (name, city, INSEE code,
  department, region, closed flag, a secondary date), forming the hierarchy
  city > department > region;
- a secondary date (``dateappellation``, dd/mm/yyyy) filled for about a third of the
  entities only, and a closure year mostly empty, with one ``Inconnu``;
- sentinel values (``Inconnu``, ``NC``, ``n.d.``) in a few cells;
- counts of visitors (``payant``, ``gratuit``, ``total``...), never amounts of money.

The content is deterministic: the same seed gives the same file, so tests can check
totals computed here against what Forja builds.
"""

from __future__ import annotations

import csv
import random
from dataclasses import dataclass
from pathlib import Path

FILE = "entrees_et_categories_de_public.csv"
SEED = 1793
FIRST_YEAR = 2013
LAST_YEAR = 2023
ENTITY_COUNT = 90
HEADER = (
    "IDMuseofile", "nom_du_musee", "ville", "code_insee_commune", "departement", "region",
    "ferme", "dateappellation", "anneefermeture", "annee", "payant", "gratuit", "total",
    "individuel", "scolaires",
)  # fmt: skip

# region -> department -> (city, INSEE code)
GEOGRAPHY: dict[str, dict[str, list[tuple[str, str]]]] = {
    "Bretagne": {
        "Finistère": [("BREST", "29019"), ("QUIMPER", "29232")],
        "Ille-et-Vilaine": [("RENNES", "35238"), ("SAINT-MALO", "35288")],
    },
    "Occitanie": {
        "Haute-Garonne": [("TOULOUSE", "31555")],
        "Hérault": [("MONTPELLIER", "34172"), ("SÈTE", "34301")],
        "Aude": [("CARCASSONNE", "11069")],
    },
    "Grand-Est": {
        "Bas-Rhin": [("STRASBOURG", "67482")],
        "Marne": [("REIMS", "51454"), ("ÉPERNAY", "51230")],
    },
    "Île-de-France": {
        "Paris": [("PARIS", "75056")],
        "Yvelines": [("VERSAILLES", "78646")],
    },
}
KINDS = ("musée municipal", "musée des beaux-arts", "muséum d'histoire naturelle",
         "musée archéologique", "musée de la marine", "écomusée")  # fmt: skip


@dataclass(frozen=True)
class Row:
    entity: str
    name: str
    city: str
    insee: str
    department: str
    region: str
    closed: str
    appellation: str
    closure: str
    year: int
    paying: int | None
    free: int | None
    total: int | None
    individual: str
    school: str

    def cells(self) -> list[str]:
        def number(value: int | None) -> str:
            return "" if value is None else str(value)

        return [
            self.entity, self.name, self.city, self.insee, self.department, self.region,
            self.closed, self.appellation, self.closure, str(self.year), number(self.paying),
            number(self.free), number(self.total), self.individual, self.school,
        ]  # fmt: skip


def rows(seed: int = SEED) -> list[Row]:
    rng = random.Random(seed)
    places = [
        (region, department, city, insee)
        for region, departments in GEOGRAPHY.items()
        for department, cities in departments.items()
        for city, insee in cities
    ]
    result: list[Row] = []
    for index in range(1, ENTITY_COUNT + 1):
        region, department, city, insee = places[index % len(places)]
        entity = f"M{index:04d}"
        name = f"{KINDS[index % len(KINDS)]} de {city.title()}"
        closed = "OUI" if index % 11 == 0 else "NON"
        # The secondary date: filled for one entity in three only.
        appellation = (
            f"{1 + index % 28:02d}/{1 + index % 12:02d}/{2002 + index % 9}"
            if index % 3 == 0
            else ""
        )
        first = FIRST_YEAR + (index % 4 if index % 5 == 0 else 0)
        for year in range(first, LAST_YEAR + 1):
            if index % 13 == 0 and year == 2020:
                continue  # a gap: no row this year
            paying = rng.randint(0, 60_000)
            free = rng.randint(0, 30_000)
            closure = ""
            if closed == "OUI" and year >= 2019:
                closure = "Inconnu" if index == 11 else "2019"
            school = rng.choice(["", "NC", str(rng.randint(0, 4_000))])
            individual = "n.d." if index == 7 and year == 2015 else str(rng.randint(0, paying))
            result.append(
                Row(
                    entity=entity,
                    name=name,
                    city=city,
                    insee=insee,
                    department=department,
                    region=region,
                    closed=closed,
                    appellation=appellation,
                    closure=closure,
                    year=year,
                    paying=paying,
                    free=free,
                    total=paying + free,
                    individual=individual,
                    school=school,
                )
            )
    return result


def write(directory: Path, seed: int = SEED) -> Path:
    """Write the file as an export of this kind is published: ';' and Windows-1252."""
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / FILE
    with path.open("w", encoding="cp1252", newline="") as handle:
        writer = csv.writer(handle, delimiter=";")
        writer.writerow(HEADER)
        for row in rows(seed):
            writer.writerow(row.cells())
    return path


def total_by_region(year: int, seed: int = SEED) -> dict[str, int]:
    """The expected answer to "total des entrées par région en <year>"."""
    totals: dict[str, int] = {}
    for row in rows(seed):
        if row.year == year and row.total is not None:
            totals[row.region] = totals.get(row.region, 0) + row.total
    return totals


def entity_count() -> int:
    return ENTITY_COUNT


if __name__ == "__main__":
    # `uv run python -m tests.fixtures.attendance <dir>`: writes the file for the web
    # end-to-end tests and prints what they check, as JSON.
    import json
    import sys

    written = write(Path(sys.argv[1]))
    by_region = total_by_region(LAST_YEAR)
    top = max(by_region, key=lambda region: by_region[region])
    print(
        json.dumps(
            {
                "path": str(written),
                "year": LAST_YEAR,
                "total": sum(by_region.values()),
                "top": top,
                "top_total": by_region[top],
                "regions": len(by_region),
            }
        )
    )
