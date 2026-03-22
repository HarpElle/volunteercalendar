FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for brother_ql
RUN apt-get update && \
    apt-get install -y --no-install-recommends libusb-1.0-0 && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

EXPOSE 3001

CMD ["python", "server.py", "--port", "3001"]
