import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from actuarial.data_pipeline import generate


if __name__ == "__main__":
    result = generate()
    print(f"Reconciliation: {result['status']} ({result['months_checked']} months)")
