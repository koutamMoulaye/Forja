"""Test databases in Docker containers (docker/compose.test-db.yml), removed afterwards.

- ``FORJA_TEST_DATABASES=skip``: the database connector tests are skipped;
- ``FORJA_TEST_DATABASES=require`` (CI): they fail if Docker is missing;
- by default they run when Docker answers, and are skipped otherwise;
- ``FORJA_TEST_SQLSERVER=1`` adds SQL Server (a heavy image: CI only);
- ``FORJA_TEST_DB_KEEP=1`` leaves the containers running after the tests.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path

import sqlalchemy as sa
from sqlalchemy.engine import URL

COMPOSE = Path(__file__).resolve().parent.parent / "docker" / "compose.test-db.yml"
READER = "forja_reader"
READER_PASSWORD = "reader-Pass-2026"


@dataclass(frozen=True)
class TestDatabase:
    kind: str  # postgres, mysql, sqlserver
    port: int
    admin_user: str
    admin_password: str
    database: str
    schema: str

    __test__ = False

    def admin_url(self, database: str | None = None) -> URL:
        driver = {
            "postgres": "postgresql+psycopg",
            "mysql": "mysql+pymysql",
            "sqlserver": "mssql+pymssql",
        }[self.kind]
        return URL.create(
            driver,
            username=self.admin_user,
            password=self.admin_password,
            host="127.0.0.1",
            port=self.port,
            database=database if database is not None else self.database,
        )

    def params(self, *, reader: bool = True) -> dict[str, object]:
        return {
            "host": "127.0.0.1",
            "port": self.port,
            "database": self.database,
            "username": READER if reader else self.admin_user,
            "ssl": "disable" if self.kind == "postgres" else "prefer",
        }


POSTGRES = TestDatabase("postgres", 55432, "forja_admin", "forja-test-admin", "shop", "sales")
MYSQL = TestDatabase("mysql", 53306, "root", "forja-test-admin", "shop", "shop")
SQLSERVER = TestDatabase("sqlserver", 51433, "sa", "Forja-Test-Admin-1", "shop", "sales")


def _mode() -> str:
    return os.environ.get("FORJA_TEST_DATABASES", "auto").lower()


def docker_available() -> bool:
    if shutil.which("docker") is None:
        return False
    try:
        result = subprocess.run(["docker", "info"], capture_output=True, timeout=30, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0


def _compose(*args: str, profile: str) -> None:
    subprocess.run(
        ["docker", "compose", "-f", str(COMPOSE), "--profile", profile, *args],
        check=True,
        capture_output=True,
        timeout=900,
    )


def start(profile: str) -> None:
    _compose("up", "-d", "--wait", profile=profile)


def stop(profile: str) -> None:
    if os.environ.get("FORJA_TEST_DB_KEEP") == "1":
        return
    _compose("down", "-v", "--remove-orphans", profile=profile)


def _wait(url: URL, seconds: float = 120) -> None:
    deadline = time.monotonic() + seconds
    while True:
        engine = sa.create_engine(url)
        try:
            with engine.connect() as con:
                con.execute(sa.text("SELECT 1"))
            return
        except sa.exc.OperationalError:
            if time.monotonic() > deadline:
                raise
            time.sleep(2)
        finally:
            engine.dispose()


SEED = {
    "postgres": [
        "DROP SCHEMA IF EXISTS sales CASCADE",
        "CREATE SCHEMA sales",
        """CREATE TABLE sales.customers (
            id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(200),
            created_at TIMESTAMP NOT NULL DEFAULT now()
        )""",
        """CREATE TABLE sales.orders (
            id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, amount NUMERIC(10, 2),
            status VARCHAR(20), paid BOOLEAN, ordered_on DATE,
            updated_at TIMESTAMPTZ NOT NULL, notes JSONB
        )""",
        """CREATE TABLE sales."Order Lines" (
            "line id" INTEGER PRIMARY KEY, "select" VARCHAR(20), "Qty" INTEGER
        )""",
        "CREATE VIEW sales.paid_orders AS SELECT id, amount FROM sales.orders WHERE paid",
        f"DROP ROLE IF EXISTS {READER}",
        f"CREATE ROLE {READER} LOGIN PASSWORD '{READER_PASSWORD}'",
        f"GRANT USAGE ON SCHEMA sales TO {READER}",
        f"GRANT SELECT ON ALL TABLES IN SCHEMA sales TO {READER}",
    ],
    "mysql": [
        "DROP TABLE IF EXISTS customers, orders, `Order Lines`",
        "DROP VIEW IF EXISTS paid_orders",
        """CREATE TABLE customers (
            id INTEGER AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL,
            email VARCHAR(200), created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )""",
        """CREATE TABLE orders (
            id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, amount DECIMAL(10, 2),
            status VARCHAR(20), paid BOOLEAN, ordered_on DATE,
            updated_at DATETIME(6) NOT NULL, notes JSON
        )""",
        """CREATE TABLE `Order Lines` (
            `line id` INTEGER PRIMARY KEY, `select` VARCHAR(20), `Qty` INTEGER
        )""",
        "CREATE VIEW paid_orders AS SELECT id, amount FROM orders WHERE paid",
        f"DROP USER IF EXISTS '{READER}'@'%'",
        f"CREATE USER '{READER}'@'%' IDENTIFIED BY '{READER_PASSWORD}'",
        f"GRANT SELECT, SHOW VIEW ON shop.* TO '{READER}'@'%'",
    ],
    "sqlserver": [
        "IF SCHEMA_ID('sales') IS NULL EXEC('CREATE SCHEMA sales')",
        """CREATE TABLE sales.customers (
            id INT IDENTITY PRIMARY KEY, name NVARCHAR(100) NOT NULL, email NVARCHAR(200),
            created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        )""",
        """CREATE TABLE sales.orders (
            id INT PRIMARY KEY, customer_id INT NOT NULL, amount DECIMAL(10, 2),
            status NVARCHAR(20), paid BIT, ordered_on DATE,
            updated_at DATETIME2 NOT NULL, notes NVARCHAR(MAX)
        )""",
        """CREATE TABLE sales.[Order Lines] (
            [line id] INT PRIMARY KEY, [select] NVARCHAR(20), [Qty] INT
        )""",
        "EXEC('CREATE VIEW sales.paid_orders AS "
        "SELECT id, amount FROM sales.orders WHERE paid = 1')",
        f"IF SUSER_ID('{READER}') IS NULL "
        f"CREATE LOGIN {READER} WITH PASSWORD = '{READER_PASSWORD}'",
        f"CREATE USER {READER} FOR LOGIN {READER}",
        f"GRANT SELECT ON SCHEMA::sales TO {READER}",
    ],
}


def seed(database: TestDatabase, customers: int = 5, orders: int = 20) -> None:
    if database.kind == "sqlserver":
        master = sa.create_engine(database.admin_url("master"), isolation_level="AUTOCOMMIT")
        with master.connect() as con:
            con.execute(sa.text("IF DB_ID('shop') IS NOT NULL DROP DATABASE shop"))
            con.execute(sa.text("CREATE DATABASE shop"))
        master.dispose()
    _wait(database.admin_url())
    engine = sa.create_engine(database.admin_url())
    with engine.begin() as con:
        for statement in SEED[database.kind]:
            con.execute(sa.text(statement))
    insert_customers(database, customers)
    insert_orders(database, range(1, orders + 1))
    with engine.begin() as con:
        for line in range(1, 4):
            con.execute(
                sa.text(f"INSERT INTO {_qualified(database, 'Order Lines')} VALUES (:i, :s, :q)"),
                {"i": line, "s": f"choice {line}", "q": line * 2},
            )
    engine.dispose()


def _qualified(database: TestDatabase, table: str) -> str:
    quote = {"postgres": '"{}"', "mysql": "`{}`", "sqlserver": "[{}]"}[database.kind]
    name = quote.format(table)
    return name if database.kind == "mysql" else f"{database.schema}.{name}"


def insert_customers(database: TestDatabase, count: int) -> None:
    engine = sa.create_engine(database.admin_url())
    with engine.begin() as con:
        for i in range(count):
            con.execute(
                sa.text(
                    f"INSERT INTO {_qualified(database, 'customers')} (name, email) VALUES (:n, :e)"
                ),
                {"n": f"Client {i}", "e": f"client{i}@example.org"},
            )
    engine.dispose()


def insert_orders(database: TestDatabase, ids: range, *, day: int = 1) -> None:
    engine = sa.create_engine(database.admin_url())
    with engine.begin() as con:
        for i in ids:
            con.execute(
                sa.text(
                    f"INSERT INTO {_qualified(database, 'orders')} "
                    "(id, customer_id, amount, status, paid, ordered_on, updated_at, notes) "
                    "VALUES (:id, :c, :a, :s, :p, :d, :u, :n)"
                ),
                {
                    "id": i,
                    "c": 1 + i % 5,
                    "a": f"{i * 12.5:.2f}",
                    "s": "paid" if i % 2 else "pending",
                    "p": bool(i % 2),
                    "d": f"2026-01-{day:02d}",
                    "u": f"2026-01-{day:02d} 10:{i % 60:02d}:00",
                    "n": '{"gift": true}' if i % 7 == 0 else None,
                },
            )
    engine.dispose()


def insert_order_at(database: TestDatabase, order_id: int, updated_at: str) -> None:
    """An order changed at ``updated_at``: before the last cursor, a row committed late."""
    engine = sa.create_engine(database.admin_url())
    with engine.begin() as con:
        con.execute(
            sa.text(
                f"INSERT INTO {_qualified(database, 'orders')} "
                "(id, customer_id, amount, status, paid, ordered_on, updated_at) "
                "VALUES (:id, 1, 9.99, 'paid', :p, '2026-01-01', :u)"
            ),
            {"id": order_id, "u": updated_at, "p": True},
        )
    engine.dispose()


def touch_order(database: TestDatabase, order_id: int, *, day: int) -> None:
    engine = sa.create_engine(database.admin_url())
    with engine.begin() as con:
        con.execute(
            sa.text(
                f"UPDATE {_qualified(database, 'orders')} SET status = 'refunded', "
                "updated_at = :u WHERE id = :id"
            ),
            {"u": f"2026-01-{day:02d} 12:00:00", "id": order_id},
        )
    engine.dispose()


def analyze(database: TestDatabase) -> None:
    """Refresh the row estimates the exploration shows."""
    statement = {
        "postgres": "ANALYZE",
        "mysql": "ANALYZE TABLE customers, orders",
        "sqlserver": "EXEC sp_updatestats",
    }[database.kind]
    engine = sa.create_engine(database.admin_url())
    with engine.begin() as con:
        con.execute(sa.text(statement))
    engine.dispose()


def mode() -> str:
    return _mode()
