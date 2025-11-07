# Reference Server

Servidor de referência para gerenciamento de servidores no sistema de chat distribuído (Parte 4).

## Responsabilidades

1. **Rank**: Atribui um rank único para cada servidor que se registra
2. **Lista**: Mantém e fornece a lista de servidores ativos
3. **Heartbeat**: Recebe heartbeats periódicos dos servidores e remove servidores inativos

## Protocolo

### Rank Service

Requisição:

```json
{
  "service": "rank",
  "data": {
    "user": "server-name",
    "timestamp": 1234567890,
    "clock": 42
  }
}
```

Resposta:

```json
{
  "service": "rank",
  "data": {
    "rank": 1,
    "timestamp": 1234567891,
    "clock": 43
  }
}
```

### List Service

Requisição:

```json
{
  "service": "list",
  "data": {
    "timestamp": 1234567890,
    "clock": 42
  }
}
```

Resposta:

```json
{
  "service": "list",
  "data": {
    "list": [
      { "name": "server-1", "rank": 1 },
      { "name": "server-2", "rank": 2 }
    ],
    "timestamp": 1234567891,
    "clock": 43
  }
}
```

### Heartbeat Service

Requisição:

```json
{
  "service": "heartbeat",
  "data": {
    "user": "server-name",
    "timestamp": 1234567890,
    "clock": 42
  }
}
```

Resposta:

```json
{
  "service": "heartbeat",
  "data": {
    "timestamp": 1234567891,
    "clock": 43
  }
}
```

## Características

- **Relógio Lógico**: Implementa relógio lógico de Lamport
- **Limpeza Automática**: Remove servidores inativos após 30s sem heartbeat
- **Thread-Safe**: Usa locks para operações thread-safe

## Porta

- **5559**: REQ/REP para comunicação com servidores
