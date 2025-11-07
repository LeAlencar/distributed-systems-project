#!/usr/bin/env python3

import zmq
import msgpack
import time
import random
import string
import sys

# Configuração
BROKER_HOST = sys.argv[1] if len(sys.argv) > 1 else "req-rep-broker"
BROKER_PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 5555

# Relógio lógico (Parte 4)
logical_clock = 0

# Mensagens aleatórias para enviar
SAMPLE_MESSAGES = [
    "Olá, tudo bem?",
    "Alguém aí?",
    "Que legal este chat!",
    "Teste de mensagem automática",
    "Python é incrível!",
    "Sistemas distribuídos são fascinantes",
    "ZeroMQ facilita muito",
    "Mais uma mensagem de teste",
    "Chat funcionando perfeitamente",
    "Enviando mais uma mensagem"
]


def generate_random_username():
    """Gera um nome de usuário aleatório"""
    prefix = random.choice(["bot", "user", "auto", "test", "client"])
    suffix = ''.join(random.choices(string.digits, k=4))
    return f"{prefix}_{suffix}"


def increment_clock(received_clock=0):
    """Incrementa o relógio lógico seguindo as regras de Lamport"""
    global logical_clock
    logical_clock = max(logical_clock, received_clock) + 1
    return logical_clock


def send_request(socket, service, data):
    """Envia uma requisição e retorna a resposta"""
    # Incrementar relógio antes de enviar
    clock = increment_clock()
    data['clock'] = clock

    request = {
        "service": service,
        "data": data
    }

    packed_request = msgpack.packb(request, use_bin_type=True)
    socket.send(packed_request)
    response = socket.recv()
    response_data = msgpack.unpackb(response, raw=False)

    # Atualizar relógio ao receber resposta
    if 'data' in response_data and 'clock' in response_data['data']:
        increment_clock(response_data['data']['clock'])

    return response_data


def main():
    print("=" * 50)
    print("Cliente Automático Python")
    print(f"Broker: {BROKER_HOST}:{BROKER_PORT}")
    print("=" * 50)

    # Criar contexto e socket
    context = zmq.Context()
    socket = context.socket(zmq.REQ)
    socket.connect(f"tcp://{BROKER_HOST}:{BROKER_PORT}")

    # Gerar nome de usuário aleatório
    username = generate_random_username()
    print(f"\n🤖 Nome do cliente: {username}")

    # Fazer login
    print("\n📝 Fazendo login...")
    response = send_request(socket, "login", {
        "user": username,
        "timestamp": int(time.time())
    })

    if response["data"]["status"] != "sucesso":
        print(
            f"❌ Erro no login: {response['data'].get('description', 'Unknown error')}")
        socket.close()
        context.term()
        return

    print(f"✅ Login realizado com sucesso como {username}")

    # Aguardar um pouco antes de começar
    time.sleep(2)

    # Loop infinito
    iteration = 1
    while True:
        try:
            print(f"\n{'=' * 50}")
            print(f"Iteração #{iteration}")
            print(f"{'=' * 50}")

            # 1. Obter lista de canais
            print("\n📋 Obtendo lista de canais...")
            response = send_request(socket, "channels", {
                "timestamp": int(time.time())
            })

            channels = response["data"].get("channels", [])

            if not channels:
                print("⚠️  Nenhum canal disponível ainda. Aguardando...")
                time.sleep(5)
                iteration += 1
                continue

            print(f"✅ {len(channels)} canais disponíveis: {', '.join(channels)}")

            # 2. Escolher um canal aleatório
            channel = random.choice(channels)
            print(f"\n🎯 Canal escolhido: {channel}")

            # 3. Enviar 1 mensagem para o canal
            message = random.choice(SAMPLE_MESSAGES)
            print(f"\n📨 Enviando mensagem para '{channel}'...")

            response = send_request(socket, "publish", {
                "user": username,
                "channel": channel,
                "message": message,
                "timestamp": int(time.time())
            })

            if response["data"]["status"] == "OK":
                print(f"  ✓ Mensagem enviada: {message}")
            else:
                print(
                    f"  ✗ Erro ao enviar mensagem: {response['data'].get('message', 'Unknown error')}")

            # Aguardar 60 segundos antes da próxima mensagem
            print(f"\n⏳ Aguardando 60 segundos antes da próxima mensagem...")
            time.sleep(60)

            iteration += 1

        except KeyboardInterrupt:
            print("\n\n⚠️  Interrompido pelo usuário")
            break
        except Exception as e:
            print(f"\n❌ Erro: {e}")
            print("Tentando novamente em 5 segundos...")
            time.sleep(5)

    # Cleanup
    print("\n🔌 Fechando conexão...")
    socket.close()
    context.term()
    print("👋 Até logo!")


if __name__ == "__main__":
    main()
