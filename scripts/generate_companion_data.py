from actuarial.data_pipeline import generate


if __name__ == "__main__":
    result = generate()
    print(f"Reconciliation: {result['status']} ({result['months_checked']} months)")

