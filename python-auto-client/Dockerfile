FROM python:3.13.7-alpine3.21

WORKDIR /app

# Instalar pyzmq e msgpack
RUN pip install --no-cache-dir pyzmq msgpack

# Copiar o cliente
COPY auto_client.py .

# Tornar executável
RUN chmod +x auto_client.py

CMD ["python", "auto_client.py", "req-rep-broker", "5555"]

