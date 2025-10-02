# PubSub Proxy

Proxy ZeroMQ para o padrão Publisher-Subscriber usado na Parte 2 do projeto.

## Funcionalidade

Este proxy conecta publishers e subscribers usando os sockets XPUB e XSUB do ZeroMQ:

- **XSUB (porta 5557)**: Publishers se conectam aqui para enviar mensagens
- **XPUB (porta 5558)**: Subscribers se conectam aqui para receber mensagens

## Como usar

O proxy é automaticamente iniciado pelo `docker-compose.yml`:

```bash
docker-compose up pubsub-proxy
```

## Conexão

### Para Publishers (enviar mensagens)

```python
# Python
import zmq
context = zmq.Context()
socket = context.socket(zmq.PUB)
socket.connect("tcp://pubsub-proxy:5557")
```

```javascript
// JavaScript/TypeScript
import * as zmq from "zeromq";
const socket = new zmq.Publisher();
await socket.connect("tcp://pubsub-proxy:5557");
```

### Para Subscribers (receber mensagens)

```python
# Python
import zmq
context = zmq.Context()
socket = context.socket(zmq.SUB)
socket.connect("tcp://pubsub-proxy:5558")
socket.setsockopt_string(zmq.SUBSCRIBE, "nome-do-topico")
```

```javascript
// JavaScript/TypeScript
import * as zmq from "zeromq";
const socket = new zmq.Subscriber();
await socket.connect("tcp://pubsub-proxy:5558");
socket.subscribe("nome-do-topico");
```

## Tópicos

No contexto do projeto:

- **Canais**: Tópico = nome do canal
- **Mensagens diretas**: Tópico = nome do usuário destinatário
