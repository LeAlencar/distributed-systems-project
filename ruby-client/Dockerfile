FROM ruby:3.3-slim

# Instalar dependências do sistema
RUN apt-get update && apt-get install -y \
    build-essential \
    libzmq3-dev \
    && rm -rf /var/lib/apt/lists/*

# Criar diretório de trabalho
WORKDIR /app

# Copiar Gemfile e instalar gems
COPY Gemfile Gemfile.lock* ./
RUN bundle install

# Copiar código da aplicação
COPY . .

# Tornar scripts executáveis
RUN chmod +x *.rb

# Comando padrão
CMD ["ruby", "chat_client.rb", "chat-server", "9000"]

