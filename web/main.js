const COLORS = {
  prey: "#45d2ff",
  predator: "#fb6f92",
  stats: ["#4bc0c0", "#ff9f40", "#ef5350", "#ce93d8", "#66bb6a"],
};

const chartStore = new Map();
let zoomChartInstance = null;
let zoomPluginRegistered = false;
const MIN_ZOOM_RANGE = { x: 5, y: 1.5 };

// Format a numeric value to a fixed number of decimal places.
const numberFormat = (value, digits = 2) => Number.parseFloat(value).toFixed(digits);
// Format a numeric range as `min -> max` for display.
const rangeFormat = (range) => `${numberFormat(range[0])} -> ${numberFormat(range[1])}`;
// Deep-clone a serializable value via JSON as a fallback.
const deepClone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
// Clone data using `structuredClone` when available, otherwise fallback.
const cloneDataStructure = (value) => (typeof structuredClone === "function" ? structuredClone(value) : deepClone(value));
// Safely round numeric values to a fixed number of digits.
const roundTo = (value, digits = 4) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Number(num.toFixed(digits));
};

// Toggle `body.modal-open` depending on visible modal dialogs.
const updateBodyModalState = () => {
  const zoomVisible = document.getElementById("zoom-modal")?.classList.contains("is-visible");
  const lotkaVisible = document.getElementById("lotka-modal")?.classList.contains("is-visible");
  const seiVisible = document.getElementById("sei-modal")?.classList.contains("is-visible");
  if (zoomVisible || lotkaVisible || seiVisible) {
    document.body.classList.add("modal-open");
  } else {
    document.body.classList.remove("modal-open");
  }
};

// Return true when `value` is a plain object (not an array).
const isPlainObject = (value) => value && typeof value === "object" && !Array.isArray(value);

// Recursively merge two objects/arrays producing a new object.
const mergeObjects = (target, source) => {
  const result = Array.isArray(target) ? [...target] : { ...target };
  Object.entries(source || {}).forEach(([key, value]) => {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = mergeObjects(result[key], value);
    } else if (Array.isArray(value)) {
      result[key] = value.slice();
    } else {
      result[key] = value;
    }
  });
  return result;
};

/* Register Chart.js zoom plugin if available. This is optional and
   safe to call multiple times; it sets `zoomPluginRegistered` when done. */
// Register Chart.js zoom plugin if available in the page scope.
const registerZoomPlugin = () => {
  if (zoomPluginRegistered || !window.Chart || !window.Chart.register) return;
  const plugin =
    window["chartjs-plugin-zoom"] ||
    window.ChartZoom ||
    window.ChartZoomPlugin ||
    window.chartjsPluginZoom ||
    window.ChartZoomPlugin;

  if (plugin) {
    Chart.register(plugin);
    zoomPluginRegistered = true;
  }
};

/* Build base Chart.js options with consistent styling and optional zoom.
  Returned object is merged into per-chart options before instantiation. */
// Build base Chart.js option object (styling and optional zoom settings).
const getBaseOptions = () => {
  const base = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { labels: { color: "#f5f5f5" } },
      tooltip: {
        backgroundColor: "rgba(0,0,0,0.8)",
      },
    },
    scales: {
      x: {
        ticks: { color: "#b3b3b3" },
        grid: { color: "rgba(255,255,255,0.05)" },
      },
      y: {
        ticks: { color: "#b3b3b3" },
        grid: { color: "rgba(255,255,255,0.05)" },
      },
    },
  };

  if (zoomPluginRegistered) {
    base.plugins.zoom = {
      limits: {
        x: { min: "original", max: "original", minRange: MIN_ZOOM_RANGE.x },
        y: { min: "original", max: "original", minRange: MIN_ZOOM_RANGE.y },
      },
      pan: {
        enabled: true,
        mode: "xy",
        modifierKey: "shift",
      },
      zoom: {
        wheel: {
          enabled: true,
          speed: 0.08,
          modifierKey: "ctrl",
        },
        pinch: { enabled: true },
        drag: {
          enabled: true,
          borderColor: "#45d2ff",
          borderWidth: 1,
          modifierKey: "ctrl",
        },
        mode: "xy",
      },
    };
  }

  return base;
};

