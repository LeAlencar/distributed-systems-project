import * as zmq from "zeromq";
import * as fs from "fs";
import * as path from "path";
import {
  BaseRequest,
  BaseResponse,
  LoginRequest,
  LoginResponse,
  UsersRequest,
  UsersResponse,
  ChannelRequest,
  ChannelResponse,
  ChannelsRequest,
  ChannelsResponse,
  PublishRequest,
  PublishResponse,
  MessageRequest,
  MessageResponse,
  UserData,
  ChannelData,
  PublicationData,
  DirectMessageData,
  ServerData,
} from "./types";

class ChatServer {
  private socket: zmq.Reply;
  private pubSocket: zmq.Publisher;
  private users: UserData[] = [];
  private channels: ChannelData[] = [];
  private publications: PublicationData[] = [];
  private messages: DirectMessageData[] = [];
  private dataFile: string;
  private port: number;
  private pubsubHost: string;
  private pubsubPort: number;

  constructor(
    port: number = 9000,
    pubsubHost: string = "pubsub-proxy",
    pubsubPort: number = 5557
  ) {
    this.port = port;
    this.pubsubHost = pubsubHost;
    this.pubsubPort = pubsubPort;
    this.socket = new zmq.Reply();
    this.pubSocket = new zmq.Publisher();
    this.dataFile = path.join(__dirname, "..", "data", "server_data.json");
  }

  async start(): Promise<void> {
    // Criar diretório de dados se não existir
    const dataDir = path.dirname(this.dataFile);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Carregar dados persistidos
    this.loadData();

    // Conectar ao proxy PubSub
    const pubsubAddress = `tcp://${this.pubsubHost}:${this.pubsubPort}`;
    await this.pubSocket.connect(pubsubAddress);
    console.log(`Connected to PubSub proxy at ${pubsubAddress}`);

    // Bind do socket Request-Reply
    await this.socket.bind(`tcp://*:${this.port}`);
    console.log(`Chat Server listening on port ${this.port}...`);
    console.log(
      `Loaded ${this.users.length} users, ${this.channels.length} channels, ${this.publications.length} publications, ${this.messages.length} messages`
    );
    console.log("Press Ctrl+C to stop");

    // Loop principal para receber mensagens
    await this.messageLoop();
  }

  private async messageLoop(): Promise<void> {
    for await (const [msg] of this.socket) {
      try {
        const message = msg.toString();
        const response = await this.processMessage(message);
        await this.socket.send(response);
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        console.error("Error processing message:", errorMsg);
        const errorResponse = this.createErrorResponse(
          "server_error",
          errorMsg
        );
        await this.socket.send(errorResponse);
      }
    }
  }

