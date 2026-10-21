"""Ordered schema migrations of the metadata catalog.

A migration is applied once, inside a transaction, and recorded in ``schema_version``.
Never edit a released migration: append a new one.
"""

from __future__ import annotations

MIGRATIONS: tuple[tuple[int, str], ...] = (
    (
        1,
        """
        CREATE TABLE IF NOT EXISTS projects (
            id VARCHAR PRIMARY KEY,
            name VARCHAR NOT NULL,
            description VARCHAR,
            architecture VARCHAR NOT NULL,
            created_at TIMESTAMP NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sources (
            id VARCHAR PRIMARY KEY,
            project_id VARCHAR NOT NULL,
            name VARCHAR NOT NULL,
            format VARCHAR NOT NULL,
            original_filename VARCHAR NOT NULL,
            sheet_name VARCHAR,
            encoding VARCHAR,
            delimiter VARCHAR,
            row_count BIGINT NOT NULL,
            column_count INTEGER NOT NULL,
            columns JSON NOT NULL,
            bronze_path VARCHAR NOT NULL,
            warnings JSON NOT NULL,
            ingested_at TIMESTAMP NOT NULL,
            UNIQUE (project_id, name)
        );
        CREATE TABLE IF NOT EXISTS profiles (
            source_id VARCHAR PRIMARY KEY,
            quality_score DOUBLE NOT NULL,
            report JSON NOT NULL,
            profiled_at TIMESTAMP NOT NULL
        );
        """,
    ),
    (
        2,
        """
        ALTER TABLE sources ADD COLUMN current_version INTEGER DEFAULT 1;
        ALTER TABLE sources ADD COLUMN latest_version_id VARCHAR;
        UPDATE sources SET latest_version_id = id;

        CREATE TABLE source_versions (
            id VARCHAR PRIMARY KEY,
            source_id VARCHAR NOT NULL,
            version INTEGER NOT NULL,
            format VARCHAR NOT NULL,
            original_filename VARCHAR NOT NULL,
            sheet_name VARCHAR,
            encoding VARCHAR,
            delimiter VARCHAR,
            row_count BIGINT NOT NULL,
            new_row_count BIGINT NOT NULL,
            columns JSON NOT NULL,
            bronze_path VARCHAR NOT NULL,
            warnings JSON NOT NULL,
            schema_drift JSON,
            ingested_at TIMESTAMP NOT NULL,
            UNIQUE (source_id, version)
        );
        INSERT INTO source_versions
        SELECT id, id, 1, format, original_filename, sheet_name, encoding, delimiter,
               row_count, row_count, columns, bronze_path, warnings, NULL, ingested_at
        FROM sources;

        CREATE TABLE profiles_v2 (
            version_id VARCHAR PRIMARY KEY,
            source_id VARCHAR NOT NULL,
            quality_score DOUBLE NOT NULL,
            report JSON NOT NULL,
            profiled_at TIMESTAMP NOT NULL
        );
        INSERT INTO profiles_v2
        SELECT source_id, source_id, quality_score, report, profiled_at FROM profiles;
        DROP TABLE profiles;
        ALTER TABLE profiles_v2 RENAME TO profiles;
        """,
    ),
    (
        3,
        """
        CREATE TABLE plans (
            id VARCHAR PRIMARY KEY,
            project_id VARCHAR NOT NULL,
            source_id VARCHAR NOT NULL,
            version INTEGER NOT NULL,
            status VARCHAR NOT NULL,
            plan JSON NOT NULL,
            created_at TIMESTAMP NOT NULL,
            updated_at TIMESTAMP NOT NULL,
            UNIQUE (source_id, version)
        );
        """,
    ),
    (
        4,
        """
        CREATE TABLE jobs (
            id VARCHAR PRIMARY KEY,
            project_id VARCHAR NOT NULL,
            type VARCHAR NOT NULL,
            status VARCHAR NOT NULL,
            params JSON NOT NULL,
            metrics JSON,
            logs VARCHAR NOT NULL,
            error VARCHAR,
            created_at TIMESTAMP NOT NULL,
            started_at TIMESTAMP,
            finished_at TIMESTAMP
        );
        CREATE TABLE silver_tables (
            id VARCHAR PRIMARY KEY,
            project_id VARCHAR NOT NULL,
            source_id VARCHAR NOT NULL,
            name VARCHAR NOT NULL,
            plan_version INTEGER NOT NULL,
            row_count BIGINT NOT NULL,
            rejected_count BIGINT NOT NULL,
            columns JSON NOT NULL,
            built_at TIMESTAMP NOT NULL,
            last_run_id VARCHAR,
            UNIQUE (project_id, name)
        );
        """,
    ),
    (
        5,
        """
        CREATE TABLE relations (
            id VARCHAR PRIMARY KEY,
            project_id VARCHAR NOT NULL,
            from_table VARCHAR NOT NULL,
            from_column VARCHAR NOT NULL,
            to_table VARCHAR NOT NULL,
            to_column VARCHAR NOT NULL,
            status VARCHAR NOT NULL,
            origin VARCHAR NOT NULL,
            data JSON NOT NULL,
            created_at TIMESTAMP NOT NULL,
            updated_at TIMESTAMP NOT NULL,
            UNIQUE (project_id, from_table, from_column, to_table, to_column)
        );
        """,
    ),
    (
        6,
        """
        CREATE TABLE llm_calls (
            id VARCHAR PRIMARY KEY,
            project_id VARCHAR,
            status VARCHAR NOT NULL,
            data JSON NOT NULL,
            created_at TIMESTAMP NOT NULL
        );
        """,
    ),
)

SCHEMA_VERSION = MIGRATIONS[-1][0]
