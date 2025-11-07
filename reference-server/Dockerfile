FROM python:3.11-slim

# Instalar dependências do sistema
RUN apt-get update && apt-get install -y \
    build-essential \
    libzmq3-dev \
    && rm -rf /var/lib/apt/lists/*

# Criar diretório de trabalho
WORKDIR /app

# Instalar dependências Python
RUN pip install --no-cache-dir pyzmq msgpack

# Copiar código
COPY reference.py .

# Tornar o script executável
RUN chmod +x reference.py

# Expor porta
EXPOSE 5559

# Comando padrão
CMD ["python3", "reference.py"]