// Enhance axes configuration with readable ticks and titles.
const enhanceAxesOptions = (options = {}, tickSize = 12) => {
  const next = mergeObjects({}, options);
  next.scales = next.scales || {};
  ["x", "y"].forEach((axis) => {
    const axisOptions = next.scales[axis] || {};
    axisOptions.ticks = mergeObjects(
      {
        color: "#f5f5f5",
        font: { size: tickSize, family: "Inter, Segoe UI, sans-serif" },
      },
      axisOptions.ticks || {},
    );
    axisOptions.title = mergeObjects(
      {
        color: "#f5f5f5",
        font: { size: tickSize + 1, family: "Inter, Segoe UI, sans-serif" },
        padding: { top: 6, bottom: 6 },
      },
      axisOptions.title || {},
    );
    axisOptions.grid = mergeObjects(
      {
        color: "rgba(255,255,255,0.12)",
      },
      axisOptions.grid || {},
    );
    next.scales[axis] = axisOptions;
  });
  return next;
};

/* Create a Chart.js instance on `canvas`, store metadata in `chartStore`,
   and return the chart object. */
// Instantiate a Chart.js chart, register it in `chartStore`, and return it.
const createChart = ({ canvas, type = "line", data, options = {}, chartId, title }) => {
  const mergedOptions = enhanceAxesOptions(mergeObjects(getBaseOptions(), options), 11);
  const chart = new Chart(canvas.getContext("2d"), {
    type,
    data,
    options: mergedOptions,
  });

  if (chartId) {
    chartStore.set(chartId, {
      title: title || chartId,
      type,
      data: deepClone(data),
      options: deepClone(mergedOptions),
      chartInstance: chart,
    });
    canvas.dataset.chartId = chartId;
  }

  return chart;
};

// Open a modal that displays a large, interactive copy of the chart `chartId`.
const openZoomModal = (chartId) => {
  /* Open a modal with a larger copy of the chart identified by `chartId`.
     Useful for inspecting dense data interactively. */
  const meta = chartStore.get(chartId);
  if (!meta) {
    alert("Grafik belum siap. Pastikan data sudah dimuat.");
    return;
  }

  const modal = document.getElementById("zoom-modal");
  const canvas = document.getElementById("zoom-modal-canvas");
  const title = document.getElementById("zoom-modal-title");

  if (!modal || !canvas || !title) return;

  title.textContent = meta.title;
  modal.classList.add("is-visible");
  modal.setAttribute("aria-hidden", "false");
  updateBodyModalState();

  if (zoomChartInstance) {
    zoomChartInstance.destroy();
  }

  const zoomOptions = enhanceAxesOptions(
    mergeObjects(meta.options || {}, {
      maintainAspectRatio: false,
      layout: {
        padding: { left: 48, right: 32, top: 24, bottom: 36 },
      },
    }),
    15,
  );
  zoomChartInstance = new Chart(canvas.getContext("2d"), {
    type: meta.type,
    data: deepClone(meta.data),
    options: zoomOptions,
  });
};

// Close the zoom modal and destroy the temporary chart instance.
const closeZoomModal = () => {
  const modal = document.getElementById("zoom-modal");
  if (!modal) return;
  modal.classList.remove("is-visible");
  modal.setAttribute("aria-hidden", "true");
  updateBodyModalState();

  if (zoomChartInstance) {
    zoomChartInstance.destroy();
    zoomChartInstance = null;
  }
};

