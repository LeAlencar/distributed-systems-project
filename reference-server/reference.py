#!/usr/bin/env python3

import zmq
import msgpack
import time
import threading
from typing import Dict
from datetime import datetime


class ReferenceServer:
    def __init__(self, port: int = 5559):
        self.port = port
        self.context = zmq.Context()
        self.socket = self.context.socket(zmq.REP)

        # Estado
        # {name: {rank: int, last_heartbeat: float}}
        self.servers: Dict[str, Dict] = {}
        self.next_rank = 1
        self.logical_clock = 0
        self.lock = threading.Lock()

        # Timeout para considerar servidor offline (30 segundos)
        self.heartbeat_timeout = 30.0

        print("=" * 50)
        print("Reference Server")
        print("=" * 50)

    def increment_clock(self, received_clock: int = 0) -> int:
        """Incrementa o relógio lógico seguindo as regras de Lamport"""
        with self.lock:
            self.logical_clock = max(self.logical_clock, received_clock) + 1
            return self.logical_clock

    def cleanup_inactive_servers(self):
        """Remove servidores que não enviaram heartbeat há muito tempo"""
        while True:
            time.sleep(10)  # Verifica a cada 10 segundos
            current_time = time.time()
            with self.lock:
                inactive = []
                for name, info in self.servers.items():
                    if current_time - info['last_heartbeat'] > self.heartbeat_timeout:
                        inactive.append(name)

                for name in inactive:
                    print(
                        f"⚠️  Servidor '{name}' (rank {self.servers[name]['rank']}) removido por inatividade")
                    del self.servers[name]

    def handle_rank(self, data: Dict) -> Dict:
        """Atribui rank a um servidor"""
        server_name = data.get('user')
        received_clock = data.get('clock', 0)

        clock = self.increment_clock(received_clock)

        with self.lock:
            if server_name not in self.servers:
                rank = self.next_rank
                self.next_rank += 1
                self.servers[server_name] = {
                    'rank': rank,
                    'last_heartbeat': time.time()
                }
                print(
                    f"✓ Novo servidor registrado: '{server_name}' com rank {rank}")
            else:
                rank = self.servers[server_name]['rank']
                self.servers[server_name]['last_heartbeat'] = time.time()
                print(
                    f"✓ Servidor '{server_name}' reconectado com rank {rank}")

        return {
            'service': 'rank',
            'data': {
                'rank': rank,
                'timestamp': int(time.time() * 1000),
                'clock': clock
            }
        }

    def handle_list(self, data: Dict) -> Dict:
        """Retorna lista de servidores ativos"""
        received_clock = data.get('clock', 0)
        clock = self.increment_clock(received_clock)

        with self.lock:
            server_list = [
                {'name': name, 'rank': info['rank']}
                for name, info in self.servers.items()
            ]

        print(
            f"✓ Lista de servidores solicitada: {len(server_list)} servidor(es) ativo(s)")

        return {
            'service': 'list',
            'data': {
                'list': server_list,
                'timestamp': int(time.time() * 1000),
                'clock': clock
            }
        }

    def handle_heartbeat(self, data: Dict) -> Dict:
        """Atualiza timestamp do heartbeat do servidor"""
        server_name = data.get('user')
        received_clock = data.get('clock', 0)

        clock = self.increment_clock(received_clock)

        with self.lock:
            if server_name in self.servers:
                self.servers[server_name]['last_heartbeat'] = time.time()
                # print(f"💓 Heartbeat recebido de '{server_name}'")
            else:
                print(
                    f"⚠️  Heartbeat de servidor desconhecido: '{server_name}'")

        return {
            'service': 'heartbeat',
            'data': {
                'timestamp': int(time.time() * 1000),
                'clock': clock
            }
        }

    def start(self):
        """Inicia o servidor de referência"""
        self.socket.bind(f"tcp://*:{self.port}")
        print(f"✓ Servidor de referência escutando em tcp://*:{self.port}")
        print("\nServiços disponíveis:")
        print("  - rank: Atribui rank a servidores")
        print("  - list: Lista servidores ativos")
        print("  - heartbeat: Recebe heartbeat de servidores")
        print("\nPressione Ctrl+C para parar\n")

        # Iniciar thread de limpeza
        cleanup_thread = threading.Thread(
            target=self.cleanup_inactive_servers, daemon=True)
        cleanup_thread.start()

        try:
            while True:
                # Receber requisição
                message = self.socket.recv()
                request = msgpack.unpackb(message, raw=False)

                service = request.get('service')
                data = request.get('data', {})

                # Processar requisição
                if service == 'rank':
                    response = self.handle_rank(data)
                elif service == 'list':
                    response = self.handle_list(data)
                elif service == 'heartbeat':
                    response = self.handle_heartbeat(data)
                else:
                    clock = self.increment_clock(data.get('clock', 0))
                    response = {
                        'service': service,
                        'data': {
                            'status': 'erro',
                            'description': f'Serviço desconhecido: {service}',
                            'timestamp': int(time.time() * 1000),
                            'clock': clock
                        }
                    }

                # Enviar resposta
                self.socket.send(msgpack.packb(response, use_bin_type=True))

        except KeyboardInterrupt:
            print("\n\n⚠️  Interrompido pelo usuário")
        finally:
            print("Fechando servidor...")
            self.socket.close()
            self.context.term()
            print("Servidor de referência encerrado.")


if __name__ == "__main__":
    server = ReferenceServer()
    server.start()
