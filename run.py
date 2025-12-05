# File: run.py
import http.server
import socketserver
import os
import subprocess
import json
import sys

PORT = 8000
# Pastikan folder web ada, jika tidak gunakan direktori saat ini
WEB_DIR = os.path.join(os.getcwd(), "web") 
if not os.path.exists(WEB_DIR):
    WEB_DIR = os.getcwd()

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def do_POST(self):
        # Menangani request regenerasi data
        if self.path == '/regenerate-data':
            print("Menerima permintaan regenerasi data...")
            try:
                # Tentukan path ke script python
                # Asumsi folder scripts ada di root proyek (sejajar dengan run.py)
                script_path = os.path.join(os.getcwd(), 'scripts', 'generate_chaos.py')
                
                if not os.path.exists(script_path):
                    raise FileNotFoundError(f"Script tidak ditemukan di: {script_path}")

                # Jalankan script
                result = subprocess.run(
                    [sys.executable, script_path], 
                    capture_output=True, 
                    text=True,
                    check=True
                )
                
                print("Script output:", result.stdout)
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                response = {
                    "status": "success", 
                    "message": "Data Chaos berhasil dibangun ulang!",
                    "log": result.stdout
                }
                self.wfile.write(json.dumps(response).encode())
                
            except Exception as e:
                print(f"Error: {str(e)}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                response = {
                    "status": "error", 
                    "message": str(e)
                }
                self.wfile.write(json.dumps(response).encode())
        else:
            self.send_error(404, "Endpoint not found")

print(f"Serving HTTP on http://localhost:{PORT} from {WEB_DIR} ...")
print("Tekan Ctrl+C untuk berhenti.")

socketserver.TCPServer.allow_reuse_address = True

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer dihentikan.")