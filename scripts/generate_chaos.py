# File: chaos-system/scripts/generate_chaos.py
import numpy as np
import json
import os
import sys

# --- Sistem Persamaan Chaos ---

def lorenz_system(t, state, sigma=10, rho=28, beta=8/3):
    """
    Lorenz System (Model Konveksi Atmosfer / Fluida)
    Mapping Parameter Robotik (Interpretasi):
    - rho (~Force): Gaya dorong eksternal.
    - beta (~Damping): Tingkat disipasi/redaman fisik.
    """
    x, y, z = state
    dx = sigma * (y - x)
    dy = x * (rho - z) - y
    dz = x * y - beta * z
    return np.array([dx, dy, dz])

def chen_system(t, state, a=35, b=3, c=28):
    """
    Chen System (Sistem Chaos Multi-Scroll)
    Mapping Parameter:
    - c (~Force)
    - b (~Damping)
    """
    x, y, z = state
    dx = a * (y - x)
    dy = (c - a) * x - x * z + c * y
    dz = x * y - b * z
    return np.array([dx, dy, dz])

def rossler_system(t, state, a=0.2, b=0.2, c=5.7):
    """
    Rossler System (Model Reaksi Kimia / Osilator)
    """
    x, y, z = state
    dx = -y - z
    dy = x + a * y
    dz = b + z * (x - c)
    return np.array([dx, dy, dz])

# --- Metode Numerik ---

def rk4_classic(f, t, y, h, params):
    """Runge-Kutta Order 4"""
    k1 = f(t, y, **params)
    k2 = f(t + h/2, y + (h/2) * k1, **params)
    k3 = f(t + h/2, y + (h/2) * k2, **params)
    k4 = f(t + h, y + h * k3, **params)
    return y + (h/6) * (k1 + 2*k2 + 2*k3 + k4)

def rk5_butcher(f, t, y, h, params):
    """
    Runge-Kutta Order 5 (Butcher's method)
    Digunakan sebagai pembanding akurasi (Ground Truth).
    """
    k1 = f(t, y, **params)
    k2 = f(t + h/4, y + (h/4) * k1, **params)
    k3 = f(t + h/4, y + (h/8) * k1 + (h/8) * k2, **params)
    k4 = f(t + h/2, y - (h/2) * k2 + h * k3, **params)
    k5 = f(t + 3*h/4, y + (3*h/16) * k1 + (9*h/16) * k4, **params)
    k6 = f(t + h, y - (3*h/7) * k1 + (2*h/7) * k2 + (12*h/7) * k3 - (12*h/7) * k4 + (8*h/7) * k5, **params)
    
    return y + (h/90) * (7*k1 + 32*k3 + 12*k4 + 32*k5 + 7*k6)

def solve_ode(method, f, t_span, y0, h, params):
    """Fungsi pembungkus untuk iterasi numerik"""
    t_values = np.arange(t_span[0], t_span[1], h)
    y_values = np.zeros((len(t_values), len(y0)))
    y_values[0] = y0
    
    current_y = np.array(y0)
    for i in range(1, len(t_values)):
        current_y = method(f, t_values[i-1], current_y, h, params)
        y_values[i] = current_y
        
    return t_values, y_values

# --- Main Execution ---

if __name__ == "__main__":
    # 1. Konfigurasi Default
    t_start = 0.0
    t_end = 50.0
    h = 0.01
    y0 = [1.0, 1.0, 1.0]
    
    # Default parameters untuk tiap sistem
    system_params = {
        'Lorenz': {'sigma': 10.0, 'rho': 28.0, 'beta': 8/3},
        'Chen':   {'a': 35.0, 'b': 3.0, 'c': 28.0},
        'Rossler':{'a': 0.2, 'b': 0.2, 'c': 5.7}
    }

    # 2. Parsing Input dari Argumen (JSON String)
    # Contoh input argumen: '{"damping": 2.5, "force": 30.0, "initX": 0.5, "timeStep": 0.02}'
    if len(sys.argv) > 1:
        try:
            raw_input = sys.argv[1]
            user_input = json.loads(raw_input)
            print(f"Menerima parameter kustom: {user_input}")

            # Update Time Step (h)
            if 'timeStep' in user_input:
                h = float(user_input['timeStep'])
            
            # Update Kondisi Awal X (y0)
            if 'initX' in user_input:
                y0[0] = float(user_input['initX'])

            # --- LOGIKA MAPPING ---
            # Menghubungkan istilah "Robotic" (Force, Damping) ke istilah Matematika Chaos
            
            # Mapping untuk Lorenz
            # Force -> rho (Rayleigh number)
            if 'force' in user_input:
                system_params['Lorenz']['rho'] = float(user_input['force'])
            # Damping -> beta (Geometrical/physical proportion factor)
            if 'damping' in user_input:
                system_params['Lorenz']['beta'] = float(user_input['damping'])

            # Mapping untuk Chen
            if 'force' in user_input:
                system_params['Chen']['c'] = float(user_input['force'])
            if 'damping' in user_input:
                system_params['Chen']['b'] = float(user_input['damping'])

            # Mapping untuk Rossler (Opsional, karena struktur beda)
            if 'force' in user_input:
                system_params['Rossler']['c'] = float(user_input['force'])

        except Exception as e:
            print(f"Gagal memparsing input JSON: {e}")
            print("Menggunakan parameter default.")

    # 3. Proses Komputasi
    t_span = (t_start, t_end)
    
    systems_map = {
        'Lorenz': lorenz_system,
        'Chen': chen_system,
        'Rossler': rossler_system
    }
    
    data_payload = {}

    for name, func in systems_map.items():
        params = system_params[name]
        
        # Hitung dengan RK4 (Visualisasi Utama)
        t_rk4, y_rk4 = solve_ode(rk4_classic, func, t_span, y0, h, params)
        
        # Hitung dengan RK5 (Ground Truth / Pembanding)
        t_rk5, y_rk5 = solve_ode(rk5_butcher, func, t_span, y0, h, params)
        
        # Hitung Error (Euclidean Distance antar state di setiap waktu)
        # Menghindari error dimensi jika shape berbeda sedikit akibat float precision
        min_len = min(len(y_rk4), len(y_rk5))
        y_rk4 = y_rk4[:min_len]
        y_rk5 = y_rk5[:min_len]
        t_rk4 = t_rk4[:min_len]

        # Mean Absolute Error per komponen
        abs_err = np.abs(y_rk4 - y_rk5)
        mae = np.mean(abs_err, axis=0)
        
        # Downsample data untuk output JSON (agar tidak berat di browser)
        # Semakin kecil step size (h), semakin besar sampling rate (skip) yang dibutuhkan
        skip = int(0.05 / h) 
        if skip < 1: skip = 1
        
        data_payload[name] = {
            'time': t_rk4[::skip].tolist(),
            'rk4': {
                'x': y_rk4[::skip, 0].tolist(),
                'y': y_rk4[::skip, 1].tolist(),
                'z': y_rk4[::skip, 2].tolist()
            },
            'rk5_comparison_metrics': {
                'mae_x': mae[0],
                'mae_y': mae[1],
                'mae_z': mae[2]
            },
            'parameters_used': params
        }

    # 4. Simpan ke JSON
    # Pastikan path sesuai dengan struktur folder kamu
    output_path = os.path.join(os.path.dirname(__file__), '../web/data/chaos_data.json')
    
    # Buat direktori jika belum ada
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, 'w') as f:
        json.dump(data_payload, f)
        
    print(f"Data chaos berhasil dibangun ulang di: {output_path}")
    print(f"Parameter: {system_params['Lorenz']}") # Debug log