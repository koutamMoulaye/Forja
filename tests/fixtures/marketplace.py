"""A multi-source marketplace, generated on the fly (never committed).

It has the shape of a public e-commerce dataset split in nine files, the way such
exports usually come (English column names, a common file prefix, one file per table):

- ``orders``: one row per order, with its customer (an attachment key: one
  ``customer_id`` per order), its status and five dates (purchase, approval, handover
  to the carrier, delivery, estimated delivery);
- ``order_items``: one row per line of an order (``order_id`` + ``order_item_id``), with
  its product, its seller, a price and a freight value; some orders have several lines,
  a few have none;
- ``order_payments``: one row per payment of an order (``order_id`` +
  ``payment_sequential``); some orders are paid in several payments (vouchers);
- ``order_reviews``: one row per review of an order; a review identifier repeats on a
  few orders, and a few orders have two reviews;
- ``customers``: one row per ``customer_id``; a stable ``customer_unique_id`` repeats for
  customers who ordered several times;
- ``sellers``, ``products`` (categories in Portuguese, one category missing from the
  translation, a few products without category);
- ``product_category_name_translation``: a small reference table;
- ``geolocation``: coordinates repeated many times per postal code, tied to nothing.

Amounts are in Brazilian reais; nothing says so in the files. The content is
deterministic: tests check totals computed here against what Forja builds.
"""

from __future__ import annotations

import csv
import random
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path

SEED = 2017
PREFIX = "olist_"
ORDERS = f"{PREFIX}orders_dataset.csv"
ITEMS = f"{PREFIX}order_items_dataset.csv"
PAYMENTS = f"{PREFIX}order_payments_dataset.csv"
REVIEWS = f"{PREFIX}order_reviews_dataset.csv"
CUSTOMERS = f"{PREFIX}customers_dataset.csv"
SELLERS = f"{PREFIX}sellers_dataset.csv"
PRODUCTS = f"{PREFIX}products_dataset.csv"
TRANSLATION = "product_category_name_translation.csv"
GEOLOCATION = f"{PREFIX}geolocation_dataset.csv"
FILES = (ORDERS, ITEMS, PAYMENTS, REVIEWS, CUSTOMERS, SELLERS, PRODUCTS, TRANSLATION, GEOLOCATION)

ORDER_COUNT = 320
SELLER_COUNT = 18
PRODUCT_COUNT = 70
STATES = {
    "SP": ["sao paulo", "campinas", "santos"],
    "RJ": ["rio de janeiro", "niteroi"],
    "MG": ["belo horizonte", "uberlandia"],
    "RS": ["porto alegre"],
    "PR": ["curitiba", "londrina"],
}
CATEGORIES = {
    "beleza_saude": "health_beauty",
    "cama_mesa_banho": "bed_bath_table",
    "esporte_lazer": "sports_leisure",
    "informatica_acessorios": "computers_accessories",
    "moveis_decoracao": "furniture_decor",
    "utilidades_domesticas": "housewares",
    "relogios_presentes": "watches_gifts",
    "brinquedos": "toys",
}
# A category used by products but missing from the translation table.
UNTRANSLATED = "pc_gamer"
PAYMENT_TYPES = ("credit_card", "boleto", "voucher", "debit_card")
STATUSES = ("delivered",) * 9 + ("shipped", "canceled")
FIRST_DAY = datetime(2016, 10, 3)
LAST_DAY = datetime(2018, 8, 29)


def _id(rng: random.Random) -> str:
    return f"{rng.getrandbits(128):032x}"


def _stamp(value: datetime | None) -> str:
    return value.strftime("%Y-%m-%d %H:%M:%S") if value else ""


