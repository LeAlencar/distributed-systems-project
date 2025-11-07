#!/usr/bin/env ruby

require "ffi-rzmq"
require "msgpack"

# Configuração
BROKER_HOST = ARGV[0] || "req-rep-broker"
BROKER_PORT = ARGV[1]&.to_i || 5555
PUBSUB_HOST = ARGV[2] || "pubsub-proxy"
PUBSUB_PORT = ARGV[3]&.to_i || 5558

# Relógio lógico (Parte 4)
$logical_clock = 0

def increment_clock(received_clock = 0)
  """Incrementa o relógio lógico seguindo as regras de Lamport"""
  $logical_clock = [$logical_clock, received_clock].max + 1
  $logical_clock
end

# Contexto ZMQ
context = ZMQ::Context.new(1)

# Socket Request-Reply para comandos (conecta ao broker)
req_socket = context.socket(ZMQ::REQ)
req_socket.connect("tcp://#{BROKER_HOST}:#{BROKER_PORT}")

# Socket Subscriber para receber mensagens
sub_socket = context.socket(ZMQ::SUB)
sub_socket.connect("tcp://#{PUBSUB_HOST}:#{PUBSUB_PORT}")

puts "=" * 50
puts "Cliente de Chat Interativo"
puts "Broker: #{BROKER_HOST}:#{BROKER_PORT}"
puts "PubSub: #{PUBSUB_HOST}:#{PUBSUB_PORT}"
puts "=" * 50
puts ""

# Variável para armazenar o nome do usuário logado
current_user = nil
subscribed_channels = []

# Função auxiliar para enviar requisição
def send_request(socket, service, data)
  # Incrementar relógio antes de enviar
  clock = increment_clock()
  data["clock"] = clock
  
  request = { "service" => service, "data" => data }
  puts "\n[Enviando] #{service} (clock: #{clock})"
  packed_request = MessagePack.pack(request)
  socket.send_string(packed_request)
  
  response = ""
  socket.recv_string(response)
  parsed_response = MessagePack.unpack(response)
  
  # Atualizar relógio ao receber resposta
  if parsed_response["data"] && parsed_response["data"]["clock"]
    increment_clock(parsed_response["data"]["clock"])
  end
  
  parsed_response
end

# Thread para receber mensagens do subscriber
subscriber_thread = Thread.new do
  loop do
    begin
      topic = ""
      
      # Receber tópico (primeira parte)
      rc = sub_socket.recv_string(topic, ZMQ::DONTWAIT)
      if rc >= 0
        # Verificar se há mais partes (segunda parte com a mensagem)
        if sub_socket.more_parts?
          message = ""
          if sub_socket.recv_string(message) >= 0
            begin
              data = MessagePack.unpack(message)
              
              puts "\n" + "=" * 50
              if data["src"]
                # Mensagem direta
                puts "📨 Nova mensagem de #{data['src']}:"
                puts "   #{data['message']}"
              elsif data["user"]
                # Publicação em canal
                puts "📢 [#{topic}] #{data['user']}:"
                puts "   #{data['message']}"
              end
              puts "=" * 50
              print "\nEscolha uma opção: "
            rescue => e
              # Ignorar erros de parse MessagePack
            end
          end
        end
      end
      
      sleep(0.1)
    rescue => e
      # Ignorar erros de EAGAIN (não há mensagens)
      unless e.message.include?("EAGAIN") || e.to_s.include?("EAGAIN")
        # Log de erros inesperados
        STDERR.puts "Erro no subscriber: #{e.message}"
      end
      sleep(0.1)
    end
  end
end

# Função para exibir o menu
def show_menu(logged_in)
  puts "\n" + "=" * 50
  puts "MENU"
  puts "=" * 50
  if logged_in
    puts "1. Listar usuários"
    puts "2. Criar canal"
    puts "3. Listar canais"
    puts "4. Inscrever em canal"
    puts "5. Publicar em canal"
    puts "6. Enviar mensagem direta"
    puts "7. Ver canais inscritos"
    puts "8. Logout"
    puts "9. Sair"
  else
    puts "1. Login"
    puts "2. Sair"
  end
  puts "=" * 50
  print "Escolha uma opção: "
end

