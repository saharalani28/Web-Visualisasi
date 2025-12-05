import json
import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np


BASE_DIR = Path(__file__).resolve().parent.parent
DECIMALS = 4


def improved_rk5_lotka_volterra(f, t_span, y0, h, n_steps_back=1, collect_stages=False):
    # Integrator: improved RK5-like scheme for Lotka-Volterra; optional stages.
    """Improved Runge-Kutta order-5 integrator for Lotka-Volterra."""
    t_start, t_end = t_span
    n_steps = int((t_end - t_start) / h) + 1
    t = np.linspace(t_start, t_end, n_steps)

    y = np.zeros((n_steps, len(y0)))
    y[0] = y0

    stages = [] if collect_stages else None
    for i in range(min(n_steps_back, n_steps - 1)):
        k1 = f(t[i], y[i])
        k2 = f(t[i] + h / 2, y[i] + h / 2 * k1)
        k3 = f(t[i] + h / 2, y[i] + h / 2 * k2)
        k4 = f(t[i] + h, y[i] + h * k3)
        y[i + 1] = y[i] + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4)
        if collect_stages:
            stages.append([k1.tolist(), k2.tolist(), k3.tolist(), k4.tolist()])

    for i in range(n_steps_back, n_steps - 1):
        k1 = f(t[i], y[i])
        k2 = f(t[i] + 0.25 * h, y[i] + 0.25 * h * k1)
        k3 = f(t[i] + 0.25 * h, y[i] - 0.7272 * h * k1 + 0.7322 * h * k2)
        k4 = f(t[i] + 0.5 * h, y[i] + 0.5734 * h * k1 - 2.2485 * h * k2 + 3.344 * h * k3)
        k5 = f(
            t[i] + 0.75 * h,
            y[i] + 0.1750 * h * k1 + 0.0121 * h * k2 + 0.0559 * h * k3 + 0.5517 * h * k4,
        )

        k_1 = f(t[i - 1], y[i - 1])
        k_2 = f(t[i - 1] + 0.25 * h, y[i - 1] + 0.25 * h * k_1)
        k_3 = f(t[i - 1] + 0.25 * h, y[i - 1] - 0.7272 * h * k_1 + 0.7322 * h * k_2)
        k_4 = f(t[i - 1] + 0.5 * h, y[i - 1] + 0.5734 * h * k_1 - 2.2485 * h * k_2 + 3.344 * h * k_3)
        k_5 = f(
            t[i - 1] + 0.75 * h,
            y[i - 1] + 0.1750 * h * k_1 + 0.0121 * h * k_2 + 0.0559 * h * k_3 + 0.5517 * h * k_4,
        )

        y[i + 1] = y[i] + h * (
            1.0222 * k1
            - 0.0222 * k_1
            - 0.0961 * (k2 - k_2)
            + 0.0295 * (k3 - k_3)
            - 0.1 * (k4 - k_4)
            + 0.06444 * (k5 - k_5)
        )
        if collect_stages:
            stages.append([k1.tolist(), k2.tolist(), k3.tolist(), k4.tolist(), k5.tolist(), k_1.tolist(), k_2.tolist(), k_3.tolist(), k_4.tolist(), k_5.tolist()])

    return (t, y, stages) if collect_stages else (t, y)


def lotka_volterra(_t, y, alpha=1.0, beta=0.1, delta=0.1, gamma=1.0):
    # Model derivative function for Lotka-Volterra (dprey, dpredator).
    """Derivative function for the Lotka-Volterra predator-prey model."""
    y1, y2 = y
    return np.array(
        [
            alpha * y1 - beta * y1 * y2,
            delta * y1 * y2 - gamma * y2,
        ]
    )


def downsample_series(array, limit=400):
    # Downsample an array evenly to at most `limit` points for smaller JSON.
    """Reduce array length to `limit` by evenly sampling indices."""
    arr = np.asarray(array)
    if len(arr) <= limit:
        return arr
    idx = np.linspace(0, len(arr) - 1, limit, dtype=int)
    return arr[idx]


def round_array(array, ndigits=DECIMALS):
    # Round numeric array elements to `ndigits` for consistent JSON output.
    return np.round(np.asarray(array, dtype=float), ndigits)


def round_value(value, ndigits=DECIMALS):
    # Round a single numeric value safely for JSON serialization.
    return round(float(value), ndigits)