// Wire up zoom modal close button, backdrop click and Escape key handling.
const setupZoomModal = () => {
  const modal = document.getElementById("zoom-modal");
  const closeBtn = document.getElementById("zoom-modal-close");

  if (closeBtn) {
    closeBtn.addEventListener("click", closeZoomModal);
  }

  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeZoomModal();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal?.classList.contains("is-visible")) {
      closeZoomModal();
    }
  });
};

// Delegated click handler: if a zoom button is clicked, open its chart modal.
const handleZoomButtonClick = (event) => {
  const button = event.target.closest(".zoom-btn");
  if (!button) return;
  const chartId = button.dataset.chartId;
  if (chartId) {
    openZoomModal(chartId);
  }
};

// Replace data in an existing chart instance efficiently and refresh it.
const updateChartData = (chartId, nextData = {}) => {
  const meta = chartStore.get(chartId);
  if (!meta?.chartInstance) return;

  if (Array.isArray(nextData.labels)) {
    meta.chartInstance.data.labels = nextData.labels.slice();
  }

  if (Array.isArray(nextData.datasets)) {
    nextData.datasets.forEach((dataset, idx) => {
      if (!meta.chartInstance.data.datasets[idx]) return;
      const target = meta.chartInstance.data.datasets[idx];
      const sourceData = dataset.data || [];
      target.data = sourceData.map((point) => (typeof point === "object" ? { ...point } : point));
    });
  }

  meta.chartInstance.update("none");
  meta.data = deepClone({
    labels: meta.chartInstance.data.labels,
    datasets: meta.chartInstance.data.datasets.map((dataset) => ({
      ...dataset,
      data: deepClone(dataset.data),
    })),
  });
};

// Update the `#generated-at` element with a status message or timestamp.
const setStatus = (message, isError = false) => {
  const target = document.getElementById("generated-at");
  if (!target) return;
  target.textContent = message;
  target.style.color = isError ? "#fb6f92" : "inherit";
};

// Fetch JSON from `path` with `cache: 'no-store'` and throw on HTTP error.
const fetchJson = async (path) => {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Gagal memuat ${path} (${response.status})`);
  }
  return response.json();
};

// Convenience wrapper to fetch dataset JSON files.
const loadDataset = async (path) => fetchJson(path);

// Wire `#regenerate-btn` to POST to a regenerate endpoint or show fallback.
const setupRegenerateButton = ({ message, endpoint, workingLabel = "Memproses..." } = {}) => {
  const btn = document.getElementById("regenerate-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (endpoint) {
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = workingLabel;
      fetch(endpoint, { method: "POST" })
        .then((res) => {
          if (!res.ok) throw new Error(`Gagal memproses (${res.status})`);
          return res.json().catch(() => ({}));
        })
        .then(() => {
          btn.textContent = "Berhasil, memuat ulang...";
          setTimeout(() => window.location.reload(), 300);
        })
        .catch((err) => {
          console.error(err);
          alert(message || "Gagal membangun ulang data. Jalankan skrip Python secara manual.");
          btn.textContent = originalText;
          btn.disabled = false;
        });
    } else {
      const fallback =
        "Jalankan generator Python yang sesuai (generate_lotka.py atau generate_sei.py) untuk memperbarui data.";
      alert(message || fallback);
    }
  });
};

window.App = {
  COLORS,
  MIN_ZOOM_RANGE,
  chartStore,
  numberFormat,
  rangeFormat,
  roundTo,
  cloneDataStructure,
  mergeObjects,
  updateBodyModalState,
  registerZoomPlugin,
  getBaseOptions,
  enhanceAxesOptions,
  createChart,
  updateChartData,
  openZoomModal,
  closeZoomModal,
  setupZoomModal,
  handleZoomButtonClick,
  setStatus,
  fetchJson,
  loadDataset,
  setupRegenerateButton,
};

document.addEventListener("DOMContentLoaded", () => {
  registerZoomPlugin();
  setupZoomModal();
  document.body.addEventListener("click", handleZoomButtonClick);
});
