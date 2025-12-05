document.addEventListener("DOMContentLoaded", function () {
  const regenerateBtn = document.getElementById("regenerateBtn");
  const statusMsg = document.getElementById("statusMsg");
  const systemSelect = document.getElementById("systemSelect");

  let chaosData = null;

  const commonLayout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: "#e0e0e0" },
    xaxis: { gridcolor: "#444" },
    yaxis: { gridcolor: "#444" },
  };

  async function loadData() {
    statusMsg.textContent = "Memuat data...";
    try {
      const response = await fetch(
        `../data/chaos_data.json?t=${new Date().getTime()}`
      );

      if (!response.ok) {
        throw new Error(
          "File data tidak ditemukan. Silakan klik 'Bangun Ulang Data'."
        );
      }

      chaosData = await response.json();
      statusMsg.textContent = "Data berhasil dimuat.";
      statusMsg.style.color = "#8ef6c5";
      updatePlots();
    } catch (error) {
      console.error("Load Error:", error);
      statusMsg.innerHTML = `⚠️ ${error.message}`;
      statusMsg.style.color = "#fb6f92";
    }
  }

  function updatePlots() {
    if (!chaosData) return;
    const systemName = systemSelect.value;
    const data = chaosData[systemName];

    if (!data) {
      console.error(`Data untuk ${systemName} tidak ditemukan`);
      return;
    }
    const time = data.time;
    const trace3D = {
      type: "scatter3d",
      mode: "lines",
      x: data.rk4.x,
      y: data.rk4.y,
      z: data.rk4.z,
      line: { width: 3, color: time, colorscale: "Viridis" },
      name: "RK4 Trajectory",
    };

    const layout3D = {
      ...commonLayout,
      margin: { l: 0, r: 0, b: 0, t: 0 },
      scene: {
        xaxis: {
          title: "X",
          gridcolor: "#444",
          backgroundcolor: "rgba(0,0,0,0)",
        },
        yaxis: {
          title: "Y",
          gridcolor: "#444",
          backgroundcolor: "rgba(0,0,0,0)",
        },
        zaxis: {
          title: "Z",
          gridcolor: "#444",
          backgroundcolor: "rgba(0,0,0,0)",
        },
      },
      height: 600,
    };
    Plotly.newPlot("plot3d", [trace3D], layout3D);

    const traceX = { x: time, y: data.rk4.x, name: "X", line: { width: 1 } };
    const traceY = { x: time, y: data.rk4.y, name: "Y", line: { width: 1 } };
    const traceZ = { x: time, y: data.rk4.z, name: "Z", line: { width: 1 } };

    const layoutTS = {
      ...commonLayout,
      title: "",
      xaxis: { title: "Time" },
      yaxis: { title: "Value" },
      margin: { t: 10, b: 40, l: 40, r: 10 },
    };

    Plotly.newPlot("plotTimeSeries", [traceX, traceY, traceZ], layoutTS);
    const phaseConfig = { mode: "lines", line: { width: 1, color: "#45d2ff" } };
    const layoutPhase = {
      ...commonLayout,
      margin: { t: 30, b: 30, l: 30, r: 10 },
      showlegend: false,
    };

    Plotly.newPlot(
      "phaseXY",
      [{ ...phaseConfig, x: data.rk4.x, y: data.rk4.y }],
      {
        ...layoutPhase,
        title: "Phase X-Y",
        xaxis: { title: "X" },
        yaxis: { title: "Y" },
      }
    );
    Plotly.newPlot(
      "phaseYZ",
      [{ ...phaseConfig, x: data.rk4.y, y: data.rk4.z }],
      {
        ...layoutPhase,
        title: "Phase Y-Z",
        xaxis: { title: "Y" },
        yaxis: { title: "Z" },
      }
    );
    Plotly.newPlot(
      "phaseXZ",
      [{ ...phaseConfig, x: data.rk4.x, y: data.rk4.z }],
      {
        ...layoutPhase,
        title: "Phase X-Z",
        xaxis: { title: "X" },
        yaxis: { title: "Z" },
      }
    );

    const errors = data.errors;
    const traceMAE = {
      x: ["X", "Y", "Z"],
      y: errors.mae,
      name: "MAE",
      type: "bar",
      marker: { color: "#fb6f92" },
    };
    const traceRMSE = {
      x: ["X", "Y", "Z"],
      y: errors.rmse,
      name: "RMSE",
      type: "bar",
      marker: { color: "#45d2ff" },
    };

    const layoutErr = {
      ...commonLayout,
      barmode: "group",
      yaxis: { title: "Error", type: "log" },
      margin: { t: 20, b: 40, l: 50, r: 10 },
    };

    Plotly.newPlot("plotError", [traceMAE, traceRMSE], layoutErr);
  }

  systemSelect.addEventListener("change", updatePlots);
  regenerateBtn.addEventListener("click", function () {
    const originalText = regenerateBtn.textContent;
    regenerateBtn.textContent = "Memproses...";
    regenerateBtn.disabled = true;
    statusMsg.textContent = "Sedang menjalankan simulasi Python...";
    statusMsg.style.color = "#b3b3b3";

    fetch("/regenerate-data", { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "success") {
          statusMsg.textContent = "Data berhasil diperbarui!";
          statusMsg.style.color = "#8ef6c5";
          loadData();
        } else {
          throw new Error(data.message);
        }
      })
      .catch((err) => {
        console.error(err);
        statusMsg.textContent = "Gagal: " + err.message;
        statusMsg.style.color = "#fb6f92";
      })
      .finally(() => {
        regenerateBtn.textContent = originalText;
        regenerateBtn.disabled = false;
      });
  });
  loadData();
});
