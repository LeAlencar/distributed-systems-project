# Sistema de Troca de Mensagens Instantâneas

Projeto de sistema distribuído para troca de mensagens baseado em BBS/IRC usando ZeroMQ.

## 📋 Sobre o Projeto

Este projeto implementa um sistema de chat distribuído com:

- **Parte 1**: Request-Reply para login, gerenciamento de usuários e canais
- **Parte 2**: Publisher-Subscriber para mensagens em canais e mensagens diretas

## 🏗️ Arquitetura

### Parte 1: Request-Reply

```
┌─────────────┐         ┌─────────────┐
│   Cliente   │◄───────►│   Servidor  │
│    (REQ)    │ REQ/REP │    (REP)    │
└─────────────┘         └─────────────┘
```

### Parte 2: Publisher-Subscriber

```
┌─────────────┐         ┌─────────────┐         ┌──────────────┐
│   Cliente   │◄───────►│   Servidor  │◄───────►│ PubSub Proxy │
│  (REQ/SUB)  │ REQ/REP │  (REP/PUB)  │  PUB    │  (XSUB/XPUB) │
└─────────────┘         └─────────────┘         └──────────────┘
      ▲                                                 │
      │                        SUB                      │
      └─────────────────────────────────────────────────┘
```

## 📦 Componentes

### Servidor (Node.js + TypeScript)

- Request-Reply na porta 9000
- Publisher conectado ao proxy PubSub
- Persistência de dados em JSON
- Serviços: login, users, channels, channel, publish, message

### PubSub Proxy (Python)

- XSUB na porta 5557 (publishers)
- XPUB na porta 5558 (subscribers)
- Roteia mensagens entre publishers e subscribers

### Cliente Interativo Ruby (Parte 1)

- Login e gerenciamento de usuários
- Criação e listagem de canais

### Cliente Interativo Ruby com PubSub (Parte 2)

- Todas funcionalidades da Parte 1
- Inscrição em canais
- Publicação em canais
- Envio de mensagens diretas
- Recebimento em tempo real (thread separada)

### Cliente Automático Python (Parte 2)

- Login automático com nome aleatório
- Envia 10 mensagens por iteração em canais aleatórios
- Loop infinito para testes de carga

## 🚀 Como Usar

### Pré-requisitos

- Docker e Docker Compose instalados
- Portas 9000, 5557, 5558 disponíveis

### 1. Iniciar o Sistema Completo

```bash
docker-compose up --build
```

Isso inicia:

- Servidor Node.js (porta 9000)
- Proxy PubSub (portas 5557, 5558)
- Cliente Ruby interativo da Parte 1
- Cliente Ruby interativo da Parte 2
- 2 clientes automáticos Python

### 2. Usar Apenas Servidor e Proxy

```bash
docker-compose up chat-server pubsub-proxy
```

Aguarde ver:

```
chat-server    | Chat Server listening on port 9000...
pubsub-proxy   | PubSub Proxy iniciado:
```

### 3. Clientes Interativos

#### Cliente Parte 1 (sem PubSub)

```bash
docker-compose up ruby-client
```

Funcionalidades:

- Login
- Listar usuários
- Criar canais
- Listar canais

#### Cliente Parte 2 (com PubSub)

```bash
docker-compose up ruby-interactive-client
```

Funcionalidades adicionais:

- Inscrever em canais
- Publicar em canais
- Enviar mensagens diretas
- Receber mensagens em tempo real

Para conectar ao cliente que já está rodando:

```bash
docker attach ruby-interactive-client
```

Sair sem parar: `Ctrl+P` + `Ctrl+Q`

### 4. Clientes Automáticos

```bash
# 2 instâncias (padrão)
docker-compose up python-auto-client

# 5 instâncias
docker-compose up --scale python-auto-client=5 python-auto-client
```

**Importante**: Os clientes automáticos precisam que existam canais. Crie um canal primeiro usando o cliente interativo.

### 5. Múltiplos Clientes Interativos

Para testar mensagens entre usuários, execute em terminais separados:

```bash
# Terminal 1
docker run --rm -it --network distributed-systems_chat-network \
  distributed-systems-ruby-client \
  ruby interactive_client.rb chat-server 9000 pubsub-proxy 5558

# Terminal 2
docker run --rm -it --network distributed-systems_chat-network \
  distributed-systems-ruby-client \
  ruby interactive_client.rb chat-server 9000 pubsub-proxy 5558
```

