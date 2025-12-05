import json
import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np


BASE_DIR = Path(__file__).resolve().parent.parent
DECIMALS = 4


# Classic RK4 integrator over the provided time grid; stages optional.
def rk4(f, y0, t, collect_stages=False):
    """Classic RK4 integrator over time grid `t`.

    Returns solution array; if `collect_stages=True` also returns stage derivatives.
    """
    n = len(t)
    y = np.zeros((n, len(y0)))
    y[0] = y0
    stages = [] if collect_stages else None
    for i in range(n - 1):
        h = t[i + 1] - t[i]
        k1 = f(t[i], y[i])
        k2 = f(t[i] + h / 2, y[i] + h * k1 / 2)
        k3 = f(t[i] + h / 2, y[i] + h * k2 / 2)
        k4 = f(t[i] + h, y[i] + h * k3)
        y[i + 1] = y[i] + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4)
        if collect_stages:
            stages.append([k1.tolist(), k2.tolist(), k3.tolist(), k4.tolist()])
    return (y, stages) if collect_stages else y


# Higher-order RK7 integrator (reference); can return internal stages.
def rk7(f, y0, t, collect_stages=False):
    """Higher-order RK7 integrator used for reference solutions.

    Optionally returns internal stages for debugging/education.
    """
    n = len(t)
    y = np.zeros((n, len(y0)))
    y[0] = y0
    stages = [] if collect_stages else None
    for i in range(n - 1):
        h = t[i + 1] - t[i]
        k1 = f(t[i], y[i])
        k2 = f(t[i] + h / 6, y[i] + h * k1 / 6)
        k3 = f(t[i] + h / 3, y[i] + h * (k1 + k2) / 12)
        k4 = f(t[i] + h / 2, y[i] + h * (k1 + 3 * k3) / 8)
        k5 = f(t[i] + 2 * h / 3, y[i] + h * (k1 - 3 * k3 + 4 * k4) / 6)
        k6 = f(
            t[i] + 5 * h / 6,
            y[i] + h * (11 * k1 - 54 * k3 + 40 * k4 + 27 * k5) / 150,
        )
        k7 = f(t[i] + h, y[i] + h * (k1 + 4 * k4 + k5) / 6)
        y[i + 1] = y[i] + (h / 90) * (7 * k1 + 32 * k3 + 12 * k4 + 32 * k5 + 7 * k7)
        if collect_stages:
            stages.append([
                k1.tolist(),
                k2.tolist(),
                k3.tolist(),
                k4.tolist(),
                k5.tolist(),
                k6.tolist(),
                k7.tolist(),
            ])
    return (y, stages) if collect_stages else y


# Compute dS,dE,dI1,dI2,dR for the SEI1I2R compartmental model.
def sei_model(_t, y):
    """Derivative function for the SEI1I2R compartmental model.

    Returns time derivatives [dS, dE, dI1, dI2, dR].
    """
    S, E, I1, I2, R = y
    N = 52
    pi = 0.6
    mu = 0.4
    alpha1 = 0.009
    alpha2 = 0.007
    beta = 0.83
    epsilon = 0.8
    tau = 0.16
    rho = 0.25
    delta = 0.25
    gamma = 0.5

    dS = pi * N - S * (mu + alpha1 * I1 + alpha2 * I2)
    dE = S * (alpha1 * I1 + alpha2 * I2) - E * (mu + beta)
    dI1 = E * beta + rho * R + delta * I2 - I1 * (mu + epsilon + tau)
    dI2 = I1 * epsilon - I2 * (mu + delta + gamma)
    dR = I1 * tau - I2 * gamma - R * (mu + rho)
    return np.array([dS, dE, dI1, dI2, dR])


# Evenly downsample `array` to at most `limit` elements for lighter JSON.
def downsample_series(array, limit=400):
    """Downsample an array evenly to `limit` length for web-friendly JSON."""
    arr = np.asarray(array)
    if len(arr) <= limit:
        return arr
    idx = np.linspace(0, len(arr) - 1, limit, dtype=int)
    return arr[idx]


# Round numeric arrays to `ndigits` decimals for consistent output.
def round_array(array, ndigits=DECIMALS):
    return np.round(np.asarray(array, dtype=float), ndigits)


# Round a single numeric value to `ndigits` decimals.
def round_value(value, ndigits=DECIMALS):
    return round(float(value), ndigits)


