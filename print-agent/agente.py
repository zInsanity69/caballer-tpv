#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Agente de impresión local para el TPV Caballer.

Por qué existe: en Linux, imprimir el ticket desde el navegador falla (el driver
CUPS de las térmicas de 80 mm no marca el papel, aunque en Windows sí). Este
agente recibe el ticket ya convertido en ESC/POS (raster de la imagen del ticket
+ comandos) y lo manda EN CRUDO a la impresora predeterminada con `lp -o raw`,
saltándose el driver. Así funciona en cualquier térmica de 80 mm de la flota.

Uso:
    python3 agente.py            # escucha en 127.0.0.1:9911
    python3 agente.py --port 9911 --printer POS88

Endpoints (solo desde localhost):
    GET  /status  -> {"ok": true, ...}   (la app lo usa para saber si está vivo)
    GET  /test    -> imprime un ticket de prueba (texto + raster + código barras)
    POST /print   -> imprime: el cuerpo son los bytes ESC/POS tal cual

Se deja arrancado solo (ver README para el servicio systemd / autostart).
"""

import argparse
import subprocess
import tempfile
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ─── Configuración por argumentos ────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=9911)
# Si no se indica impresora, se usa la PREDETERMINADA del sistema (ideal para la
# flota: cada equipo imprime en la suya sin configurar nada).
parser.add_argument('--printer', default=None)
ARGS = parser.parse_args()

# Orígenes permitidos (la web del TPV). '*' vale porque el agente solo escucha en
# localhost y solo ejecuta `lp`; no expone datos.
CORS_ORIGIN = '*'


def enviar_a_impresora(datos_bytes):
    """Manda los bytes en crudo a la impresora (lp -o raw). Devuelve (ok, msg)."""
    cmd = ['lp', '-o', 'raw']
    if ARGS.printer:
        cmd += ['-d', ARGS.printer]
    tmp = None
    try:
        fd, tmp = tempfile.mkstemp(prefix='ticket_', suffix='.escpos')
        with os.fdopen(fd, 'wb') as f:
            f.write(datos_bytes)
        cmd.append(tmp)
        r = subprocess.run(cmd, capture_output=True, timeout=20)
        if r.returncode != 0:
            return False, r.stderr.decode('utf-8', 'ignore') or 'lp devolvió error'
        return True, r.stdout.decode('utf-8', 'ignore')
    except Exception as e:
        return False, str(e)
    finally:
        if tmp and os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


# ─── ESC/POS: bloque de prueba ───────────────────────────────────
def escpos_prueba():
    ESC = b'\x1b'
    GS = b'\x1d'
    out = bytearray()
    out += ESC + b'@'                       # init
    out += ESC + b'a' + b'\x01'             # centrar
    out += ESC + b'!' + b'\x30'             # doble alto+ancho
    out += b'CABALLER\n'
    out += ESC + b'!' + b'\x00'             # normal
    out += b'Prueba de impresion\n'
    out += b'Agente ESC/POS OK\n\n'
    # Raster de prueba (GS v 0): rectangulo negro 384x40 -> valida que marca
    ancho_bytes = 48                        # 48*8 = 384 puntos de ancho
    alto = 40
    out += GS + b'v0' + b'\x00'
    out += bytes([ancho_bytes & 0xff, (ancho_bytes >> 8) & 0xff,
                  alto & 0xff, (alto >> 8) & 0xff])
    out += b'\xff' * (ancho_bytes * alto)
    out += b'\n'
    # Codigo de barras Code128 nativo (GS k) del texto de prueba
    out += ESC + b'a' + b'\x01'             # centrar
    out += GS + b'h' + b'\x50'              # altura 80
    out += GS + b'H' + b'\x02'              # HRI (texto) debajo
    dato = b'{BPAT-00113'                   # {B = Code128 set B
    out += GS + b'k' + b'\x49' + bytes([len(dato)]) + dato
    out += b'\n\n\n'
    out += GS + b'V' + b'\x00'              # corte total
    return bytes(out)


# ─── Servidor HTTP ───────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', CORS_ORIGIN)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        # Necesario: sin esto, Chromium/Brave bloquea que una web HTTPS llame a
        # localhost (Private Network Access). Con esto, la app detecta el agente.
        self.send_header('Access-Control-Allow-Private-Network', 'true')

    def _json(self, code, obj):
        import json
        body = json.dumps(obj).encode('utf-8')
        self.send_response(code)
        self._cors()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/status'):
            self._json(200, {'ok': True, 'printer': ARGS.printer or '(predeterminada)'})
        elif self.path.startswith('/test'):
            ok, msg = enviar_a_impresora(escpos_prueba())
            self._json(200 if ok else 500, {'ok': ok, 'msg': msg})
        else:
            self._json(404, {'ok': False, 'msg': 'not found'})

    def do_POST(self):
        if not self.path.startswith('/print'):
            return self._json(404, {'ok': False, 'msg': 'not found'})
        try:
            n = int(self.headers.get('Content-Length', 0))
            datos = self.rfile.read(n) if n > 0 else b''
        except Exception as e:
            return self._json(400, {'ok': False, 'msg': 'body: ' + str(e)})
        if not datos:
            return self._json(400, {'ok': False, 'msg': 'sin datos'})
        ok, msg = enviar_a_impresora(datos)
        self._json(200 if ok else 500, {'ok': ok, 'msg': msg})

    def log_message(self, *a):
        pass  # sin spam en consola


def main():
    srv = ThreadingHTTPServer(('127.0.0.1', ARGS.port), Handler)
    print(f'Agente de impresion Caballer escuchando en http://127.0.0.1:{ARGS.port}')
    print(f'Impresora: {ARGS.printer or "predeterminada del sistema"}')
    print('Prueba:  curl http://127.0.0.1:%d/test' % ARGS.port)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print('\nAgente detenido.')
        sys.exit(0)


if __name__ == '__main__':
    main()
