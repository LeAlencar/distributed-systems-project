#!/usr/bin/env ruby

require "ffi-rzmq"
require "json"

# Configuração
SERVER_HOST = ARGV[0] || "chat-server"
SERVER_PORT = ARGV[1]&.to_i || 9000

# Conectar ao servidor
context = ZMQ::Context.new(1)
socket = context.socket(ZMQ::REQ)
socket.connect("tcp://#{SERVER_HOST}:#{SERVER_PORT}")

puts "=" * 50
puts "Cliente de Chat - Conectado a #{SERVER_HOST}:#{SERVER_PORT}"
puts "=" * 50
puts ""

# Variável para armazenar o nome do usuário logado
current_user = nil

# Função auxiliar para enviar requisição
def send_request(socket, service, data)
  request = { "service" => service, "data" => data }
  puts "\n[Enviando] #{request.to_json}"
  socket.send_string(request.to_json)
  
  response = ""
  socket.recv_string(response)
  parsed_response = JSON.parse(response)
  puts "[Resposta] #{parsed_response.to_json}"
  parsed_response
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
    puts "4. Logout"
    puts "5. Sair"
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
      
      puts "\nEnviando requisição de login..."
      response = send_request(socket, "login", {
        "user" => username,
        "timestamp" => Time.now.to_i
      })
      
      if response["data"]["status"] == "sucesso"
        current_user = username
        puts "\n✅ Login realizado com sucesso!"
        puts "Bem-vindo(a), #{current_user}!"
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
      puts "\nListando usuários cadastrados..."
      response = send_request(socket, "users", {
        "timestamp" => Time.now.to_i
      })
      
      if response["data"]["users"]
        puts "\n📋 Usuários cadastrados:"
        response["data"]["users"].each_with_index do |user, index|
          puts "  #{index + 1}. #{user}"
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
      
      puts "\nCriando canal '#{channel_name}'..."
      response = send_request(socket, "channel", {
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
      puts "\nListando canais disponíveis..."
      response = send_request(socket, "channels", {
        "timestamp" => Time.now.to_i
      })
      
      if response["data"]["channels"]
        puts "\n📋 Canais disponíveis:"
        response["data"]["channels"].each_with_index do |channel, index|
          puts "  #{index + 1}. #{channel}"
        end
      else
        puts "\n❌ Erro ao listar canais"
      end
      
    when "4"
      # Logout
      current_user = nil
      puts "\n✅ Logout realizado com sucesso!"
      
    when "5"
      # Sair
      puts "\nEncerrando..."
      break
      
    else
      puts "\n❌ Opção inválida!"
    end
  end
  
  # Pequena pausa para melhor visualização
  sleep(0.5)
end

# Cleanup
puts "\nFechando conexão..."
socket.close
context.terminate
puts "Até logo!"

