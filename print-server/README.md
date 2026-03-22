# VolunteerCal Companion Print Server

Lightweight print service that runs on the church's local network to handle label printing for children's check-in. The VolunteerCal kiosk (running on an iPad) sends label data to this service, which forwards it to the physical printer.

## Supported Printers

- **Brother QL-820NWB** — receives PNG images, prints via `brother_ql` CLI
- **Zebra ZD series** — receives ZPL text, sends via raw TCP socket (port 9100)
- **Dymo LabelWriter** — prints client-side via Dymo Connect SDK (no server needed)

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Run the server
python server.py --port 3001
```

The server listens on `http://0.0.0.0:3001` by default.

## Docker

```bash
docker build -t vc-print-server .
docker run -p 3001:3001 --network host vc-print-server
```

Use `--network host` so the container can reach printers on the LAN.

## Configuration

In the VolunteerCal admin dashboard under **Check-In > Settings > Printers**, set the **Print Server URL** to this machine's LAN address:

```
http://192.168.1.50:3001
```

or if using mDNS:

```
http://printserver.local:3001
```

## API

### `GET /health`
Returns `{"status": "ok"}` — use for monitoring.

### `POST /print`
Accepts a label payload and sends it to the printer.

```json
{
  "format": "png",
  "data": "<base64-encoded PNG>",
  "printer_id": "station-1",
  "printer_ip": "192.168.1.100",
  "port": 9100,
  "label_size": "DK-2251"
}
```

## Hardware Setup (Brother QL-820NWB)

1. Connect the printer to the church WiFi network
2. Note the printer's IP address (print a network config page)
3. Install this print server on a Raspberry Pi or spare laptop on the same network
4. Configure the printer in the VolunteerCal admin dashboard
5. Run a test print from Settings to verify connectivity