## 🧪 Fluxo de Teste Completo

### Teste 1: Canal com múltiplos usuários

1. **Inicie servidor e proxy:**

   ```bash
   docker-compose up chat-server pubsub-proxy
   ```

2. **Terminal 2 - Cliente 1:**

   ```bash
   docker-compose up ruby-interactive-client
   ```

   - Login como "alice"
   - Criar canal "geral"
   - Inscrever no canal "geral"

3. **Terminal 3 - Cliente 2:**

   ```bash
   docker run --rm -it --network distributed-systems_chat-network \
     distributed-systems-ruby-client \
     ruby interactive_client.rb chat-server 9000 pubsub-proxy 5558
   ```

   - Login como "bob"
   - Inscrever no canal "geral"
   - Publicar mensagem: "Olá, Alice!"

4. **Ver mensagem chegar em tempo real no Cliente 1**

### Teste 2: Mensagens diretas

1. Com os dois clientes do teste anterior:

2. **Cliente 2 (bob):**

   - Enviar mensagem direta para "alice"
   - Mensagem: "Oi, tudo bem?"

3. **Cliente 1 (alice) recebe automaticamente**

### Teste 3: Clientes automáticos

1. **Criar canal "test"** (via cliente interativo)

2. **Iniciar clientes automáticos:**

   ```bash
   docker-compose up --scale python-auto-client=3 python-auto-client
   ```

3. **No cliente interativo:**
   - Inscrever no canal "test"
   - Ver mensagens automáticas chegando

## 📝 Serviços e Formatos

### Login

**Request:**

```json
{
  "service": "login",
  "data": {
    "user": "nome_usuario",
    "timestamp": 1234567890
  }
}
```

**Response:**

```json
{
  "service": "login",
  "data": {
    "status": "sucesso"|"erro",
    "timestamp": 1234567890,
    "description": "mensagem de erro (opcional)"
  }
}
```

### Listar Usuários

**Request:**

```json
{
  "service": "users",
  "data": {
    "timestamp": 1234567890
  }
}
```

**Response:**

```json
{
  "service": "users",
  "data": {
    "timestamp": 1234567890,
    "users": ["user1", "user2", ...]
  }
}
```

### Criar Canal

**Request:**

```json
{
  "service": "channel",
  "data": {
    "channel": "nome_canal",
    "timestamp": 1234567890
  }
}
```

**Response:**

```json
{
  "service": "channel",
  "data": {
    "status": "sucesso"|"erro",
    "timestamp": 1234567890,
    "description": "mensagem de erro (opcional)"
  }
}
```

### Listar Canais

**Request:**

```json
{
  "service": "channels",
  "data": {
    "timestamp": 1234567890
  }
}
```

**Response:**

```json
{
  "service": "channels",
  "data": {
    "timestamp": 1234567890,
    "channels": ["canal1", "canal2", ...]
  }
}
```

### Publicar em Canal (Parte 2)

**Request:**

```json
{
  "service": "publish",
  "data": {
    "user": "nome_usuario",
    "channel": "nome_canal",
    "message": "mensagem",
    "timestamp": 1234567890
  }
}
```

**Response:**

```json
{
  "service": "publish",
  "data": {
    "status": "OK"|"erro",
    "message": "mensagem de erro (opcional)",
    "timestamp": 1234567890
  }
}
```

**Publicação no tópico do canal:**

```json
{
  "user": "nome_usuario",
  "message": "mensagem",
  "timestamp": 1234567890
}
```

### Mensagem Direta (Parte 2)

**Request:**

```json
{
  "service": "message",
  "data": {
    "src": "usuario_origem",
    "dst": "usuario_destino",
    "message": "mensagem",
    "timestamp": 1234567890
  }
}
```

**Response:**

```json
{
  "service": "message",
  "data": {
    "status": "OK"|"erro",
    "message": "mensagem de erro (opcional)",
    "timestamp": 1234567890
  }
}
```

**Publicação no tópico do usuário destino:**

```json
{
  "src": "usuario_origem",
  "message": "mensagem",
  "timestamp": 1234567890
}
```

## 💾 Persistência

O servidor persiste automaticamente em `node-server/data/server_data.json`:

- Usuários (com timestamps de criação e último login)
- Canais criados
- Publicações em canais
- Mensagens diretas

