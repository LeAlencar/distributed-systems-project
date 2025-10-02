FROM node:20-slim

# Instalar dependências do sistema para ZeroMQ
RUN apt-get update && apt-get install -y \
    build-essential \
    libzmq3-dev \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Criar diretório de trabalho
WORKDIR /app

# Copiar package.json e package-lock.json
COPY package*.json ./

# Instalar dependências
RUN npm install

# Copiar código da aplicação
COPY . .

# Compilar TypeScript
RUN npm run build

# Criar diretório de dados
RUN mkdir -p /app/data

# Expor porta
EXPOSE 9000

# Comando padrão
CMD ["npm", "start"]