@dataclass
class Marketplace:
    orders: list[dict[str, str]] = field(default_factory=list)
    items: list[dict[str, str]] = field(default_factory=list)
    payments: list[dict[str, str]] = field(default_factory=list)
    reviews: list[dict[str, str]] = field(default_factory=list)
    customers: list[dict[str, str]] = field(default_factory=list)
    sellers: list[dict[str, str]] = field(default_factory=list)
    products: list[dict[str, str]] = field(default_factory=list)
    translation: list[dict[str, str]] = field(default_factory=list)
    geolocation: list[dict[str, str]] = field(default_factory=list)

    # --- expected figures, computed from the rows -------------------------------------

    def purchase(self) -> dict[str, datetime]:
        return {
            o["order_id"]: datetime.fromisoformat(o["order_purchase_timestamp"])
            for o in self.orders
        }

    def revenue_by_month(self, year: int) -> dict[str, float]:
        purchase = self.purchase()
        totals: dict[str, float] = defaultdict(float)
        for item in self.items:
            day = purchase[item["order_id"]]
            if day.year == year:
                totals[f"{day:%Y-%m}"] += float(item["price"])
        return {k: round(v, 2) for k, v in sorted(totals.items())}

    def revenue_by_state(self, year: int) -> dict[str, float]:
        purchase = self.purchase()
        state_of = {c["customer_id"]: c["customer_state"] for c in self.customers}
        customer_of = {o["order_id"]: o["customer_id"] for o in self.orders}
        totals: dict[str, float] = defaultdict(float)
        for item in self.items:
            if purchase[item["order_id"]].year == year:
                totals[state_of[customer_of[item["order_id"]]]] += float(item["price"])
        return {k: round(v, 2) for k, v in totals.items()}

    def category_of_product(self) -> dict[str, str]:
        return {p["product_id"]: p["product_category_name"] for p in self.products}

    def revenue_by_category(self) -> dict[str, float]:
        category = self.category_of_product()
        totals: dict[str, float] = defaultdict(float)
        for item in self.items:
            totals[category[item["product_id"]] or "Inconnu"] += float(item["price"])
        return {k: round(v, 2) for k, v in totals.items()}

    def paid_by_type(self) -> dict[str, float]:
        totals: dict[str, float] = defaultdict(float)
        for payment in self.payments:
            totals[payment["payment_type"]] += float(payment["payment_value"])
        return {k: round(v, 2) for k, v in totals.items()}

    def paid_total(self) -> float:
        return round(sum(float(p["payment_value"]) for p in self.payments), 2)

    def customers_by_state(self) -> dict[str, int]:
        """Distinct stable customers per state, among those who bought an item."""
        bought = {o["customer_id"] for o in self.orders if o["order_id"] in self.ordered()}
        unique: dict[str, set[str]] = defaultdict(set)
        for customer in self.customers:
            if customer["customer_id"] in bought:
                unique[customer["customer_state"]].add(customer["customer_unique_id"])
        return {k: len(v) for k, v in unique.items()}

    def ordered(self) -> set[str]:
        return {i["order_id"] for i in self.items}

    def score_by_category(self) -> dict[str, float]:
        """Mean review score per category, each review counted once per category of its
        order (never once per line)."""
        category = self.category_of_product()
        categories: dict[str, set[str]] = defaultdict(set)
        for item in self.items:
            categories[item["order_id"]].add(category[item["product_id"]] or "Inconnu")
        scores: dict[str, list[int]] = defaultdict(list)
        for review in self.reviews:
            # An order without lines has no category: « Inconnu », as in the data mart.
            for name in categories.get(review["order_id"]) or {"Inconnu"}:
                scores[name].append(int(review["review_score"]))
        return {k: round(sum(v) / len(v), 4) for k, v in scores.items()}


