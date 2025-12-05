(() => {
  const { setStatus, loadDataset } = window.App;

  const initHome = async () => {
    setStatus("Memuat waktu pembuatan data...");
    try {
      const meta = await loadDataset("data/metadata.json");
      const timestamp = meta.generated_at;
      setStatus(timestamp ? new Date(timestamp).toLocaleString("id-ID") : "Tidak ada cap waktu");
    } catch (error) {
      console.error(error);
      setStatus("Data belum tersedia. Jalankan generator Python lebih dulu.", true);
    }
  };

  document.addEventListener("DOMContentLoaded", initHome);
})();
