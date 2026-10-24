"""Print the failed tests of a JUnit report as GitHub Actions error annotations."""

from __future__ import annotations

import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def main(path: str) -> None:
    report = Path(path)
    if not report.exists():
        return
    for case in ET.parse(report).iter("testcase"):
        for problem in [*case.iter("failure"), *case.iter("error")]:
            text = (problem.get("message") or "") + "\n" + (problem.text or "")[-1500:]
            text = text.replace("%", "%25").replace("\r", "").replace("\n", "%0A")
            print(f"::error title={case.get('classname')}.{case.get('name')}::{text}")


if __name__ == "__main__":
    main(sys.argv[1])