  private async processMessage(message: string): Promise<string> {
    try {
      const request: BaseRequest = JSON.parse(message);
      const { service, data } = request;

      console.log(`Received request: ${service}`);

      switch (service) {
        case "login":
          return this.handleLogin(data);
        case "users":
          return this.handleListUsers(data);
        case "channel":
          return this.handleCreateChannel(data);
        case "channels":
          return this.handleListChannels(data);
        case "publish":
          return await this.handlePublish(data);
        case "message":
          return await this.handleMessage(data);
        default:
          return this.createErrorResponse(
            service,
            `Unknown service: ${service}`
          );
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      return this.createErrorResponse(
        "parse_error",
        `Invalid JSON: ${errorMsg}`
      );
    }
  }

  private handleLogin(data: LoginRequest["data"]): string {
    const { user, timestamp } = data;

    if (!user || user.trim() === "") {
      return this.createErrorResponse("login", "Username is required");
    }

    // Verificar se usuário já existe
    const existingUser = this.users.find((u) => u.user === user);

    if (existingUser) {
      // Atualizar timestamp do login
      existingUser.last_login = timestamp;
      console.log(`User ${user} logged in again`);
    } else {
      // Adicionar novo usuário
      this.users.push({
        user,
        created_at: timestamp,
        last_login: timestamp,
      });
      console.log(`New user registered: ${user}`);
    }

    this.saveData();

    const response: LoginResponse = {
      service: "login",
      data: {
        status: "sucesso",
        timestamp: Date.now(),
      },
    };

    return JSON.stringify(response);
  }

  private handleListUsers(data: UsersRequest["data"]): string {
    const userList = this.users.map((u) => u.user);

    const response: UsersResponse = {
      service: "users",
      data: {
        timestamp: Date.now(),
        users: userList,
      },
    };

    console.log(`Returning ${userList.length} users`);
    return JSON.stringify(response);
  }

  private handleCreateChannel(data: ChannelRequest["data"]): string {
    const { channel, timestamp } = data;

    if (!channel || channel.trim() === "") {
      return this.createErrorResponse("channel", "Channel name is required");
    }

    // Verificar se canal já existe
    const existingChannel = this.channels.find((c) => c.channel === channel);

    if (existingChannel) {
      return this.createErrorResponse("channel", "Channel already exists");
    }

    // Criar novo canal
    this.channels.push({
      channel,
      created_at: timestamp,
    });

    this.saveData();

    console.log(`New channel created: ${channel}`);

    const response: ChannelResponse = {
      service: "channel",
      data: {
        status: "sucesso",
        timestamp: Date.now(),
      },
    };

    return JSON.stringify(response);
  }

  private handleListChannels(data: ChannelsRequest["data"]): string {
    const channelList = this.channels.map((c) => c.channel);

    const response: ChannelsResponse = {
      service: "channels",
      data: {
        timestamp: Date.now(),
        channels: channelList,
      },
    };

    console.log(`Returning ${channelList.length} channels`);
    return JSON.stringify(response);
  }

  private async handlePublish(data: PublishRequest["data"]): Promise<string> {
    const { user, channel, message, timestamp } = data;

    // Verificar se o canal existe
    const existingChannel = this.channels.find((c) => c.channel === channel);

    if (!existingChannel) {
      const response: PublishResponse = {
        service: "publish",
        data: {
          status: "erro",
          message: `Channel '${channel}' does not exist`,
          timestamp: Date.now(),
        },
      };
      return JSON.stringify(response);
    }

    // Salvar publicação
    const publication: PublicationData = {
      user,
      channel,
      message,
      timestamp,
    };
    this.publications.push(publication);
    this.saveData();

    // Publicar no tópico do canal
    const topic = channel;
    const pubMessage = JSON.stringify({
      user,
      message,
      timestamp,
    });

    try {
      await this.pubSocket.send([topic, pubMessage]);
      console.log(`Published to channel '${channel}' by ${user}: ${message}`);

      const response: PublishResponse = {
        service: "publish",
        data: {
          status: "OK",
          timestamp: Date.now(),
        },
      };
      return JSON.stringify(response);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(`Error publishing to channel: ${errorMsg}`);

      const response: PublishResponse = {
        service: "publish",
        data: {
          status: "erro",
          message: `Failed to publish: ${errorMsg}`,
          timestamp: Date.now(),
        },
      };
      return JSON.stringify(response);
    }
  }

  private async handleMessage(data: MessageRequest["data"]): Promise<string> {
    const { src, dst, message, timestamp } = data;

    // Verificar se o usuário de destino existe
    const dstUser = this.users.find((u) => u.user === dst);

    if (!dstUser) {
      const response: MessageResponse = {
        service: "message",
        data: {
          status: "erro",
          message: `User '${dst}' does not exist`,
          timestamp: Date.now(),
        },
      };
      return JSON.stringify(response);
    }

    // Salvar mensagem
    const directMessage: DirectMessageData = {
      src,
      dst,
      message,
      timestamp,
    };
    this.messages.push(directMessage);
    this.saveData();

    // Publicar no tópico do usuário de destino
    const topic = dst;
    const pubMessage = JSON.stringify({
      src,
      message,
      timestamp,
    });

    try {
      await this.pubSocket.send([topic, pubMessage]);
      console.log(`Message sent from ${src} to ${dst}: ${message}`);

      const response: MessageResponse = {
        service: "message",
        data: {
          status: "OK",
          timestamp: Date.now(),
        },
      };
      return JSON.stringify(response);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(`Error sending message: ${errorMsg}`);

      const response: MessageResponse = {
        service: "message",
        data: {
          status: "erro",
          message: `Failed to send message: ${errorMsg}`,
          timestamp: Date.now(),
        },
      };
      return JSON.stringify(response);
    }
  }

  private createErrorResponse(service: string, description: string): string {
    const response: BaseResponse = {
      service,
      data: {
        status: "erro",
        timestamp: Date.now(),
        description,
      },
    };

    return JSON.stringify(response);
  }

  private loadData(): void {
    try {
      if (fs.existsSync(this.dataFile)) {
        const data = fs.readFileSync(this.dataFile, "utf-8");
        const serverData: ServerData = JSON.parse(data);
        this.users = serverData.users || [];
        this.channels = serverData.channels || [];
        this.publications = serverData.publications || [];
        this.messages = serverData.messages || [];
        console.log("Data loaded successfully");
      } else {
        console.log("No existing data file found. Starting with empty data.");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `Error loading data: ${errorMsg}. Starting with empty data.`
      );
      this.users = [];
      this.channels = [];
      this.publications = [];
      this.messages = [];
    }
  }

  private saveData(): void {
    try {
      const serverData: ServerData = {
        users: this.users,
        channels: this.channels,
        publications: this.publications,
        messages: this.messages,
        last_updated: Date.now(),
      };

      fs.writeFileSync(this.dataFile, JSON.stringify(serverData, null, 2));
      console.log(
        `Data saved: ${this.users.length} users, ${this.channels.length} channels, ${this.publications.length} publications, ${this.messages.length} messages`
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(`Error saving data: ${errorMsg}`);
    }
  }

  async stop(): Promise<void> {
    this.saveData();
    await this.socket.close();
    await this.pubSocket.close();
    console.log("Server stopped");
  }
}

// Executar servidor se este arquivo for chamado diretamente
if (require.main === module) {
  const port = parseInt(process.argv[2]) || 9000;
  const server = new ChatServer(port);

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\nShutting down server...");
    await server.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("\nShutting down server...");
    await server.stop();
    process.exit(0);
  });

  server.start().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export default ChatServer;