Ver dados:

```bash
docker exec chat-server cat /app/data/server_data.json
```

Formatado (com jq):

```bash
docker exec chat-server cat /app/data/server_data.json | jq
```

## 📂 Estrutura do Projeto

```
distributed-systems/
├── docker-compose.yml
├── node-server/              # Servidor (Node.js + TypeScript)
│   ├── Dockerfile
│   ├── src/
│   │   ├── server.ts        # Servidor principal
│   │   └── types.ts         # Tipos TypeScript
│   ├── package.json
│   └── tsconfig.json
├── ruby-client/              # Clientes Ruby
│   ├── Dockerfile
│   ├── chat_client.rb       # Cliente Parte 1
│   ├── interactive_client.rb # Cliente Parte 2 (com PubSub)
│   └── Gemfile
├── python-auto-client/       # Cliente automático Python
│   ├── Dockerfile
│   ├── auto_client.py
│   └── README.md
├── pubsub-proxy/             # Proxy PubSub
│   ├── Dockerfile
│   ├── proxy.py
│   └── README.md
├── parte1.md                 # Especificação Parte 1
├── parte2.md                 # Especificação Parte 2
└── README.md                 # Este arquivo
```

## 🔧 Comandos Úteis

### Ver logs

```bash
# Servidor
docker-compose logs -f chat-server

# Proxy
docker-compose logs -f pubsub-proxy

# Clientes automáticos
docker-compose logs -f python-auto-client

# Todos
docker-compose logs -f
```

### Gerenciar containers

```bash
# Ver status
docker-compose ps

# Parar tudo
docker-compose down

# Parar e remover volumes (limpa dados)
docker-compose down -v

# Reiniciar um serviço
docker-compose restart chat-server
```

### Reconstruir após mudanças

```bash
# Reconstruir tudo
docker-compose build

# Reconstruir serviço específico
docker-compose build chat-server
docker-compose build ruby-client
docker-compose build python-auto-client
```

### Executar comandos nos containers

```bash
# Shell no servidor
docker exec -it chat-server sh

# Ver arquivo de dados
docker exec chat-server cat /app/data/server_data.json
```

## 🐛 Troubleshooting

### Cliente não recebe mensagens

- Verifique se está inscrito no canal/tópico correto
- Confirme que o proxy está rodando: `docker-compose ps`
- Veja logs do proxy: `docker-compose logs pubsub-proxy`

### Servidor não conecta ao proxy

- Aguarde alguns segundos após iniciar o proxy
- Verifique se estão na mesma rede Docker
- Reinicie: `docker-compose restart chat-server`

### Cliente automático não envia mensagens

- Confirme que existem canais criados
- Veja logs: `docker-compose logs python-auto-client`

### Cliente não aceita entrada

- Use as flags `-it` ao executar:
  ```bash
  docker-compose run --rm -it ruby-client ...
  ```

### Porta já em uso

- Pare containers: `docker-compose down`
- Ou mude a porta no `docker-compose.yml`

### Mudanças não aparecem

- Sempre reconstrua: `docker-compose build`
- Para mudanças em volumes: `docker-compose down -v`

## 📊 Status do Projeto

- ✅ **Parte 1**: Request-Reply completo

  - Login de usuários
  - Listagem de usuários
  - Criação de canais
  - Listagem de canais
  - Persistência de dados

- ✅ **Parte 2**: Publisher-Subscriber completo

  - Proxy PubSub
  - Publicação em canais
  - Mensagens diretas
  - Cliente com subscriber
  - Cliente automático
  - Persistência de mensagens

- ⏳ **Parte 3**: Em planejamento

## 🛠 Tecnologias

- **Servidor**: Node.js 22 + TypeScript + ZeroMQ
- **Proxy**: Python 3.13 + pyzmq
- **Cliente Interativo**: Ruby 3.3 + ffi-rzmq
- **Cliente Automático**: Python 3.13 + pyzmq
- **Containerização**: Docker + Docker Compose
- **Persistência**: JSON em volume Docker

## 📚 Referências

- [ZeroMQ Guide](https://zguide.zeromq.org/)
- [ZeroMQ Patterns](https://zguide.zeromq.org/docs/chapter2/)
- Especificações: `parte1.md`, `parte2.md`

## 📝 Licença

Projeto acadêmico - Sistemas Distribuídos