# Loop principal
loop do
  show_menu(!current_user.nil?)
  option = STDIN.gets.chomp
  
  if current_user.nil?
    # Menu quando não está logado
    case option
    when "1"
      # Login
      print "\nDigite seu nome de usuário: "
      username = STDIN.gets.chomp
      
      if username.empty?
        puts "❌ Nome de usuário não pode ser vazio!"
        next
      end
      
      response = send_request(req_socket, "login", {
        "user" => username,
        "timestamp" => Time.now.to_i
      })
      
      if response["data"]["status"] == "sucesso"
        current_user = username
        
        # Inscrever no tópico do próprio usuário para receber mensagens diretas
        sub_socket.setsockopt(ZMQ::SUBSCRIBE, username)
        
        puts "\n✅ Login realizado com sucesso!"
        puts "Bem-vindo(a), #{current_user}!"
        puts "Você está inscrito para receber mensagens diretas."
      else
        puts "\n❌ Erro no login: #{response["data"]["description"]}"
      end
      
    when "2"
      # Sair
      puts "\nEncerrando..."
      break
      
    else
      puts "\n❌ Opção inválida!"
    end
  else
    # Menu quando está logado
    case option
    when "1"
      # Listar usuários
      response = send_request(req_socket, "users", {
        "timestamp" => Time.now.to_i
      })
      
      if response["data"]["users"]
        puts "\n📋 Usuários cadastrados:"
        response["data"]["users"].each_with_index do |user, index|
          marker = user == current_user ? " (você)" : ""
          puts "  #{index + 1}. #{user}#{marker}"
        end
      else
        puts "\n❌ Erro ao listar usuários"
      end
      
    when "2"
      # Criar canal
      print "\nDigite o nome do canal a ser criado: "
      channel_name = STDIN.gets.chomp
      
      if channel_name.empty?
        puts "❌ Nome do canal não pode ser vazio!"
        next
      end
      
      response = send_request(req_socket, "channel", {
        "channel" => channel_name,
        "timestamp" => Time.now.to_i
      })
      
      if response["data"]["status"] == "sucesso"
        puts "\n✅ Canal '#{channel_name}' criado com sucesso!"
      else
        puts "\n❌ Erro ao criar canal: #{response["data"]["description"]}"
      end
      
    when "3"
      # Listar canais
      response = send_request(req_socket, "channels", {
        "timestamp" => Time.now.to_i
      })
      
      if response["data"]["channels"]
        puts "\n📋 Canais disponíveis:"
        response["data"]["channels"].each_with_index do |channel, index|
          subscribed = subscribed_channels.include?(channel) ? " ✓" : ""
          puts "  #{index + 1}. #{channel}#{subscribed}"
        end
      else
        puts "\n❌ Erro ao listar canais"
      end
      
    when "4"
      # Inscrever em canal
      print "\nDigite o nome do canal para se inscrever: "
      channel_name = STDIN.gets.chomp
      
      if channel_name.empty?
        puts "❌ Nome do canal não pode ser vazio!"
        next
      end
      
      if subscribed_channels.include?(channel_name)
        puts "⚠️ Você já está inscrito no canal '#{channel_name}'"
        next
      end
      
      # Inscrever no tópico
      sub_socket.setsockopt(ZMQ::SUBSCRIBE, channel_name)
      subscribed_channels << channel_name
      puts "\n✅ Inscrito no canal '#{channel_name}' com sucesso!"
      
    when "5"
      # Publicar em canal
      print "\nDigite o nome do canal: "
      channel_name = STDIN.gets.chomp
      
      if channel_name.empty?
        puts "❌ Nome do canal não pode ser vazio!"
        next
      end
      
      print "Digite a mensagem: "
      message = STDIN.gets.chomp
      
      if message.empty?
        puts "❌ Mensagem não pode ser vazia!"
        next
      end
      
      response = send_request(req_socket, "publish", {
        "user" => current_user,
        "channel" => channel_name,
        "message" => message,
        "timestamp" => Time.now.to_i
      })
      
      if response["data"]["status"] == "OK"
        puts "\n✅ Mensagem publicada com sucesso!"
      else
        puts "\n❌ Erro ao publicar: #{response["data"]["message"]}"
      end
      
    when "6"
      # Enviar mensagem direta
      print "\nDigite o nome do usuário destinatário: "
      dst_user = STDIN.gets.chomp
      
      if dst_user.empty?
        puts "❌ Nome do usuário não pode ser vazio!"
        next
      end
      
      print "Digite a mensagem: "
      message = STDIN.gets.chomp
      
      if message.empty?
        puts "❌ Mensagem não pode ser vazia!"
        next
      end
      
      response = send_request(req_socket, "message", {
        "src" => current_user,
        "dst" => dst_user,
        "message" => message,
        "timestamp" => Time.now.to_i
      })
      
      if response["data"]["status"] == "OK"
        puts "\n✅ Mensagem enviada com sucesso!"
      else
        puts "\n❌ Erro ao enviar: #{response["data"]["message"]}"
      end
      
    when "7"
      # Ver canais inscritos
      if subscribed_channels.empty?
        puts "\n📋 Você não está inscrito em nenhum canal ainda."
      else
        puts "\n📋 Canais inscritos:"
        subscribed_channels.each_with_index do |channel, index|
          puts "  #{index + 1}. #{channel}"
        end
      end
      
    when "8"
      # Logout
      # Desinscrever de todos os canais
      subscribed_channels.each do |channel|
        sub_socket.setsockopt(ZMQ::UNSUBSCRIBE, channel)
      end
      sub_socket.setsockopt(ZMQ::UNSUBSCRIBE, current_user) if current_user
      
      subscribed_channels.clear
      current_user = nil
      puts "\n✅ Logout realizado com sucesso!"
      
    when "9"
      # Sair
      puts "\nEncerrando..."
      break
      
    else
      puts "\n❌ Opção inválida!"
    end
  end
  
  # Pequena pausa para melhor visualização
  sleep(0.3)
end

# Cleanup
subscriber_thread.kill
puts "\nFechando conexões..."
req_socket.close
sub_socket.close
context.terminate
puts "Até logo!"

