(() => {
  /* SEI page script
     - Builds charts comparing RK4 vs RK7 results for each compartment
     - Shows a stacked diff chart and provides modal parameter previews
     - Intended to be data-driven (loads `sei_data.json`) and uses `window.App` helpers
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
    numberFormat,
    updateBodyModalState,
  } = window.App;

  const SEI_DEFAULT_PARAMS = {
    N: 52,
    pi: 0.6,
    mu: 0.4,
    alpha1: 0.009,
    alpha2: 0.007,
    beta: 0.83,
    epsilon: 0.8,
    tau: 0.16,
    rho: 0.25,
    delta: 0.25,
    gamma: 0.5,
  };
  const SEI_DEFAULT_INITIAL = {
    S0: 24,
    E0: 15,
    I10: 6,
    I20: 2,
    R0: 5,
  };
  const SEI_LABELS_FALLBACK = ["S (Rentan)", "E (Terpapar)", "I1 (Kecanduan Awal)", "I2 (Kecanduan Parah)", "R (Sembuh)"];

  let originalSeiData = null;
  let currentSeiData = null;
  let currentSeiConfig = null;
  let seiFormInitialized = false;

  // Update small status text for the SEI form area (info or error state).
  const updateSeiStatus = (message, isError = false) => {
    const target = document.getElementById("sei-form-status");
    if (target) {
      target.textContent = message;
      target.style.color = isError ? "#fb6f92" : "var(--muted)";
    }
  };

  // Update page metadata elements (step and time window) from `sei` payload.
  const updateSeiMeta = (sei) => {
    if (!sei) return;
    const stepTarget = document.getElementById("sei-step");
    if (stepTarget && sei.step !== undefined) {
      stepTarget.textContent = sei.step;
    }
    const rangeTarget = document.getElementById("sei-time-range");
    if (rangeTarget && Array.isArray(sei.time_window)) {
      rangeTarget.textContent = rangeFormat(sei.time_window);
    }
  };

  // Render the stats list summarizing max/mean absolute differences per label.
  const updateSeiStats = (stats = []) => {
    const statList = document.getElementById("sei-stats");
    if (!statList) return;
    statList.innerHTML = "";
    stats.forEach((item) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${item.label}</strong>: maks ${numberFormat(item.max_abs, 4)}, rata ${numberFormat(
        item.mean_abs,
        4,
      )}`;
      statList.appendChild(li);
    });
  };

  // Populate per-compartment RK4 vs RK7 charts and the stacked diff chart.
  const updateSeiCharts = (sei) => {
    if (!sei) return;
    sei.labels.forEach((_label, idx) => {
      updateChartData(`sei-chart-${idx}`, {
        labels: sei.time,
        datasets: [
          { data: sei.rk7.map((row) => row[idx]) },
          { data: sei.rk4.map((row) => row[idx]) },
        ],
      });
    });
    updateChartData("sei-diff", {
      labels: sei.time,
      datasets: sei.labels.map((_label, idx) => ({
        data: sei.diff_abs.map((row) => row[idx]),
      })),
    });
  };

  // Extract model parameters and initial values from dataset or fallbacks.
  const extractSeiConfig = (sei) => ({
    params: cloneDataStructure(sei?.parameters?.model ?? SEI_DEFAULT_PARAMS),
    initial: cloneDataStructure(sei?.parameters?.initial ?? SEI_DEFAULT_INITIAL),
  });

  // Normalize dataset: ensure labels, parameters and initial states are present.
  const enrichSeiData = (sei) => {
    const clone = cloneDataStructure(sei);
    clone.labels = Array.isArray(clone.labels) && clone.labels.length ? clone.labels : SEI_LABELS_FALLBACK.slice();
    const firstState = Array.isArray(clone.rk7) && clone.rk7.length ? clone.rk7[0] : null;
    const derivedInitial = firstState
      ? {
          S0: roundTo(firstState[0]),
          E0: roundTo(firstState[1]),
          I10: roundTo(firstState[2]),
          I20: roundTo(firstState[3]),
          R0: roundTo(firstState[4]),
        }
      : {};
    clone.parameters = clone.parameters || {};
    clone.parameters.model = { ...SEI_DEFAULT_PARAMS, ...(clone.parameters.model || {}) };
    clone.parameters.initial = {
      ...SEI_DEFAULT_INITIAL,
      ...(clone.parameters.initial || {}),
      ...derivedInitial,
    };
    return clone;
  };

  // Combine base state with weighted derivative terms (helper for RK implementations).
  const combineState = (state, terms) =>
    state.map((value, idx) => value + terms.reduce((sum, { vec, coeff }) => sum + coeff * vec[idx], 0));

  // Compute time derivatives for SEI1I2R given state and model parameters.
  const seiDerivative = (state, params) => {
    const { N, pi, mu, alpha1, alpha2, beta, epsilon, tau, rho, delta, gamma } = params;
    const [S, E, I1, I2, R] = state;
    const dS = pi * N - S * (mu + alpha1 * I1 + alpha2 * I2);
    const dE = S * (alpha1 * I1 + alpha2 * I2) - E * (mu + beta);
    const dI1 = E * beta + rho * R + delta * I2 - I1 * (mu + epsilon + tau);
    const dI2 = I1 * epsilon - I2 * (mu + delta + gamma);
    const dR = I1 * tau - I2 * gamma - R * (mu + rho);
    return [dS, dE, dI1, dI2, dR];
  };

  // Single RK4 step for the SEI model.
  const rk4StepSei = (state, params, h) => {
    const k1 = seiDerivative(state, params);
    const k2 = seiDerivative(combineState(state, [{ vec: k1, coeff: h / 2 }]), params);
    const k3 = seiDerivative(combineState(state, [{ vec: k2, coeff: h / 2 }]), params);
    const k4 = seiDerivative(combineState(state, [{ vec: k3, coeff: h }]), params);
    return state.map((value, idx) => value + (h / 6) * (k1[idx] + 2 * k2[idx] + 2 * k3[idx] + k4[idx]));
  };

  // Single RK7 step used for higher-order reference integration.
  const rk7StepSei = (state, params, h) => {
    const k1 = seiDerivative(state, params);
    const k2 = seiDerivative(combineState(state, [{ vec: k1, coeff: h / 6 }]), params);
    const k3 = seiDerivative(
      combineState(state, [
        { vec: k1, coeff: h / 12 },
        { vec: k2, coeff: h / 12 },
      ]),
      params,
    );
    const k4 = seiDerivative(
      combineState(state, [
        { vec: k1, coeff: h / 8 },
        { vec: k3, coeff: (3 * h) / 8 },
      ]),
      params,
    );
    const k5 = seiDerivative(
      combineState(state, [
        { vec: k1, coeff: h / 6 },
        { vec: k3, coeff: (-3 * h) / 6 },
        { vec: k4, coeff: (4 * h) / 6 },
      ]),
      params,
    );
    const k6 = seiDerivative(
      combineState(state, [
        { vec: k1, coeff: (11 * h) / 150 },
        { vec: k3, coeff: (-54 * h) / 150 },
        { vec: k4, coeff: (40 * h) / 150 },
        { vec: k5, coeff: (27 * h) / 150 },
      ]),
      params,
    );
    const k7 = seiDerivative(
      combineState(state, [
        { vec: k1, coeff: h / 6 },
        { vec: k4, coeff: (4 * h) / 6 },
        { vec: k5, coeff: h / 6 },
      ]),
      params,
    );
    return state.map(
      (value, idx) =>
        value + (h / 90) * (7 * k1[idx] + 32 * k3[idx] + 12 * k4[idx] + 32 * k5[idx] + 7 * k7[idx]),
    );
  };

  // Run both RK4 and RK7 across the time window and compute diffs/stats.
  const runSeiModel = ({ params, initial, step, timeWindow, labels }) => {
    const [start, end] = timeWindow;
    const h = Math.max(1e-4, step);
    const totalSteps = Math.max(2, Math.floor((end - start) / h) + 1);
    const time = [];
    const rk4 = new Array(totalSteps);
    const rk7 = new Array(totalSteps);
    let state4 = [initial.S0, initial.E0, initial.I10, initial.I20, initial.R0];
    let state7 = [...state4];
    for (let i = 0; i < totalSteps; i++) {
      const currentTime = start + i * h;
      time.push(roundTo(currentTime));
      rk4[i] = state4.map((value) => roundTo(value));
      rk7[i] = state7.map((value) => roundTo(value));
      if (i === totalSteps - 1) {
        break;
      }
      state4 = rk4StepSei(state4, params, h);
      state7 = rk7StepSei(state7, params, h);
      if (!state4.every(Number.isFinite) || !state7.every(Number.isFinite)) {
        return null;
      }
    }
    const diffAbs = rk4.map((row, rowIndex) =>
      row.map((value, idx) => roundTo(Math.abs(value - rk7[rowIndex][idx]))),
    );
    const chartLabels = labels && labels.length ? labels : SEI_LABELS_FALLBACK.slice();
    const stats = chartLabels.map((label, idx) => {
      const series = diffAbs.map((row) => row[idx]);
      const maxAbs = Math.max(...series);
      const meanAbs = series.reduce((sum, value) => sum + value, 0) / series.length;
      return { label, max_abs: roundTo(maxAbs), mean_abs: roundTo(meanAbs) };
    });
    return {
      time,
      labels: chartLabels,
      rk4,
      rk7,
      diff_abs: diffAbs,
      stats,
      step: roundTo(h),
      time_window: [roundTo(start), roundTo(end)],
      parameters: {
        model: { ...params },
        initial: { ...initial },
      },
    };
  };

  // Wrapper to run a browser-side SEI simulation using current or overridden params.
  const simulateSeiJS = (payload = {}) => {
    if (!originalSeiData) return null;
    const baseConfig = currentSeiConfig || extractSeiConfig(originalSeiData);
    const params = { ...baseConfig.params, ...(payload.params || {}) };
    const initial = { ...baseConfig.initial, ...(payload.initial || {}) };
    const step = originalSeiData.step || 0.05;
    const timeWindow = originalSeiData.time_window || [0, 60];
    const labels = originalSeiData.labels || SEI_LABELS_FALLBACK;
    return runSeiModel({ params, initial, step, timeWindow, labels });
  };

  // Apply the dataset to the page: update meta, charts, stats and cache config.
  const applySeiData = (seiData, { saveCurrent = true, statusMessage } = {}) => {
    if (!seiData) return;
    updateSeiMeta(seiData);
    updateSeiStats(seiData.stats || []);
    updateSeiCharts(seiData);
    if (saveCurrent) {
      currentSeiData = cloneDataStructure(seiData);
      currentSeiConfig = extractSeiConfig(seiData);
      updateSeiStatus(statusMessage || "Menampilkan data aktif.");
    } else if (statusMessage) {
      updateSeiStatus(statusMessage);
    }
  };

  // Show the SEI parameter modal and mark body modal state.
  const openSeiModal = () => {
    const modal = document.getElementById("sei-modal");
    if (!modal) return;
    modal.classList.add("is-visible");
    modal.setAttribute("aria-hidden", "false");
    updateBodyModalState();
  };

  // Hide the SEI parameter modal and restore body state.
  const closeSeiModal = () => {
    const modal = document.getElementById("sei-modal");
    if (!modal) return;
    modal.classList.remove("is-visible");
    modal.setAttribute("aria-hidden", "true");
    updateBodyModalState();
  };

  // Attach event handlers for closing the SEI modal (click/backdrop/Escape).
  const setupSeiModalHandlers = () => {
    const modal = document.getElementById("sei-modal");
    const closeBtn = document.getElementById("sei-modal-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", closeSeiModal);
    }
    if (modal) {
      modal.addEventListener("click", (event) => {
        if (event.target === modal) {
          closeSeiModal();
        }
      });
    }
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modal?.classList.contains("is-visible")) {
        closeSeiModal();
      }
    });
  };

  // Initialize the SEI parameter form: populate fields and handle submit/reset.
  const setupSeiForm = () => {
    if (seiFormInitialized) return;
    const form = document.getElementById("sei-form");
    const openBtn = document.getElementById("open-sei-modal");
    const resetBtn = document.getElementById("sei-reset-btn");
    if (!form || !openBtn || !originalSeiData) return;
    seiFormInitialized = true;

    const paramFields = ["pi", "mu", "alpha1", "alpha2", "beta", "epsilon", "tau", "rho", "delta", "gamma"];
    const initialFields = ["S0", "E0", "I10", "I20", "R0"];
    const fields = [...paramFields, ...initialFields].reduce((acc, name) => {
      acc[name] = form.elements[name];
      return acc;
    }, {});

    const setFieldValues = () => {
      if (!currentSeiConfig) return;
      paramFields.forEach((name) => {
        if (fields[name]) {
          fields[name].value = currentSeiConfig.params[name] ?? "";
        }
      });
      initialFields.forEach((name) => {
        if (fields[name]) {
          fields[name].value = currentSeiConfig.initial[name] ?? "";
        }
      });
    };

    const collectValues = () => {
      const params = {};
      const initial = {};
      paramFields.forEach((name) => {
        const val = parseFloat(fields[name]?.value);
        if (Number.isFinite(val)) {
          params[name] = val;
        }
      });
      initialFields.forEach((name) => {
        const val = parseFloat(fields[name]?.value);
        if (Number.isFinite(val)) {
          initial[name] = val;
        }
      });
      return { params, initial };
    };

    setFieldValues();

    openBtn.addEventListener("click", () => {
      if (!currentSeiData) {
        alert("Data SEI belum siap. Tunggu hingga pemuatan selesai.");
        return;
      }
      setFieldValues();
      updateSeiStatus("Sesuaikan parameter, lalu jalankan simulasi.");
      openSeiModal();
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const payload = collectValues();
      const result = simulateSeiJS(payload);
      if (!result) {
        updateSeiStatus("Simulasi gagal dijalankan. Periksa parameter.", true);
        return;
      }
      applySeiData(result, { statusMessage: "Menampilkan hasil simulasi kustom (tidak tersimpan)." });
      closeSeiModal();
    });

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        applySeiData(cloneDataStructure(originalSeiData), {
          statusMessage: "Menampilkan data bawaan generator.",
        });
        closeSeiModal();
      });
    }
  };

  // Build per-compartment chart cards and the difference chart from dataset.
  const renderSeiSection = (sei) => {
    const enriched = enrichSeiData(sei);
    const grid = document.getElementById("sei-chart-grid");
    grid.innerHTML = "";
    enriched.labels.forEach((label, idx) => {
      const card = document.createElement("article");
      card.className = "card";
      const chartId = `sei-chart-${idx}`;
      card.innerHTML = `
        <header class="card__header">
          <div>
            <h3>${label}</h3>
            <p>Perbandingan garis penuh RK7 vs putus RK4.</p>
          </div>
          <button class="zoom-btn" type="button" data-chart-id="${chartId}">Perbesar</button>
        </header>
        <canvas id="${chartId}" height="120"></canvas>
      `;
      grid.appendChild(card);

      const canvas = card.querySelector("canvas");
      createChart({
        canvas,
        chartId,
        title: `${label} - RK4 vs RK7`,
        data: {
          labels: enriched.time,
          datasets: [
            {
              label: "RK7",
              data: enriched.rk7.map((row) => row[idx]),
              borderColor: COLORS.stats[idx],
              borderWidth: 2,
            },
            {
              label: "RK4",
              data: enriched.rk4.map((row) => row[idx]),
              borderColor: "rgba(255,255,255,0.5)",
              borderDash: [6, 4],
              borderWidth: 1.5,
            },
          ],
        },
      });
    });

    const diffCanvas = document.getElementById("sei-diff-chart");
    createChart({
      canvas: diffCanvas,
      chartId: "sei-diff",
      title: "Perbedaan Absolut RK4 vs RK7",
      data: {
        labels: enriched.time,
        datasets: enriched.labels.map((label, idx) => ({
          label,
          data: enriched.diff_abs.map((row) => row[idx]),
          borderColor: COLORS.stats[idx],
          fill: false,
          tension: 0.3,
        })),
      },
      options: {
        plugins: {
          legend: { position: "bottom", labels: { color: "#f5f5f5" } },
        },
      },
    });

    if (!originalSeiData) {
      originalSeiData = cloneDataStructure(enriched);
    }
    applySeiData(enriched, { statusMessage: "Menampilkan data bawaan generator." });
    if (!seiFormInitialized) {
      setupSeiForm();
    }
  };

  const initSeiPage = async () => {
    setupSeiModalHandlers();
    setupRegenerateButton({
      endpoint: "/regenerate/sei",
      message: "Jalankan `python scripts/generate_sei.py` jika permintaan otomatis gagal.",
      workingLabel: "Membuat data SEI...",
    });
    setStatus("Memuat dataset SEI₁I₂R...");
    try {
      const data = await loadDataset("../data/sei_data.json");
      chartStore.clear();
      setStatus(new Date(data.generated_at).toLocaleString("id-ID"));
      renderSeiSection(data.sei_comparison);
    } catch (error) {
      console.error(error);
      setStatus("Gagal memuat data simulasi", true);
      alert(
        "Data belum tersedia. Jalankan `python scripts/generate_sei.py` dari folder proyek untuk membuat data.",
      );
    }
  };

  document.addEventListener("DOMContentLoaded", initSeiPage);
})();
