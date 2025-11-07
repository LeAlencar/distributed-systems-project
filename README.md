# Sistema de Troca de Mensagens Instantâneas

Projeto de sistema distribuído para troca de mensagens usando ZeroMQ.

## 📋 Sobre o Projeto

Este projeto implementa um sistema de chat distribuído com:

- **Parte 1**: Request-Reply para login, gerenciamento de usuários e canais
- **Parte 2**: Publisher-Subscriber para mensagens em canais e mensagens diretas
- **Parte 3**: Migração para MessagePack e SQLite.
- **Parte 4**: Relógios lógicos, sincronização de servidores e eleição de coordenador
- **Parte 5**: Replicação de dados entre servidores (Write-All)

## 🚀 Como Usar

### Iniciar o Sistema Completo (Parte 4)

```bash
# Build
docker compose build

# Iniciar com 3 servidores
docker compose up
```

Isso inicia:

- Reference Server (porta 5559)
- REQ/REP Broker (portas 5555/5556)
- PubSub Proxy (portas 5557/5558)
- 3 Servidores Chat (com ranks 1, 2, 3)
- Cliente Ruby interativo
- 2 Clientes automáticos Python

### Verificar Funcionamento

````bash
# Ver logs do reference server
docker compose logs -f reference-server

# Ver logs dos servidores
docker compose logs -f chat-server

### Usar Cliente Interativo

```bash
docker attach ruby-client
````

## 🗄️ Testando o SQLite

### Localização do Banco

- **No container**: `/app/data/chat.db`

### Queries Úteis

```bash
# Ver usuários
docker exec distributed-systems-chat-server-1 sqlite3 /app/data/chat.db "SELECT * FROM users;"

# Ver canais
docker exec distributed-systems-chat-server-1 sqlite3 /app/data/chat.db "SELECT * FROM channels;"

```
