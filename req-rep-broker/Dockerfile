FROM python:3.13.7-alpine3.21

WORKDIR /app

# Instalar pyzmq
RUN pip install --no-cache-dir pyzmq

# Copiar o broker
COPY broker.py .

# Expor as portas
EXPOSE 5555 5556

CMD ["python", "broker.py"]

