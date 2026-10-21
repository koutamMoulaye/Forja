"""Local workspace layout: ``<data_dir>/<project_id>/{bronze,silver,gold}/<source>/``."""

from __future__ import annotations

from pathlib import Path

from forja_core.models import Layer


class Workspace:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()

    def project_dir(self, project_id: str) -> Path:
        return self.root / project_id

    def layer_dir(self, project_id: str, layer: Layer) -> Path:
        return self.project_dir(project_id) / layer.value

    def bronze_source_dir(self, project_id: str, source_name: str) -> Path:
        return self.layer_dir(project_id, Layer.BRONZE) / source_name

    def staging_dir(self, project_id: str) -> Path:
        return self.project_dir(project_id) / "_staging"

    def ensure_project(self, project_id: str) -> Path:
        for layer in Layer:
            self.layer_dir(project_id, layer).mkdir(parents=True, exist_ok=True)
        return self.project_dir(project_id)

    def relative(self, path: Path) -> str:
        return path.resolve().relative_to(self.root).as_posix()

    def resolve(self, relative_path: str) -> Path:
        path = (self.root / relative_path).resolve()
        if not path.is_relative_to(self.root):
            raise ValueError(f"path escapes the workspace: {relative_path}")
        return path
