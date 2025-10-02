#!/usr/bin/env python3

import zmq
import json
import time
import random
import string
import sys

# Configuração
SERVER_HOST = sys.argv[1] if len(sys.argv) > 1 else "chat-server"
SERVER_PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 9000

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


def send_request(socket, service, data):
    """Envia uma requisição e retorna a resposta"""
    request = {
        "service": service,
        "data": data
    }

    socket.send_string(json.dumps(request))
    response = socket.recv_string()
    return json.loads(response)


def main():
    print("=" * 50)
    print("Cliente Automático Python")
    print(f"Servidor: {SERVER_HOST}:{SERVER_PORT}")
    print("=" * 50)

    # Criar contexto e socket
    context = zmq.Context()
    socket = context.socket(zmq.REQ)
    socket.connect(f"tcp://{SERVER_HOST}:{SERVER_PORT}")

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

            # 3. Enviar 10 mensagens para o canal
            print(f"\n📨 Enviando 10 mensagens para '{channel}'...")

            for i in range(10):
                message = random.choice(SAMPLE_MESSAGES)

                response = send_request(socket, "publish", {
                    "user": username,
                    "channel": channel,
                    "message": f"[{i+1}/10] {message}",
                    "timestamp": int(time.time())
                })

                if response["data"]["status"] == "OK":
                    print(f"  ✓ Mensagem {i+1}/10 enviada")
                else:
                    print(
                        f"  ✗ Erro na mensagem {i+1}/10: {response['data'].get('message', 'Unknown error')}")

                # Pequeno delay entre mensagens
                time.sleep(0.5)

            print(f"\n✅ 10 mensagens enviadas para '{channel}'")

            # Aguardar antes da próxima iteração
            wait_time = random.randint(3, 8)
            print(
                f"\n⏳ Aguardando {wait_time} segundos antes da próxima iteração...")
            time.sleep(wait_time)

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
