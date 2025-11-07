#!/usr/bin/env python3

import zmq

print("=" * 50)
print("Request-Reply Broker")
print("=" * 50)

# Criar contexto
context = zmq.Context()

# Socket ROUTER para clientes (frontend)
client_socket = context.socket(zmq.ROUTER)
client_socket.bind("tcp://*:5555")
print("✓ ROUTER (clientes) escutando em tcp://*:5555")

# Socket DEALER para servidores (backend)
server_socket = context.socket(zmq.DEALER)
server_socket.bind("tcp://*:5556")
print("✓ DEALER (servidores) escutando em tcp://*:5556")

print("\n🔄 Broker iniciado e pronto para rotear mensagens")
print("   Clientes conectam em: 5555")
print("   Servidores conectam em: 5556")
print("\nPressione Ctrl+C para parar\n")

try:
    # Proxy redireciona mensagens entre clientes e servidores
    zmq.proxy(client_socket, server_socket)
except KeyboardInterrupt:
    print("\n\n⚠️  Interrompido pelo usuário")
finally:
    print("Fechando sockets...")
    client_socket.close()
    server_socket.close()
    context.term()
    print("Broker encerrado.")
