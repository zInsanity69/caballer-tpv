# Agente de impresión (Plan B — ESC/POS directo)

Imprime el ticket saltándose el driver del navegador/CUPS: la app manda el ticket
ya en ESC/POS (raster de la imagen + comandos) y este agente lo envía en crudo a
la impresora con `lp -o raw`. Funciona en cualquier térmica de 80 mm de la flota,
en el equipo que sea, usando su impresora predeterminada.

## 1) Probar (validación rápida)
En el PC de la caja (Linux), en un terminal:

```bash
python3 agente.py
```

Deja ese terminal abierto. En OTRO terminal, lanza la prueba:

```bash
curl http://127.0.0.1:9911/test
```

Debe salir un papel con: **CABALLER** en grande, un **rectángulo negro** (valida
que imprime imágenes/raster) y un **código de barras** con "PAT-00113".

- ✅ Si sale todo → el Plan B funciona en esta impresora. Avísame y conecto la app.
- ❌ Si el rectángulo sale en blanco → esa térmica no acepta el raster estándar
  `GS v 0`; dímelo y probamos otro comando de imagen.
- Si quieres forzar una impresora concreta: `python3 agente.py --printer POS88`

## 2) Dejarlo arrancado solo (cuando ya funcione)
Para que el agente se inicie con el equipo (servicio de usuario systemd):

```bash
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/caballer-print-agent.service <<'EOF'
[Unit]
Description=Agente de impresion Caballer TPV
After=graphical-session.target

[Service]
ExecStart=/usr/bin/python3 %h/print-agent/agente.py
Restart=always

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now caballer-print-agent.service
```

(Ajusta la ruta de `agente.py` a donde lo dejes en la imagen.)

## Notas
- Solo escucha en `127.0.0.1` (no accesible desde fuera). Solo ejecuta `lp`.
- Sin dependencias: usa Python 3 estándar (ya viene en Linux Mint) y CUPS (`lp`).
- En Windows no hace falta: la app detecta si el agente está; si no, imprime por
  el navegador como hasta ahora.
