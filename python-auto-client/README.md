# Cliente Automático Python

Cliente automatizado que envia mensagens continuamente para testar o sistema de chat.

## Funcionalidade

O cliente automático:

1. Gera um nome de usuário aleatório (ex: `bot_1234`, `auto_5678`)
2. Faz login no servidor
3. Entra em um loop infinito:
   - Obtém a lista de canais disponíveis
   - Escolhe um canal aleatório
   - Envia 10 mensagens definidas para o canal
   - Aguarda alguns segundos
   - Repete o processo

## Mensagens

O cliente envia mensagens aleatórias de uma lista pré-definida, incluindo:

- "Olá, tudo bem?"
- "Que legal este chat!"
- "Teste de mensagem automática"
- "Python é incrível!"
- E outras...

## Uso

### Via Docker Compose

```bash
# Iniciar uma instância
docker-compose up python-auto-client

# Iniciar múltiplas instâncias (scale)
docker-compose up --scale python-auto-client=3
```

### Standalone

```bash
python auto_client.py [SERVER_HOST] [SERVER_PORT]

# Exemplo
python auto_client.py chat-server 9000
```

## Observações

- O cliente precisa que existam canais no servidor para funcionar
- Caso não existam canais, ele aguardará até que sejam criados
- Cada instância gera um nome de usuário único
- Útil para testar carga e concorrência no sistema
