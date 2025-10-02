import zmq

context = zmq.Context()

# XPUB: porta 5558 - subscribers se conectam aqui
xpub = context.socket(zmq.XPUB)
xpub.bind("tcp://*:5558")

# XSUB: porta 5557 - publishers se conectam aqui
xsub = context.socket(zmq.XSUB)
xsub.bind("tcp://*:5557")

print("PubSub Proxy iniciado:")
print("  XSUB (publishers): tcp://*:5557")
print("  XPUB (subscribers): tcp://*:5558")

# O proxy redireciona mensagens entre publishers e subscribers
zmq.proxy(xsub, xpub)

xpub.close()
xsub.close()
context.term()
