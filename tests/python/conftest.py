from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))


@pytest.fixture(scope="session", autouse=True)
def generated_data():
    from actuarial.data_pipeline import default_paths, generate

    summary = default_paths().validation / "summary.json"
    if not summary.exists():
        generate()

