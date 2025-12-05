# Visualisasi ODE – Lotka–Volterra & SEI

Repo ini berisi sebuah situs visualisasi interaktif yang aku buat untuk bereksperimen dengan solver ODE dan melihat bagaimana perilaku model numerik berubah ketika parameter atau solvers-nya diganti. Semua data visualisasi dihasilkan dari Python/Jupyter notebook, lalu ditampilkan lewat halaman web sederhana.

Kalau kamu mau mencoba ulang proyek ini dengan setup yang berbeda (mau pakai 1 notebook, 2 notebook, atau lebih), silakan sesuaikan sesuai kebutuhan. Selama alurnya dipahami, struktur project ini cukup fleksibel untuk di-modifikasi.


## Struktur Repo

- **`run.py`**  
  Server HTTP ringan yang menyajikan folder `web/` dan menangani endpoint regenerasi (`/regenerate/lotka` & `/regenerate/sei`).  
  Bisa pakai environment variable `PORT` atau override via CLI.

- **`scripts/`**  
  Script Python untuk menghasilkan JSON simulasi:  
  - `generate_lotka.py` — data Lotka–Volterra  
  - `generate_sei.py` — data perbandingan solver SEI (RK4 vs RK7)

- **`web/`**  
  Situs statis tempat visualisasi ditampilkan  
  - `index.html` — halaman awal  
  - `lotka/` — halaman demo Lotka  
  - `sei/` — halaman demo SEI  
  - `main.js` — helper (fetching, UI, regenerate handler)  
  - `data/` — hasil generate JSON (`*_data.json`, `metadata.json`)

- **`notebooks/`**  
  Notebook referensi yang dipakai saat membangun generator. Tidak wajib dipakai user.

---

## Teknologi yang Dipakai

- Python 3.x — generator + server (`run.py`)
- JavaScript murni — semua logic front-end
- **Chart.js** + **chartjs-plugin-zoom** (via CDN)
- Jupyter Notebook — opsional, bisa digunakan untuk mengekstrak markdown menjadi `notes`

---

## Alur Kerja Proyek

1. Script Python dijalankan → menulis JSON ke `web/data/`.
2. Browser membuka halaman di `web/` → `main.js` fetch JSON-nya.
3. Visualisasi dibuat dari isi JSON tersebut.
4. Kalau situs kamu jalankan via `run.py`, tombol **“Bangun ulang”** di halaman akan POST ke `/regenerate/<nama>` untuk menjalankan ulang generator Python.

---

## Format Data JSON

Semua generator menulis struktur umum seperti:

- `generated_at` — timestamp  
- `lotka_volterra` atau `sei_comparison` — payload utama

### Lotka–Volterra (contoh)

- `time`, `prey`, `predator`  
- `phase_points`  
- `snapshots`  
- `parameters`  
- Opsional: `full`, `stages`, `notes`

### SEI (contoh)

- `time`  
- `rk4`, `rk7`  
- `labels`  
- `diff_abs`  
- `stats`  
- Opsional: `full`, `stages`, `notes`

### Opsi CLI generator

- `--full` → simpan data resolusi penuh  
- `--stages` → sertakan tahap solver  
- `--notes` → ekstrak markdown notebook

> Peringatan: `--full` & `--stages` bisa membuat file JSON sangat besar.

---

##  Cara Menjalankan Proyek

### 1. Generate data (opsional)

```powershell
& 'C:\Python314\python.exe' 'd:/WEB VISUALISASI/scripts/generate_lotka.py' --full --stages --notes
& 'C:\Python314\python.exe' 'd:/WEB VISUALISASI/scripts/generate_sei.py' --full --stages --notes
````

### 2. Jalankan server

```powershell
$env:PORT=8000; & 'C:\Python314\python.exe' 'd:/WEB VISUALISASI/run.py'
```

### 3. Buka browser

`http://localhost:8000/`

**Catatan:**

* Kalau buka file HTML langsung lewat `file://`, tombol “Bangun ulang” tidak akan berfungsi.
* Jika data terlihat tidak berubah, buka DevTools → Network → cek `metadata.json`.

---

##  Cara Front-End Menggunakan Data

* `loadDataset()` di `main.js` melakukan fetch JSON dengan `cache: 'no-store'`
* `setupRegenerateButton()` untuk POST regenerasi
* Setiap halaman (Lotka/SEI) mengambil key utama dari JSON, lalu membangun chart via:

  * `createChart()`
  * `updateChartData()`
* Jika generator memasukkan `notes`, front-end akan menampilkannya di samping grafik

---

##  Menambah Model / Notebook Baru

1. Buat script baru di `scripts/`

   * Lakukan integrasi / perhitungan
   * Simpan hasil ke `web/data/<nama>_data.json`
   * Ikuti pola struktur JSON yang ada
   * (Opsional) ekstrak markdown dari notebook

2. Buat halaman baru di `web/<nama_model>/`

   * Tambahkan HTML + JS
   * Fetch data via `loadDataset()`
   * Gunakan helper chart dari `main.js`

3. (Opsional) Tambah endpoint regenerasi di `run.py`

### Saran

* Jangan selalu aktifkan `--full`/`--stages` karena file bisa berat.
* Bisa pisahkan file `*.full.json` khusus playback.
* Jaga format JSON tetap simpel (time, arrays, labels, params).

---

##  Troubleshooting

* **501 saat POST `/regenerate/...`** → kamu memakai server statis. Jalankan `run.py`.
* Data tidak berubah → cek `metadata.json` dan sumber respons di DevTools.
* Halaman lambat → file JSON mungkin terlalu besar. Matikan `--full`.

---

## 💡 Tips Dev

* Pastikan URL dan port server benar.
* Gunakan Git branch untuk eksperimen UI.
* Jika memakai banyak notebook, buat header metadata kecil di tiap notebook agar generator mudah mengekstrak informasi.


