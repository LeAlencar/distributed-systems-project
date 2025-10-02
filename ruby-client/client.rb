require "ffi-rzmq"

context = ZMQ::Context.new(1)

puts "Opening connection for READ"
inbound = context.socket(ZMQ::PULL)
inbound.bind("tcp://127.0.0.1:9000")

outbound = context.socket(ZMQ::PUSH)
outbound.connect("tcp://127.0.0.1:9000")
outbound.send_string("Hello World!")
outbound.send_string("QUIT")

loop do
  data = ""
  inbound.recv_string(data)
  p data
  break if data == "QUIT"
end
