FROM python:3.13.7-alpine3.21

WORKDIR /app

# Instalar pyzmq
RUN pip install --no-cache-dir pyzmq

# Copiar o cliente
COPY auto_client.py .

# Tornar executável
RUN chmod +x auto_client.py

CMD ["python", "auto_client.py", "chat-server", "9000"]

