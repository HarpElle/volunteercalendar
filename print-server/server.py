"""
VolunteerCal Companion Print Server

Minimal Flask app that runs on the church's LAN (Raspberry Pi, old laptop, etc.)
and receives label data from the kiosk browser via HTTP POST.

Supports:
  - Brother QL printers: receives PNG, writes to temp file, invokes `brother_ql` CLI
  - Zebra ZD printers: receives ZPL text, sends via TCP socket to port 9100

Usage:
  pip install -r requirements.txt
  python server.py --port 3001

Or with Docker:
  docker build -t vc-print-server .
  docker run -p 3001:3001 --network host vc-print-server
"""

import argparse
import base64
import json
import os
import socket
import subprocess
import tempfile
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Allow requests from kiosk browser on any origin


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "service": "vc-print-server"})


@app.route("/print", methods=["POST"])
def print_label():
    """
    Receive a label payload and send it to the printer.

    Expected JSON body:
    {
        "format": "png" | "zpl" | "dymo_xml",
        "data": "<base64-encoded PNG or raw ZPL/XML text>",
        "printer_id": "<station id>",
        "printer_ip": "<ip address>",   // optional override
        "port": 9100,                    // optional override
        "label_size": "DK-2251"          // for Brother QL
    }
    """
    try:
        body = request.get_json(force=True)
        fmt = body.get("format", "")
        data = body.get("data", "")
        printer_ip = body.get("printer_ip", "")
        port = body.get("port", 9100)
        label_size = body.get("label_size", "62")

        if not data:
            return jsonify({"error": "No data provided"}), 400

        if fmt == "png":
            return _print_brother_ql(data, printer_ip, port, label_size)
        elif fmt == "zpl":
            return _print_zpl(data, printer_ip, port)
        elif fmt == "dymo_xml":
            # Dymo is client-side only — this is a fallback/no-op
            return jsonify({"status": "skipped", "reason": "Dymo prints client-side"})
        else:
            return jsonify({"error": f"Unknown format: {fmt}"}), 400

    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _print_brother_ql(data_b64: str, printer_ip: str, port: int, label_size: str):
    """Print PNG to Brother QL printer via brother_ql CLI."""
    # Decode base64 PNG to temp file
    png_data = base64.b64decode(data_b64)
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        f.write(png_data)
        tmp_path = f.name

    try:
        # Map label_size to brother_ql size names
        size_map = {
            "DK-2251": "62",
            "DK-1201": "29x90",
            "DK-2205": "62",
        }
        bq_size = size_map.get(label_size, label_size)

        printer_uri = f"tcp://{printer_ip}:{port}" if printer_ip else "usb://0x04f9:0x209b"

        result = subprocess.run(
            [
                "brother_ql",
                "--printer", printer_uri,
                "--model", "QL-820NWB",
                "print",
                "--label", bq_size,
                tmp_path,
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )

        if result.returncode != 0:
            return jsonify({
                "error": "brother_ql failed",
                "stderr": result.stderr,
            }), 500

        return jsonify({"status": "printed", "format": "png"})

    finally:
        os.unlink(tmp_path)


def _print_zpl(zpl_text: str, printer_ip: str, port: int):
    """Send ZPL text to Zebra printer via raw TCP socket."""
    if not printer_ip:
        return jsonify({"error": "printer_ip required for ZPL"}), 400

    try:
        with socket.create_connection((printer_ip, port), timeout=10) as sock:
            sock.sendall(zpl_text.encode("utf-8"))

        return jsonify({"status": "printed", "format": "zpl"})

    except (socket.timeout, ConnectionRefusedError) as e:
        return jsonify({"error": f"Connection failed: {e}"}), 500


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="VolunteerCal Print Server")
    parser.add_argument("--port", type=int, default=3001, help="Port to listen on")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to")
    args = parser.parse_args()

    print(f"VolunteerCal Print Server starting on {args.host}:{args.port}")
    app.run(host=args.host, port=args.port, debug=False)