def build(seed: int = SEED) -> Marketplace:
    rng = random.Random(seed)
    data = Marketplace()
    zips = {
        (state, city): f"{rng.randint(10, 99)}{rng.randint(100, 999)}"
        for state, cities in STATES.items()
        for city in cities
    }
    places = list(zips)

    for code, english in CATEGORIES.items():
        data.translation.append(
            {"product_category_name": code, "product_category_name_english": english}
        )
    for _ in range(SELLER_COUNT):
        state, city = rng.choice(places)
        data.sellers.append(
            {
                "seller_id": _id(rng),
                "seller_zip_code_prefix": zips[(state, city)],
                "seller_city": city,
                "seller_state": state,
            }
        )
    codes = [*CATEGORIES, UNTRANSLATED]
    for index in range(PRODUCT_COUNT):
        category = "" if index % 23 == 22 else codes[index % len(codes)]
        data.products.append(
            {
                "product_id": _id(rng),
                "product_category_name": category,
                "product_name_lenght": str(rng.randint(20, 60)),
                "product_description_lenght": str(rng.randint(100, 2000)),
                "product_photos_qty": str(rng.randint(1, 6)),
                "product_weight_g": str(rng.randint(100, 9000)),
                "product_length_cm": str(rng.randint(10, 80)),
                "product_height_cm": str(rng.randint(2, 60)),
                "product_width_cm": str(rng.randint(10, 60)),
            }
        )

    people: list[tuple[str, str, str]] = []  # unique id, state, city
    span = (LAST_DAY - FIRST_DAY).total_seconds()
    review_ids: list[str] = []
    for index in range(ORDER_COUNT):
        # A returning customer: same stable identifier, a new customer_id for the order.
        if people and rng.random() < 0.15:
            unique, state, city = rng.choice(people)
        else:
            state, city = rng.choice(places)
            unique = _id(rng)
            people.append((unique, state, city))
        customer_id = _id(rng)
        data.customers.append(
            {
                "customer_id": customer_id,
                "customer_unique_id": unique,
                "customer_zip_code_prefix": zips[(state, city)],
                "customer_city": city,
                "customer_state": state,
            }
        )
        order_id = _id(rng)
        bought = FIRST_DAY + timedelta(seconds=rng.random() * span)
        status = STATUSES[index % len(STATUSES)]
        approved = bought + timedelta(hours=rng.randint(1, 30))
        carrier = approved + timedelta(days=rng.randint(1, 4)) if status != "canceled" else None
        delivered = (
            carrier + timedelta(days=rng.randint(2, 15))
            if carrier and status == "delivered"
            else None
        )
        data.orders.append(
            {
                "order_id": order_id,
                "customer_id": customer_id,
                "order_status": status,
                "order_purchase_timestamp": _stamp(bought),
                "order_approved_at": _stamp(approved),
                "order_delivered_carrier_date": _stamp(carrier),
                "order_delivered_customer_date": _stamp(delivered),
                "order_estimated_delivery_date": f"{bought + timedelta(days=20):%Y-%m-%d} 00:00:00",
            }
        )
        # Lines: a few orders have none (canceled before payment), some several.
        lines = 0 if index % 41 == 40 else rng.choice((1, 1, 1, 1, 2, 3))
        total = 0.0
        product = ""
        for line in range(1, lines + 1):
            # The same product twice in an order: two lines, one product.
            if not product or rng.random() > 0.35:
                product = rng.choice(data.products)["product_id"]
            price = round(rng.uniform(9, 450), 2)
            freight = round(rng.uniform(5, 40), 2)
            total += price + freight
            data.items.append(
                {
                    "order_id": order_id,
                    "order_item_id": str(line),
                    "product_id": product,
                    "seller_id": rng.choice(data.sellers)["seller_id"],
                    "shipping_limit_date": _stamp(bought + timedelta(days=6)),
                    "price": f"{price:.2f}",
                    "freight_value": f"{freight:.2f}",
                }
            )
        # Payments: one, or a card and vouchers (payment_sequential 1, 2, 3).
        parts = 1 if rng.random() < 0.8 else rng.choice((2, 3))
        remaining = round(total or rng.uniform(20, 200), 2)
        for sequential in range(1, parts + 1):
            value = (
                remaining if sequential == parts else round(remaining * rng.uniform(0.2, 0.6), 2)
            )
            remaining = round(remaining - value, 2)
            data.payments.append(
                {
                    "order_id": order_id,
                    "payment_sequential": str(sequential),
                    "payment_type": "voucher" if sequential > 1 else rng.choice(PAYMENT_TYPES),
                    "payment_installments": str(rng.randint(1, 10)),
                    "payment_value": f"{value:.2f}",
                }
            )
        # Reviews: most orders have one; a review identifier repeats on a few orders.
        for _ in range(2 if index % 37 == 5 else 1):
            review_id = review_ids[-1] if review_ids and index % 29 == 7 else _id(rng)
            review_ids.append(review_id)
            created = bought + timedelta(days=rng.randint(5, 30))
            data.reviews.append(
                {
                    "review_id": review_id,
                    "order_id": order_id,
                    "review_score": str(rng.choice((1, 3, 4, 5, 5, 5))),
                    "review_comment_title": "" if rng.random() < 0.8 else "recomendo",
                    "review_comment_message": ""
                    if rng.random() < 0.6
                    else "Produto chegou antes do prazo, muito bom " * rng.randint(1, 8),
                    "review_creation_date": f"{created:%Y-%m-%d} 00:00:00",
                    "review_answer_timestamp": _stamp(
                        created + timedelta(hours=rng.randint(5, 90))
                    ),
                }
            )

    # Geolocation: many rows per postal code, exact duplicates included.
    for (state, city), code in zips.items():
        for _ in range(rng.randint(60, 140)):
            row = {
                "geolocation_zip_code_prefix": code,
                "geolocation_lat": f"{-23 + rng.uniform(-1, 1):.6f}",
                "geolocation_lng": f"{-46 + rng.uniform(-1, 1):.6f}",
                "geolocation_city": city,
                "geolocation_state": state,
            }
            data.geolocation.append(row)
            if rng.random() < 0.3:
                data.geolocation.append(dict(row))
    return data


def _write(path: Path, rows: list[dict[str, str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def write(directory: Path, data: Marketplace | None = None) -> list[Path]:
    """The nine files in ``directory`` (tests remove them afterwards)."""
    data = data or build()
    directory.mkdir(parents=True, exist_ok=True)
    tables = {
        ORDERS: data.orders,
        ITEMS: data.items,
        PAYMENTS: data.payments,
        REVIEWS: data.reviews,
        CUSTOMERS: data.customers,
        SELLERS: data.sellers,
        PRODUCTS: data.products,
        TRANSLATION: data.translation,
        GEOLOCATION: data.geolocation,
    }
    paths = []
    for name, rows in tables.items():
        _write(directory / name, rows)
        paths.append(directory / name)
    return paths


def counts(data: Marketplace) -> dict[str, int]:
    return {
        "orders": len(data.orders),
        "items": len(data.items),
        "payments": len(data.payments),
        "reviews": len(data.reviews),
        "repeated_reviews": sum(
            1 for n in Counter(r["review_id"] for r in data.reviews).values() if n > 1
        ),
    }
