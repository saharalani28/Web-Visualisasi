(() => {
  /* Lotka page script
     - Renders Lotka-Volterra charts and snapshot table
     - Provides a modal form for quick client-side parameter previews
     - Uses helpers exposed on `window.App` (chart creation, dataset loading)
  */
  const {
    COLORS,
    chartStore,
    rangeFormat,
    roundTo,
    cloneDataStructure,
    createChart,
    updateChartData,
    setStatus,
    loadDataset,
    setupRegenerateButton,
    updateBodyModalState,
  } = window.App;

  let originalLotkaData = null;
  let currentLotkaData = null;
  let lotkaFormInitialized = false;

  // Populate the parameter list UI with key/value pairs from `params`.
  const populateLotkaParams = (params = {}) => {
    const paramsList = document.getElementById("lv-params");
    if (!paramsList) return;
    paramsList.innerHTML = "";
    Object.entries(params).forEach(([key, value]) => {
      if (Array.isArray(value)) return;
      const item = document.createElement("li");
      item.innerHTML = `<strong>${key}</strong>: ${value}`;
      paramsList.appendChild(item);
    });
  };

  // Update page metadata elements (step and time range) from `lotka.parameters`.
  const updateLotkaMeta = (lotka) => {
    if (!lotka?.parameters) return;
    const { parameters } = lotka;
    const stepTarget = document.getElementById("lv-step");
    const rangeTarget = document.getElementById("lv-time-range");
    if (stepTarget && parameters.step !== undefined) {
      stepTarget.textContent = parameters.step;
    }
    if (rangeTarget && Array.isArray(parameters.time_span)) {
      rangeTarget.textContent = rangeFormat(parameters.time_span);
    }
    populateLotkaParams(parameters);
  };

  // Render a table of snapshot rows for selected time points.
  const updateLotkaSnapshots = (snapshots = []) => {
    const tableBody = document.getElementById("lv-table-body");
    if (!tableBody) return;
    tableBody.innerHTML = "";
    snapshots.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.time}</td>
        <td>${row.prey}</td>
        <td>${row.predator}</td>
      `;
      tableBody.appendChild(tr);
    });
  };

  // Push `lotka` arrays into the time and phase charts via `updateChartData`.
  const updateLotkaCharts = (lotka) => {
    if (!lotka) return;
    updateChartData("lv-time", {
      labels: lotka.time,
      datasets: [
        { data: lotka.prey },
        { data: lotka.predator },
      ],
    });
    const phasePoints = (lotka.phase_points || lotka.prey.map((value, idx) => [value, lotka.predator[idx]])).map(
      ([x, y]) => ({ x, y }),
    );
    updateChartData("lv-phase", {
      labels: [],
      datasets: [{ data: phasePoints }],
    });
  };

  // Set a small status message in the form area (info or error color).
  const updateLotkaStatus = (message, isError = false) => {
    const target = document.getElementById("lotka-form-status");
    if (target) {
      target.textContent = message;
      target.style.color = isError ? "#fb6f92" : "var(--muted)";
    }
  };

  // Apply incoming dataset: update meta, charts, snapshots and cache current data.
  const applyLotkaData = (lotkaData, { saveCurrent = true } = {}) => {
    if (!lotkaData) return;
    updateLotkaMeta(lotkaData);
    updateLotkaCharts(lotkaData);
    updateLotkaSnapshots(lotkaData.snapshots);
    if (saveCurrent) {
      currentLotkaData = cloneDataStructure(lotkaData);
    }
  };

  // Build a compact list of evenly spaced snapshots for the table view.
  const buildSnapshots = (time, prey, predator, count = 8) => {
    if (!Array.isArray(time) || time.length === 0) return [];
    const snapshots = [];
    const step = Math.max(1, Math.floor((time.length - 1) / Math.max(1, count - 1)));
    for (let i = 0; i < time.length && snapshots.length < count; i += step) {
      snapshots.push({
        time: roundTo(time[i]),
        prey: roundTo(prey[i]),
        predator: roundTo(predator[i]),
      });
    }
    if (snapshots.length < count) {
      const lastIdx = time.length - 1;
      const lastValue = {
        time: roundTo(time[lastIdx]),
        prey: roundTo(prey[lastIdx]),
        predator: roundTo(predator[lastIdx]),
      };
      const alreadyIncluded = snapshots[snapshots.length - 1];
      if (
        !alreadyIncluded ||
        alreadyIncluded.time !== lastValue.time ||
        alreadyIncluded.prey !== lastValue.prey ||
        alreadyIncluded.predator !== lastValue.predator
      ) {
        snapshots.push(lastValue);
      }
    }
    return snapshots;
  };

  // Normalize and enrich `lotka` with defaults (e.g., prey0/predator0) for UI use.
  const enrichLotkaData = (lotka) => {
    if (!lotka) return null;
    const clone = cloneDataStructure(lotka);
    clone.parameters = { ...(clone.parameters || {}) };
    const initialPrey = Array.isArray(clone.prey) ? clone.prey[0] : clone.parameters.prey;
    const initialPredator = Array.isArray(clone.predator) ? clone.predator[0] : clone.parameters.predator;
    clone.parameters.prey0 = roundTo(clone.parameters.prey0 ?? initialPrey ?? 10);
    clone.parameters.predator0 = roundTo(clone.parameters.predator0 ?? initialPredator ?? 5);
    return clone;
  };

  // Simple RK4 integrator implemented in-browser for quick parameter previews.
  const runLotkaRK4 = (config) => {
    const { alpha, beta, delta, gamma, prey0, predator0, step, timeSpan } = config;
    const [start, end] = timeSpan;
    const duration = Math.max(step, end - start);
    const steps = Math.max(2, Math.floor(duration / step) + 1);

    const time = [];
    const prey = [];
    const predator = [];

    let y1 = prey0;
    let y2 = predator0;

    const deriv = (val1, val2) => [
      alpha * val1 - beta * val1 * val2,
      delta * val1 * val2 - gamma * val2,
    ];

    for (let i = 0; i < steps; i++) {
      const currentTime = start + i * step;
      time.push(roundTo(currentTime));
      prey.push(roundTo(y1));
      predator.push(roundTo(y2));

      if (i === steps - 1) break;

      const [k1y1, k1y2] = deriv(y1, y2);
      const [k2y1, k2y2] = deriv(y1 + 0.5 * step * k1y1, y2 + 0.5 * step * k1y2);
      const [k3y1, k3y2] = deriv(y1 + 0.5 * step * k2y1, y2 + 0.5 * step * k2y2);
      const [k4y1, k4y2] = deriv(y1 + step * k3y1, y2 + step * k3y2);

      y1 += (step / 6) * (k1y1 + 2 * k2y1 + 2 * k3y1 + k4y1);
      y2 += (step / 6) * (k1y2 + 2 * k2y2 + 2 * k3y2 + k4y2);

      if (!Number.isFinite(y1) || !Number.isFinite(y2)) {
        return null;
      }
    }

    const phasePoints = prey.map((value, idx) => [roundTo(value), roundTo(predator[idx])]);

    return {
      time,
      prey,
      predator,
      phase_points: phasePoints,
      snapshots: buildSnapshots(time, prey, predator),
      parameters: {
        alpha: roundTo(alpha),
        beta: roundTo(beta),
        delta: roundTo(delta),
        gamma: roundTo(gamma),
        step: roundTo(step),
        time_span: [roundTo(start), roundTo(end)],
        prey0: roundTo(prey0),
        predator0: roundTo(predator0),
      },
    };
  };

  // Wrapper to run a quick browser-side simulation using current generator parameters.
  const simulateLotkaJS = (overrides = {}) => {
    if (!originalLotkaData?.parameters) return null;
    const base = originalLotkaData.parameters;
    const config = {
      alpha: Number.isFinite(overrides.alpha) ? overrides.alpha : base.alpha ?? 1,
      beta: Number.isFinite(overrides.beta) ? overrides.beta : base.beta ?? 0.1,
      delta: Number.isFinite(overrides.delta) ? overrides.delta : base.delta ?? 0.1,
      gamma: Number.isFinite(overrides.gamma) ? overrides.gamma : base.gamma ?? 1,
      prey0: Number.isFinite(overrides.prey0) ? overrides.prey0 : base.prey0 ?? base.prey ?? 10,
      predator0: Number.isFinite(overrides.predator0)
        ? overrides.predator0
        : base.predator0 ?? base.predator ?? 5,
      step: base.step && base.step > 0 ? base.step : 0.05,
      timeSpan: Array.isArray(base.time_span) ? [...base.time_span] : [0, 50],
    };
    return runLotkaRK4(config);
  };

  // Show the Lotka parameter modal and mark body modal state.
  const openLotkaModal = () => {
    const modal = document.getElementById("lotka-modal");
    if (!modal) return;
    modal.classList.add("is-visible");
    modal.setAttribute("aria-hidden", "false");
    updateBodyModalState();
  };

  // Hide the Lotka parameter modal and restore body state.
  const closeLotkaModal = () => {
    const modal = document.getElementById("lotka-modal");
    if (!modal) return;
    modal.classList.remove("is-visible");
    modal.setAttribute("aria-hidden", "true");
    updateBodyModalState();
  };

  // Attach click and keyboard handlers to modal close interactions.
  const setupLotkaModalHandlers = () => {
    const modal = document.getElementById("lotka-modal");
    const closeBtn = document.getElementById("lotka-modal-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", closeLotkaModal);
    }
    if (modal) {
      modal.addEventListener("click", (event) => {
        if (event.target === modal) {
          closeLotkaModal();
        }
      });
    }
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modal?.classList.contains("is-visible")) {
        closeLotkaModal();
      }
    });
  };

  // Initialize the parameter form: populate fields, handle submit and reset.
  const setupLotkaForm = () => {
    if (lotkaFormInitialized) return;
    const form = document.getElementById("lotka-form");
    const openBtn = document.getElementById("open-lotka-modal");
    const resetBtn = document.getElementById("lotka-reset-btn");
    if (!form || !openBtn || !originalLotkaData) return;
    lotkaFormInitialized = true;

    const fieldNames = ["alpha", "beta", "delta", "gamma", "prey0", "predator0"];
    const fields = fieldNames.reduce((acc, name) => {
      acc[name] = form.elements[name];
      return acc;
    }, {});

    const setFieldValues = (lotka) => {
      if (!lotka?.parameters) return;
      fieldNames.forEach((name) => {
        if (fields[name]) {
          const value =
            lotka.parameters[name] ??
            (name === "prey0" ? lotka.prey?.[0] : lotka.predator?.[0]) ??
            originalLotkaData.parameters[name];
          fields[name].value = value ?? "";
        }
      });
    };

    const collectValues = () => {
      const payload = {};
      fieldNames.forEach((name) => {
        const val = parseFloat(fields[name]?.value);
        if (Number.isFinite(val)) {
          payload[name] = val;
        }
      });
      return payload;
    };

    setFieldValues(currentLotkaData || originalLotkaData);
    updateLotkaStatus("Menampilkan data bawaan generator.");

    openBtn.addEventListener("click", () => {
      if (!currentLotkaData) {
        alert("Data sedang dimuat. Silakan coba lagi setelah beberapa detik.");
        return;
      }
      setFieldValues(currentLotkaData);
      updateLotkaStatus("Sesuaikan parameter, lalu jalankan simulasi.");
      openLotkaModal();
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const overrides = collectValues();
      const result = simulateLotkaJS(overrides);
      if (!result) {
        updateLotkaStatus("Simulasi gagal dijalankan. Coba parameter lain.", true);
        return;
      }
      applyLotkaData(result);
      updateLotkaStatus("Menampilkan hasil simulasi kustom (tidak tersimpan).");
      closeLotkaModal();
    });

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        setFieldValues(originalLotkaData);
        applyLotkaData(cloneDataStructure(originalLotkaData));
        updateLotkaStatus("Menampilkan data bawaan generator.");
        closeLotkaModal();
      });
    }
  };

  // Create charts and initialize UI for the Lotka page using `lotka` payload.
  const renderLotkaSection = (lotka) => {
    const lvCanvas = document.getElementById("lv-time-chart");
    createChart({
      canvas: lvCanvas,
      chartId: "lv-time",
      title: "Populasi vs Waktu",
      data: {
        labels: lotka.time,
        datasets: [
          {
            label: "Prey (Kelinci)",
            data: lotka.prey,
            borderColor: COLORS.prey,
            tension: 0.3,
          },
          {
            label: "Predator (Serigala)",
            data: lotka.predator,
            borderColor: COLORS.predator,
            tension: 0.3,
          },
        ],
      },
    });

    const lvPhasePoints = lotka.phase_points.map(([x, y]) => ({ x, y }));
    const phaseCanvas = document.getElementById("lv-phase-chart");
    createChart({
      canvas: phaseCanvas,
      chartId: "lv-phase",
      title: "Phase Portrait",
      type: "scatter",
      data: {
        datasets: [
          {
            label: "Orbit Populasi",
            data: lvPhasePoints,
            borderColor: COLORS.prey,
            backgroundColor: "rgba(69, 210, 255, 0.15)",
            showLine: true,
            pointRadius: 2,
          },
        ],
      },
      options: {
        interaction: { mode: "nearest", intersect: false },
        scales: {
          x: {
            title: { display: true, text: "Prey", color: "#b3b3b3" },
          },
          y: {
            title: { display: true, text: "Predator", color: "#b3b3b3" },
          },
        },
      },
    });

    const enriched = enrichLotkaData(lotka);
    if (!originalLotkaData) {
      originalLotkaData = cloneDataStructure(enriched);
    }
    applyLotkaData(cloneDataStructure(enriched));
    if (!lotkaFormInitialized) {
      setupLotkaForm();
    }
  };

  // Page bootstrap: wire modal, regenerate button, load dataset and render.
  const initLotkaPage = async () => {
    setupLotkaModalHandlers();
    setupRegenerateButton({
      endpoint: "/regenerate/lotka",
      message: "Jalankan `python scripts/generate_lotka.py` jika permintaan otomatis gagal.",
      workingLabel: "Membuat data Lotka...",
    });
    setStatus("Memuat dataset Lotka-Volterra...");
    try {
      const data = await loadDataset("../data/lotka_data.json");
      chartStore.clear();
      setStatus(new Date(data.generated_at).toLocaleString("id-ID"));
      renderLotkaSection(data.lotka_volterra);
    } catch (error) {
      console.error(error);
      setStatus("Gagal memuat data simulasi", true);
      alert(
        "Data belum tersedia. Jalankan `python scripts/generate_lotka.py` dari folder proyek untuk membuat data.",
      );
    }
  };

  document.addEventListener("DOMContentLoaded", initLotkaPage);
})();
