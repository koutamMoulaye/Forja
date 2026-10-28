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
    (
        7,
        """
        CREATE TABLE gold_plans (
            id VARCHAR PRIMARY KEY,
            project_id VARCHAR NOT NULL,
            version INTEGER NOT NULL,
            status VARCHAR NOT NULL,
            plan JSON NOT NULL,
            created_at TIMESTAMP NOT NULL,
            updated_at TIMESTAMP NOT NULL,
            UNIQUE (project_id, version)
        );
        """,
    ),
    (
        8,
        """
        ALTER TABLE silver_tables RENAME TO warehouse_tables;
        ALTER TABLE warehouse_tables ALTER COLUMN source_id DROP NOT NULL;
        ALTER TABLE warehouse_tables ADD COLUMN layer VARCHAR DEFAULT 'silver';
        ALTER TABLE warehouse_tables ADD COLUMN publish BOOLEAN DEFAULT false;
        """,
    ),
    (
        9,
        """
        ALTER TABLE jobs ADD COLUMN created_by VARCHAR;
        ALTER TABLE jobs ADD COLUMN progress JSON;
        ALTER TABLE jobs ADD COLUMN result JSON;
        ALTER TABLE jobs ADD COLUMN attempts INTEGER DEFAULT 0;
        ALTER TABLE jobs ADD COLUMN cancel_requested BOOLEAN DEFAULT false;

        CREATE TABLE llm_cache (
            key VARCHAR PRIMARY KEY,
            provider VARCHAR NOT NULL,
            model VARCHAR NOT NULL,
            purpose VARCHAR NOT NULL,
            response VARCHAR NOT NULL,
            hits INTEGER NOT NULL,
            created_at TIMESTAMP NOT NULL,
            last_hit_at TIMESTAMP
        );
        """,
    ),
    (
        10,
        """
        CREATE TABLE users (
            id VARCHAR PRIMARY KEY,
            email VARCHAR NOT NULL UNIQUE,
            password_hash VARCHAR,
            is_admin BOOLEAN NOT NULL,
            must_change_password BOOLEAN NOT NULL,
            disabled BOOLEAN NOT NULL,
            identity_provider VARCHAR NOT NULL,
            external_subject VARCHAR,
            created_at TIMESTAMP NOT NULL
        );
        CREATE TABLE memberships (
            project_id VARCHAR NOT NULL,
            user_id VARCHAR NOT NULL,
            role VARCHAR NOT NULL,
            created_at TIMESTAMP NOT NULL,
            PRIMARY KEY (project_id, user_id)
        );
        CREATE TABLE auth_sessions (
            id VARCHAR PRIMARY KEY,
            user_id VARCHAR NOT NULL,
            created_at TIMESTAMP NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            revoked_at TIMESTAMP,
            revoked_reason VARCHAR
        );
        CREATE TABLE refresh_tokens (
            token_hash VARCHAR PRIMARY KEY,
            session_id VARCHAR NOT NULL,
            created_at TIMESTAMP NOT NULL,
            used_at TIMESTAMP
        );
        CREATE TABLE api_keys (
            id VARCHAR PRIMARY KEY,
            user_id VARCHAR NOT NULL,
            name VARCHAR NOT NULL,
            prefix VARCHAR NOT NULL UNIQUE,
            key_hash VARCHAR NOT NULL,
            created_at TIMESTAMP NOT NULL,
            last_used_at TIMESTAMP,
            revoked_at TIMESTAMP
        );
        CREATE TABLE invitations (
            id VARCHAR PRIMARY KEY,
            project_id VARCHAR NOT NULL,
            email VARCHAR NOT NULL,
            role VARCHAR NOT NULL,
            token_hash VARCHAR NOT NULL UNIQUE,
            invited_by VARCHAR NOT NULL,
            created_at TIMESTAMP NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            accepted_at TIMESTAMP
        );
        CREATE TABLE audit_log (
            id VARCHAR PRIMARY KEY,
            occurred_at TIMESTAMP NOT NULL,
            user_id VARCHAR,
            user_email VARCHAR,
            action VARCHAR NOT NULL,
            project_id VARCHAR,
            object_type VARCHAR,
            object_id VARCHAR,
            details JSON NOT NULL
        );
        ALTER TABLE warehouse_tables ADD COLUMN owner_id VARCHAR;
        """,
    ),
    (
        11,
        """
        CREATE TABLE semantic_layers (
            id VARCHAR PRIMARY KEY,
            project_id VARCHAR NOT NULL,
            version INTEGER NOT NULL,
            data JSON NOT NULL,
            created_at TIMESTAMP NOT NULL,
            UNIQUE (project_id, version)
        );
        CREATE TABLE semantic_overrides (
            project_id VARCHAR NOT NULL,
            target VARCHAR NOT NULL,
            data JSON NOT NULL,
            updated_at TIMESTAMP,
            PRIMARY KEY (project_id, target)
        );
        CREATE TABLE synonym_proposals (
            id VARCHAR PRIMARY KEY,
            project_id VARCHAR NOT NULL,
            status VARCHAR NOT NULL,
            data JSON NOT NULL,
            created_at TIMESTAMP NOT NULL
        );
        """,
    ),
    (
        12,
        """
        CREATE TABLE mart_requests (
            id VARCHAR PRIMARY KEY,
            project_id VARCHAR NOT NULL,
            owner_id VARCHAR NOT NULL,
            status VARCHAR NOT NULL,
            data JSON NOT NULL,
            created_at TIMESTAMP NOT NULL,
            updated_at TIMESTAMP NOT NULL
        );
        """,
    ),
    (
        13,
        """
        CREATE TABLE auth_throttle (
            key VARCHAR PRIMARY KEY,
            failures JSON NOT NULL,
            locked_until TIMESTAMP,
            lockouts INTEGER NOT NULL,
            updated_at TIMESTAMP NOT NULL
        );
        """,
    ),
    (
        14,
        """
        ALTER TABLE users ADD COLUMN name VARCHAR;
        ALTER TABLE invitations ADD COLUMN revoked_at TIMESTAMP;
        """,
    ),
    (
        15,
        """
        CREATE TABLE notifications (
            id VARCHAR PRIMARY KEY,
            user_id VARCHAR NOT NULL,
            project_id VARCHAR,
            kind VARCHAR NOT NULL,
            data JSON NOT NULL,
            read_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL
        );
        CREATE INDEX notifications_user ON notifications (user_id, created_at);
        """,
    ),
)

SCHEMA_VERSION = MIGRATIONS[-1][0]