# Run RK4 and RK7 simulations and assemble a JSON-serializable result dict.
def simulate_sei_model(collect_full=False, collect_stages=False, include_notes=False):
    """Simulate SEI model with both RK4 and RK7 and assemble JSON-ready dict.

    Produces downsampled series by default; `collect_full` and `collect_stages`
    provide more detailed outputs useful for step-through visualizations.
    """
    t = np.linspace(0, 60, 2001)
    y0 = np.array([24, 15, 6, 2, 5], dtype=float)

    if collect_stages:
        rk4_res, rk4_stages = rk4(sei_model, y0, t, collect_stages=True)
        rk7_res, rk7_stages = rk7(sei_model, y0, t, collect_stages=True)
    else:
        rk4_res = rk4(sei_model, y0, t)
        rk7_res = rk7(sei_model, y0, t)

    diff_abs = np.abs(rk4_res - rk7_res)

    ds_time = t if collect_full else downsample_series(t, limit=300)
    idx = np.linspace(0, len(t) - 1, len(ds_time), dtype=int)

    labels = ["S", "E", "I1", "I2", "R"]

    def pick_rows(array):
        return array[idx, :]

    rk4_ds = round_array(pick_rows(rk4_res))
    rk7_ds = round_array(pick_rows(rk7_res))
    diff_ds = round_array(pick_rows(diff_abs))

    stats = []
    for i, label in enumerate(labels):
        stats.append(
            {
                "label": label,
                "max_abs": round_value(np.max(diff_abs[:, i])),
                "mean_abs": round_value(np.mean(diff_abs[:, i])),
            }
        )

    result = {
        "time": round_array(ds_time).tolist(),
        "labels": labels,
        "rk4": rk4_ds.tolist(),
        "rk7": rk7_ds.tolist(),
        "diff_abs": diff_ds.tolist(),
        "stats": stats,
        "step": round_value(t[1] - t[0]),
        "time_window": [round_value(t[0]), round_value(t[-1])],
    }

    if collect_full:
        result["full"] = {
            "time": round_array(t).tolist(),
            "rk4_full": round_array(rk4_res).tolist(),
            "rk7_full": round_array(rk7_res).tolist(),
            "diff_full": round_array(diff_abs).tolist(),
        }

    if collect_stages and rk4_stages is not None and rk7_stages is not None:
        ds_idx = idx.tolist()
        # stages length is n-1; map any final time index to last stage index
        max_stage_index = len(rk4_stages) - 1
        mapped = [min(i, max_stage_index) for i in ds_idx]
        result["stages"] = {
            "rk4": [rk4_stages[i] for i in mapped],
            "rk7": [rk7_stages[i] for i in mapped],
        }

    return result


# Extract markdown cell contents from a Jupyter notebook file (returns list).
def extract_notebook_markdown(nb_path: Path):
    """Extract markdown cells from a notebook for optional embedding in the JSON."""
    try:
        raw = nb_path.read_text(encoding="utf-8")
        obj = json.loads(raw)
        md_cells = [c.get("source") for c in obj.get("cells", []) if c.get("cell_type") == "markdown"]
        return ["".join(cell) if isinstance(cell, list) else str(cell) for cell in md_cells]
    except Exception:
        return []


# Pretty-write an object to `path` as UTF-8 JSON and print confirmation.
def write_json(obj, path: Path):
    """Write a Python object as pretty JSON and print confirmation to stdout."""
    json_blob = json.dumps(obj, ensure_ascii=False, indent=2)
    path.write_text(json_blob, encoding="utf-8")
    print(f"Data stored in {path}")


def main():
    parser = argparse.ArgumentParser(description="Generate SEI data for web visualizations")
    parser.add_argument("--full", action="store_true", help="Include full resolution arrays in output")
    parser.add_argument("--stages", action="store_true", help="Include RK stage internals in output (can be large)")
    parser.add_argument("--notes", action="store_true", help="Embed notebook markdown notes into output")
    args = parser.parse_args()

    generated_at = datetime.now(timezone.utc).isoformat()
    sei_data = simulate_sei_model(collect_full=args.full, collect_stages=args.stages, include_notes=args.notes)

    data_dir = BASE_DIR / "web" / "data"
    data_dir.mkdir(exist_ok=True)

    extra_meta = {"generated_at": generated_at}
    if args.notes:
        nb_path = BASE_DIR / "notebooks" / "Kel-4-RK4&RK7-PSS24.ipynb"
        extra_meta["notes"] = extract_notebook_markdown(nb_path)

    write_json({**extra_meta, "sei_comparison": sei_data}, data_dir / "sei_data.json")
    write_json(extra_meta, data_dir / "metadata.json")


if __name__ == "__main__":
    main()