def simulate_lotka_volterra(collect_full=False, collect_stages=False, include_notes=False):
    # Run the Lotka simulation and assemble a JSON-serializable result dict.
    """Run a Lotka-Volterra simulation and return a serializable dict."""
    t_span = (0, 50)
    h = 0.05
    y0 = np.array([10.0, 5.0])

    if collect_stages:
        t, y, stages = improved_rk5_lotka_volterra(lambda _t, _y: lotka_volterra(_t, _y), t_span, y0, h, collect_stages=True)
    else:
        t, y = improved_rk5_lotka_volterra(lambda _t, _y: lotka_volterra(_t, _y), t_span, y0, h)

    ds_time = round_array(t if collect_full else downsample_series(t))
    prey = round_array(y[:, 0] if collect_full else downsample_series(y[:, 0]))
    predator = round_array(y[:, 1] if collect_full else downsample_series(y[:, 1]))
    phase = np.round(np.stack((prey, predator), axis=1), DECIMALS).tolist()

    snapshots = []
    for idx in np.linspace(0, len(t) - 1, 8, dtype=int):
        snapshots.append(
            {
                "time": round_value(t[idx]),
                "prey": round_value(y[idx, 0]),
                "predator": round_value(y[idx, 1]),
            }
        )
    result = {
        "time": ds_time.tolist(),
        "prey": prey.tolist(),
        "predator": predator.tolist(),
        "phase_points": phase,
        "snapshots": snapshots,
        "parameters": {
            "alpha": 1.0,
            "beta": 0.1,
            "delta": 0.1,
            "gamma": 1.0,
            "step": round_value(h),
            "time_span": [round_value(v) for v in t_span],
        },
    }

    if collect_full:
        result["full"] = {
            "time": round_array(t).tolist(),
            "prey_full": round_array(y[:, 0]).tolist(),
            "predator_full": round_array(y[:, 1]).tolist(),
        }

    if collect_stages and stages is not None:
        ds_idx = np.linspace(0, len(t) - 1, len(ds_time), dtype=int).tolist()
        max_stage_index = len(stages) - 1
        mapped = [min(i, max_stage_index) for i in ds_idx]
        result["stages"] = [stages[i] for i in mapped]

    return result


def extract_notebook_markdown(nb_path: Path):
    # Read a .ipynb and return a list of markdown cell strings (or empty list).
    """Extract markdown cell contents from a Jupyter notebook file."""
    try:
        raw = nb_path.read_text(encoding="utf-8")
        obj = json.loads(raw)
        md_cells = [c.get("source") for c in obj.get("cells", []) if c.get("cell_type") == "markdown"]
        return ["".join(cell) if isinstance(cell, list) else str(cell) for cell in md_cells]
    except Exception:
        return []



def write_json(obj, path: Path):
    # Pretty-write a Python object as UTF-8 JSON and print a confirmation.
    """Write a Python object as pretty JSON to `path` and print confirmation."""
    json_blob = json.dumps(obj, ensure_ascii=False, indent=2)
    path.write_text(json_blob, encoding="utf-8")
    print(f"Data stored in {path}")


def main():
    # CLI entrypoint: parse flags and write `lotka_data.json` and `metadata.json`.
    parser = argparse.ArgumentParser(description="Generate Lotka-Volterra data for web visualizations")
    parser.add_argument("--full", action="store_true", help="Include full resolution arrays in output")
    parser.add_argument("--stages", action="store_true", help="Include RK stage internals in output (can be large)")
    parser.add_argument("--notes", action="store_true", help="Embed notebook markdown notes into output")
    args = parser.parse_args()

    generated_at = datetime.now(timezone.utc).isoformat()
    lotka_data = simulate_lotka_volterra(collect_full=args.full, collect_stages=args.stages, include_notes=args.notes)

    data_dir = BASE_DIR / "web" / "data"
    data_dir.mkdir(exist_ok=True)

    extra_meta = {"generated_at": generated_at}
    if args.notes:
        nb_path = BASE_DIR / "notebooks" / "IRK5-OtkaVolterra.ipynb"
        extra_meta["notes"] = extract_notebook_markdown(nb_path)

    write_json({**extra_meta, "lotka_volterra": lotka_data}, data_dir / "lotka_data.json")
    write_json(extra_meta, data_dir / "metadata.json")


if __name__ == "__main__":
    main()
