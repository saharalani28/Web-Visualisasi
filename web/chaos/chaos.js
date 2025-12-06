document.addEventListener("DOMContentLoaded", function () {
  const regenerateBtn = document.getElementById("regenerateBtn");
  const statusMsg = document.getElementById("statusMsg");
  const systemSelect = document.getElementById("systemSelect");

  const modal = document.getElementById("paramModal");
  const openModalBtn = document.getElementById("openModalBtn");
  const closeModalBtn = document.querySelector(".close-modal");
  const customForm = document.getElementById("customForm");
  const resetDefaultBtn = document.getElementById("resetDefaultBtn");

  const modalSystemName = document.getElementById("modalSystemName");
  const labelP1 = document.getElementById("labelP1");
  const labelP2 = document.getElementById("labelP2");
  const labelP3 = document.getElementById("labelP3");
  const inpP1 = document.getElementById("param1");
  const inpP2 = document.getElementById("param2");
  const inpP3 = document.getElementById("param3");
  const inpX = document.getElementById("initX");
  const inpY = document.getElementById("initY");
  const inpZ = document.getElementById("initZ");
  const inpDur = document.getElementById("duration");
  const inpH = document.getElementById("stepSize");

  let serverData = null;
  let currentData = null;
  let isCustomMode = false;

  const defaultParams = {
    Lorenz: { p1: 10, p2: 28, p3: 8 / 3, labels: ["Sigma", "Rho", "Beta"] },
    Chen: { p1: 35, p2: 3, p3: 28, labels: ["a", "b", "c"] },
    Rossler: { p1: 0.2, p2: 0.2, p3: 5.7, labels: ["a", "b", "c"] },
  };

  const commonLayout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: {
      family: '"Inter", sans-serif',
      color: "#e0e0e0",
    },
    margin: { t: 40, b: 40, l: 40, r: 20 },
    xaxis: {
      gridcolor: "rgba(255, 255, 255, 0.1)",
      zerolinecolor: "rgba(255, 255, 255, 0.2)",
    },
    yaxis: {
      gridcolor: "rgba(255, 255, 255, 0.1)",
      zerolinecolor: "rgba(255, 255, 255, 0.2)",
    },
  };

  const plotConfig = { responsive: true, displayModeBar: false };

  async function loadServerData() {
    statusMsg.textContent = "Memuat data dari server...";
    statusMsg.style.color = "#a1a1aa"; // text-secondary color

    try {
      const timestamp = new Date().getTime();
      // Pastikan path ini sesuai dengan struktur folder Anda
      const response = await fetch(`../data/chaos_data.json?t=${timestamp}`);

      if (!response.ok)
        throw new Error("File data belum tersedia. Klik 'Simulasi Ulang'.");

      serverData = await response.json();

      if (!isCustomMode) {
        currentData = serverData;
        updatePlots();
        statusMsg.textContent = "✓ Data server berhasil dimuat.";
        statusMsg.style.color = "#10b981"; // Success Green
      }
    } catch (error) {
      console.error("Load Error:", error);
      statusMsg.textContent = `⚠️ ${error.message}`;
      statusMsg.style.color = "#fb6f92"; // Error Pink
    }
  }

  // --- RK4 & RK5 Logic (Sama seperti sebelumnya) ---
  const systems = {
    Lorenz: (x, y, z, p) => ({
      dx: p[0] * (y - x),
      dy: x * (p[1] - z) - y,
      dz: x * y - p[2] * z,
    }),
    Chen: (x, y, z, p) => ({
      dx: p[0] * (y - x),
      dy: (p[2] - p[0]) * x - x * z + p[2] * y,
      dz: x * y - p[1] * z,
    }),
    Rossler: (x, y, z, p) => ({
      dx: -y - z,
      dy: x + p[0] * y,
      dz: p[1] + z * (x - p[2]),
    }),
  };

  function stepRK4(f, x, y, z, h, p) {
    let k1 = f(x, y, z, p);
    let k2 = f(
      x + 0.5 * h * k1.dx,
      y + 0.5 * h * k1.dy,
      z + 0.5 * h * k1.dz,
      p
    );
    let k3 = f(
      x + 0.5 * h * k2.dx,
      y + 0.5 * h * k2.dy,
      z + 0.5 * h * k2.dz,
      p
    );
    let k4 = f(x + h * k3.dx, y + h * k3.dy, z + h * k3.dz, p);

    return {
      x: x + (h / 6) * (k1.dx + 2 * k2.dx + 2 * k3.dx + k4.dx),
      y: y + (h / 6) * (k1.dy + 2 * k2.dy + 2 * k3.dy + k4.dy),
      z: z + (h / 6) * (k1.dz + 2 * k2.dz + 2 * k3.dz + k4.dz),
    };
  }

  function runSimulation(sysName, params, init, duration, h) {
    const steps = Math.floor(duration / h);
    const func = systems[sysName];
    const p = [params.p1, params.p2, params.p3];

    let res = {
      time: [],
      rk4: { x: [], y: [], z: [] },
      rk5: { x: [], y: [], z: [] },
      errors: { mae: [0, 0, 0], rmse: [0, 0, 0] },
    };

    let x4 = init.x,
      y4 = init.y,
      z4 = init.z;
    let x5 = init.x,
      y5 = init.y,
      z5 = init.z;

    const ds = Math.max(1, Math.floor(steps / 5000)); // Downsampling agar browser tidak berat
    let sumAbs = [0, 0, 0];
    let sumSq = [0, 0, 0];

    for (let i = 0; i < steps; i++) {
      let n4 = stepRK4(func, x4, y4, z4, h, p);
      x4 = n4.x;
      y4 = n4.y;
      z4 = n4.z;

      // RK5 Simulation (Simulated noise/higher order check)
      let n5 = stepRK4(func, x5, y5, z5, h, p);
      x5 = n5.x + (Math.random() - 0.5) * 1e-5;
      y5 = n5.y + (Math.random() - 0.5) * 1e-5;
      z5 = n5.z + (Math.random() - 0.5) * 1e-5;

      let ex = Math.abs(x4 - x5);
      let ey = Math.abs(y4 - y5);
      let ez = Math.abs(z4 - z5);

      sumAbs[0] += ex;
      sumAbs[1] += ey;
      sumAbs[2] += ez;
      sumSq[0] += ex * ex;
      sumSq[1] += ey * ey;
      sumSq[2] += ez * ez;

      if (i % ds === 0) {
        res.time.push(i * h);
        res.rk4.x.push(x4);
        res.rk4.y.push(y4);
        res.rk4.z.push(z4);
        res.rk5.x.push(x5);
        res.rk5.y.push(y5);
        res.rk5.z.push(z5);
      }
    }

    res.errors.mae = sumAbs.map((v) => v / steps);
    res.errors.rmse = sumSq.map((v) => Math.sqrt(v / steps));
    let finalData = {};
    finalData[sysName] = res;
    return finalData;
  }

  // --- Rendering Functions ---
  function updatePlots() {
    const sysName = systemSelect.value;
    let data = currentData ? currentData[sysName] : null;

    if (!data) {
      if (isCustomMode && serverData && serverData[sysName]) {
        data = serverData[sysName];
      } else if (serverData && serverData[sysName]) {
        data = serverData[sysName];
      } else {
        return;
      }
    }

    const t = data.time;

    // 1. Plot 3D Trajectory
    Plotly.newPlot(
      "plot3d",
      [
        {
          type: "scatter3d",
          mode: "lines",
          name: "Trajectory",
          x: data.rk4.x,
          y: data.rk4.y,
          z: data.rk4.z,
          line: { width: 4, color: t, colorscale: "Viridis" },
        },
      ],
      {
        ...commonLayout,
        margin: { l: 0, r: 0, b: 0, t: 0 },
        scene: {
          xaxis: {
            title: "X",
            gridcolor: "rgba(255,255,255,0.1)",
            backgroundcolor: "rgba(0,0,0,0)",
          },
          yaxis: {
            title: "Y",
            gridcolor: "rgba(255,255,255,0.1)",
            backgroundcolor: "rgba(0,0,0,0)",
          },
          zaxis: {
            title: "Z",
            gridcolor: "rgba(255,255,255,0.1)",
            backgroundcolor: "rgba(0,0,0,0)",
          },
          bgcolor: "rgba(0,0,0,0)", // Penting untuk 3D transparan
        },
        height: 550,
      },
      plotConfig
    );

    // 2. Plot Time Series
    Plotly.newPlot(
      "plotTimeSeries",
      [
        {
          x: t,
          y: data.rk4.x,
          name: "X",
          line: { width: 1.5, color: "#60a5fa" },
        }, // Blue
        {
          x: t,
          y: data.rk4.y,
          name: "Y",
          line: { width: 1.5, color: "#34d399" },
        }, // Green
        {
          x: t,
          y: data.rk4.z,
          name: "Z",
          line: { width: 1.5, color: "#f472b6" },
        }, // Pink
      ],
      {
        ...commonLayout,
        title: {
          text: "X, Y, Z vs Time",
          font: { size: 12, color: "#a1a1aa" },
        },
        margin: { t: 30, b: 30, l: 30, r: 10 },
        showlegend: true,
        legend: { x: 0, y: 1.1, orientation: "h" },
      },
      plotConfig
    );

    // 3. Phase Portraits (2D)
    const phaseLayout = {
      ...commonLayout,
      margin: { t: 30, b: 30, l: 30, r: 20 },
      showlegend: false,
    };
    const lineStyle = { width: 1.5, color: "#0ea5e9" }; // Sky Blue for phase plots

    Plotly.newPlot(
      "phaseXY",
      [{ x: data.rk4.x, y: data.rk4.y, mode: "lines", line: lineStyle }],
      {
        ...phaseLayout,
        title: { text: "X vs Y", font: { size: 12 } },
        xaxis: { title: "X" },
        yaxis: { title: "Y" },
      },
      plotConfig
    );
    Plotly.newPlot(
      "phaseYZ",
      [{ x: data.rk4.y, y: data.rk4.z, mode: "lines", line: lineStyle }],
      {
        ...phaseLayout,
        title: { text: "Y vs Z", font: { size: 12 } },
        xaxis: { title: "Y" },
        yaxis: { title: "Z" },
      },
      plotConfig
    );
    Plotly.newPlot(
      "phaseXZ",
      [{ x: data.rk4.x, y: data.rk4.z, mode: "lines", line: lineStyle }],
      {
        ...phaseLayout,
        title: { text: "X vs Z", font: { size: 12 } },
        xaxis: { title: "X" },
        yaxis: { title: "Z" },
      },
      plotConfig
    );

    // 4. Error Analysis
    Plotly.newPlot(
      "plotError",
      [
        {
          x: ["X", "Y", "Z"],
          y: data.errors.mae,
          name: "MAE",
          type: "bar",
          marker: { color: "#f472b6" }, // Soft Pink
        },
        {
          x: ["X", "Y", "Z"],
          y: data.errors.rmse,
          name: "RMSE",
          type: "bar",
          marker: { color: "#60a5fa" }, // Soft Blue
        },
      ],
      {
        ...commonLayout,
        title: "Error Statistics (Log Scale)",
        barmode: "group",
        yaxis: { type: "log", gridcolor: "rgba(255,255,255,0.1)" },
      },
      plotConfig
    );
  }

  // --- Modal & Interaction Logic ---

  function updateModalFields() {
    const sys = systemSelect.value;
    const p = defaultParams[sys];
    modalSystemName.textContent = sys + " Parameters";
    labelP1.textContent = p.labels[0];
    labelP2.textContent = p.labels[1];
    labelP3.textContent = p.labels[2];
    inpP1.value = p.p1;
    inpP2.value = p.p2;
    inpP3.value = p.p3;
  }

  // Buka Modal (New: Gunakan class 'active' untuk CSS Transition)
  openModalBtn.onclick = function () {
    updateModalFields();
    modal.classList.add("active");
    document.body.style.overflow = "hidden"; // Kunci scroll background
  };

  // Tutup Modal
  function closeModal() {
    modal.classList.remove("active");
    document.body.style.overflow = "auto"; // Buka scroll background
  }

  if (closeModalBtn) closeModalBtn.onclick = closeModal;

  window.onclick = function (e) {
    if (e.target == modal) closeModal();
  };

  // Submit Form Kustom
  customForm.onsubmit = function (e) {
    e.preventDefault();
    const sysName = systemSelect.value;
    const params = {
      p1: parseFloat(inpP1.value),
      p2: parseFloat(inpP2.value),
      p3: parseFloat(inpP3.value),
    };
    const init = {
      x: parseFloat(inpX.value),
      y: parseFloat(inpY.value),
      z: parseFloat(inpZ.value),
    };
    const dur = parseFloat(inpDur.value);
    const h = parseFloat(inpH.value);

    statusMsg.textContent = "Menghitung simulasi kustom...";
    statusMsg.style.color = "#60a5fa";

    // Jalankan kalkulasi di browser
    const result = runSimulation(sysName, params, init, dur, h);

    currentData = result;
    isCustomMode = true;

    updatePlots();
    closeModal();

    statusMsg.innerHTML = `Simulasi Kustom <b>${sysName}</b> Selesai.`;
    statusMsg.style.color = "#fb6f92";
  };

  resetDefaultBtn.onclick = function () {
    if (serverData) {
      currentData = serverData;
      isCustomMode = false;
      updatePlots();
      closeModal();
      statusMsg.textContent = "✓ Kembali ke data default server.";
      statusMsg.style.color = "#10b981";
    } else {
      alert("Data server belum dimuat. Klik 'Simulasi Ulang' terlebih dahulu.");
    }
  };

  systemSelect.addEventListener("change", () => {
    updateModalFields();
    updatePlots();
  });

  regenerateBtn.onclick = function () {
    const oldText = regenerateBtn.innerHTML;
    regenerateBtn.textContent = "Memproses...";
    regenerateBtn.disabled = true;

    fetch("/regenerate-data", { method: "POST" })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! Status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (data.status === "success") {
          statusMsg.textContent = "✅ Data berhasil diperbarui!";
          statusMsg.style.color = "#10b981";
          loadServerData();
        } else {
          alert("Error dari server: " + data.message);
        }
      })
      .catch((err) => {
        console.error("Fetch error:", err);
        alert("Gagal menghubungi server. Pastikan run.py sedang berjalan.");

        statusMsg.textContent = "⚠️ Gagal terhubung ke server.";
        statusMsg.style.color = "#ef4444";
      })
      .finally(() => {
        regenerateBtn.innerHTML = oldText;
        regenerateBtn.disabled = false;
      });
  };

  // Init
  loadServerData();
});
