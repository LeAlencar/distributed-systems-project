FROM python:3.13.7-alpine3.21

WORKDIR /app

# Instalar pyzmq
RUN pip install --no-cache-dir pyzmq

# Copiar o proxy
COPY proxy.py .

# Expor as portas
EXPOSE 5557 5558

CMD ["python", "proxy.py"]

