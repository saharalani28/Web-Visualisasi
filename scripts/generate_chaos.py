# File: scripts/generate_chaos.py
import numpy as np
import json
import os

# --- Sistem Persamaan ---
def lorenz_system(t, state, sigma=10, rho=28, beta=8/3):
    x, y, z = state
    dx = sigma * (y - x)
    dy = x * (rho - z) - y
    dz = x * y - beta * z
    return np.array([dx, dy, dz])

def chen_system(t, state, a=35, b=3, c=28):
    x, y, z = state
    dx = a * (y - x)
    dy = (c - a) * x - x * z + c * y
    dz = x * y - b * z
    return np.array([dx, dy, dz])

def rossler_system(t, state, a=0.2, b=0.2, c=5.7):
    x, y, z = state
    dx = -y - z
    dy = x + a * y
    dz = b + z * (x - c)
    return np.array([dx, dy, dz])

# --- Metode Numerik ---
def rk4_classic(f, t, y, h):
    k1 = f(t, y)
    k2 = f(t + h/2, y + (h/2) * k1)
    k3 = f(t + h/2, y + (h/2) * k2)
    k4 = f(t + h, y + h * k3)
    return y + (h/6) * (k1 + 2*k2 + 2*k3 + k4)

def rk5_butcher(f, t, y, h):
    k1 = f(t, y)
    k2 = f(t + h/4, y + (h/4) * k1)
    k3 = f(t + h/4, y + (h/8) * k1 + (h/8) * k2)
    k4 = f(t + h/2, y - (h/2) * k2 + h * k3)
    k5 = f(t + 3*h/4, y + (3*h/16) * k1 + (9*h/16) * k4)
    k6 = f(t + h, y - (3*h/7) * k1 + (2*h/7) * k2 + (12*h/7) * k3 - (12*h/7) * k4 + (8*h/7) * k5)
    return y + (h/90) * (7*k1 + 32*k3 + 12*k4 + 32*k5 + 7*k6)

def solve_ode(method, f, t_span, y0, h):
    t_start, t_end = t_span
    t = np.arange(t_start, t_end, h)
    n_steps = len(t)
    y = np.zeros((n_steps, len(y0)))
    y[0] = y0
    for i in range(n_steps - 1):
        y[i+1] = method(f, t[i], y[i], h)
    return t, y

def main():
    print("Mulai perhitungan Chaos...")
    
    # Setting output path yang benar (relatif terhadap root project)
    # Kita asumsikan script dijalankan dari root, jadi output ke web/data
    output_dir = os.path.join('web', 'data')
    os.makedirs(output_dir, exist_ok=True)
    output_file = os.path.join(output_dir, 'chaos_data.json')

    t_span = (0, 50)
    h = 0.01
    # Kondisi awal sedikit beda agar variasi menarik
    y0 = [1.0, 1.0, 1.0] 

    systems = {
        'Lorenz': lorenz_system,
        'Chen': chen_system,
        'Rossler': rossler_system
    }
    
    data_payload = {}

    for name, func in systems.items():
        # Integrasi
        t_rk4, y_rk4 = solve_ode(rk4_classic, func, t_span, y0, h)
        t_rk5, y_rk5 = solve_ode(rk5_butcher, func, t_span, y0, h)
        
        # Hitung Error
        abs_err = np.abs(y_rk4 - y_rk5)
        mae = np.mean(abs_err, axis=0)
        rmse = np.sqrt(np.mean((y_rk4 - y_rk5)**2, axis=0))
        
        # Downsample agar file JSON tidak terlalu besar (ambil tiap step ke-5)
        step = 5
        
        data_payload[name] = {
            'time': t_rk4[::step].tolist(),
            'rk4': {
                'x': y_rk4[::step, 0].tolist(),
                'y': y_rk4[::step, 1].tolist(),
                'z': y_rk4[::step, 2].tolist()
            },
            'rk5': {
                'x': y_rk5[::step, 0].tolist(),
                'y': y_rk5[::step, 1].tolist(),
                'z': y_rk5[::step, 2].tolist()
            },
            'errors': {
                'mae': mae.tolist(),   # [errX, errY, errZ]
                'rmse': rmse.tolist()  # [errX, errY, errZ]
            }
        }

    with open(output_file, 'w') as f:
        json.dump(data_payload, f)
    
    print(f"Berhasil! Data disimpan di {output_file}")

if __name__ == "__main__":
    main()