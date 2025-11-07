import * as zmq from "zeromq";
import * as fs from "fs";
import * as path from "path";
import { encode, decode } from "@msgpack/msgpack";
import Database from "better-sqlite3";
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
  RankResponse,
  ListResponse,
  HeartbeatResponse,
  ClockRequest,
  ClockResponse,
  ElectionResponse,
  CoordinatorAnnouncement,
  ServerInfo,
  ReplicationRequest,
  ReplicationResponse,
  type ElectionRequest,
} from "./types";

class ChatServer {
  private socket: zmq.Reply;
  private pubSocket: zmq.Publisher;
  private subSocket: zmq.Subscriber;
  private reqSocket: zmq.Request;
  private serverRepSocket: zmq.Reply; // Socket para receber requisições de outros servidores
  private db: Database.Database;
  private dbPath: string;
  private brokerHost: string;
  private brokerPort: number;
  private pubsubHost: string;
  private pubsubPort: number;
  private referenceHost: string;
  private referencePort: number;
  private serverPort: number; // Porta para comunicação entre servidores

  private logicalClock: number = 0;
  private serverName: string;
  private serverRank: number = -1;
  private coordinator: string | null = null;
  private serverList: ServerInfo[] = [];
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private clockSyncInterval: NodeJS.Timeout | null = null;
  private electionInProgress: boolean = false;
  private timeOffset: number = 0; // Offset para sincronização Berkeley

  constructor(
    brokerHost: string = "req-rep-broker",
    brokerPort: number = 5556,
    pubsubHost: string = "pubsub-proxy",
    pubsubPort: number = 5557,
    referenceHost: string = "reference-server",
    referencePort: number = 5559
  ) {
    this.brokerHost = brokerHost;
    this.brokerPort = brokerPort;
    this.pubsubHost = pubsubHost;
    this.pubsubPort = pubsubPort;
    this.referenceHost = referenceHost;
    this.referencePort = referencePort;
    this.serverPort = 6000; // Porta base, será ajustada após receber rank

    this.socket = new zmq.Reply();
    this.pubSocket = new zmq.Publisher();
    this.subSocket = new zmq.Subscriber();
    this.reqSocket = new zmq.Request();
    this.serverRepSocket = new zmq.Reply();

    // Nome do servidor (hostname do container)
    this.serverName = process.env.HOSTNAME || `server-${Date.now()}`;

    this.dbPath = path.join(__dirname, "..", "data", "chat.db");

    // Criar diretório de dados se não existir
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Inicializar banco de dados
    this.db = new Database(this.dbPath);
    this.initDatabase();
  }

  // Relógio lógico de Lamport
  private incrementClock(receivedClock: number = 0): number {
    this.logicalClock = Math.max(this.logicalClock, receivedClock) + 1;
    return this.logicalClock;
  }

  // Obtém tempo sincronizado
  private getSyncedTime(): number {
    return Date.now() + this.timeOffset;
  }

  private initDatabase(): void {
    // Criar tabelas
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        user TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        last_login INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS channels (
        channel TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS publications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user TEXT NOT NULL,
        channel TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        src TEXT NOT NULL,
        dst TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_publications_channel ON publications(channel);
      CREATE INDEX IF NOT EXISTS idx_messages_dst ON messages(dst);
    `);

    const userCount = this.db
      .prepare("SELECT COUNT(*) as count FROM users")
      .get() as { count: number };
    const channelCount = this.db
      .prepare("SELECT COUNT(*) as count FROM channels")
      .get() as { count: number };
    const pubCount = this.db
      .prepare("SELECT COUNT(*) as count FROM publications")
      .get() as { count: number };
    const msgCount = this.db
      .prepare("SELECT COUNT(*) as count FROM messages")
      .get() as { count: number };

    console.log(`Database initialized at ${this.dbPath}`);
    console.log(`  Users: ${userCount.count}`);
    console.log(`  Channels: ${channelCount.count}`);
    console.log(`  Publications: ${pubCount.count}`);
    console.log(`  Messages: ${msgCount.count}`);
  }

  // Registrar servidor no reference-server
  private async registerWithReference(): Promise<void> {
    try {
      const refAddress = `tcp://${this.referenceHost}:${this.referencePort}`;
      console.log(`Connecting to reference server at ${refAddress}...`);
      await this.reqSocket.connect(refAddress);

      // Obter rank
      const clock = this.incrementClock();
      const rankRequest = {
        service: "rank",
        data: {
          user: this.serverName,
          timestamp: Date.now(),
          clock: clock,
        },
      };

      await this.reqSocket.send(encode(rankRequest));
      const [rankMsg] = await this.reqSocket.receive();
      const rankResponse = decode(rankMsg) as RankResponse;

      this.serverRank = rankResponse.data.rank;
      this.incrementClock(rankResponse.data.clock);

      console.log(`✓ Server registered with rank: ${this.serverRank}`);

      // Ajustar porta para comunicação entre servidores baseada no rank
      this.serverPort = 6000 + this.serverRank;

      // Iniciar socket para receber requisições de outros servidores
      await this.startServerSocket();

      // Obter lista de servidores
      await this.updateServerList();

      // Iniciar heartbeat periódico
      this.startHeartbeat();

      // Iniciar processo de eleição (algoritmo Bully - maior rank ganha)
      await this.startElection();

      // Iniciar sincronização de relógio
      this.startClockSync();
    } catch (error) {
      console.error("Error registering with reference server:", error);
      throw error;
    }
  }

  // Iniciar socket para receber requisições de outros servidores
  private async startServerSocket(): Promise<void> {
    try {
      await this.serverRepSocket.bind(`tcp://*:${this.serverPort}`);
      console.log(`✓ Server socket listening on port ${this.serverPort}`);

      // Processar requisições de outros servidores em background
      (async () => {
        for await (const [msg] of this.serverRepSocket) {
          try {
            const request = decode(msg) as BaseRequest;
            if (request.data && typeof request.data.clock === "number") {
              this.incrementClock(request.data.clock);
            }

            const response = await this.handleServerRequest(request);
            await this.serverRepSocket.send(encode(response));
          } catch (error) {
            console.error("Error handling server request:", error);
          }
        }
      })();
    } catch (error) {
      console.error("Error starting server socket:", error);
      throw error;
    }
  }

  // Processar requisições de outros servidores (election, clock)
  private async handleServerRequest(
    request: BaseRequest
  ): Promise<BaseResponse> {
    const { service } = request;
    const clock = this.incrementClock();

    switch (service) {
      case "election":
        // Responder com OK e iniciar própria eleição
        if (!this.electionInProgress) {
          console.log(`📨 Received election request, starting own election...`);
          setImmediate(() => this.startElection());
        }
        return {
          service: "election",
          data: {
            election: "OK",
            timestamp: this.getSyncedTime(),
            clock: clock,
          },
        };

      case "clock":
        // Responder com relógio atual (para sincronização Berkeley)
        return {
          service: "clock",
          data: {
            time: this.getSyncedTime(),
            timestamp: this.getSyncedTime(),
            clock: clock,
          },
        };

      default:
        return this.createErrorResponse(service, "Unknown service", clock);
    }
  }

  // Atualizar lista de servidores
  private async updateServerList(): Promise<void> {
    try {
      const clock = this.incrementClock();
      const listRequest = {
        service: "list",
        data: {
          timestamp: Date.now(),
          clock: clock,
        },
      };

      await this.reqSocket.send(encode(listRequest));
      const [listMsg] = await this.reqSocket.receive();
      const listResponse = decode(listMsg) as ListResponse;

      this.serverList = listResponse.data.list;
      this.incrementClock(listResponse.data.clock);

      console.log(
        `✓ Server list updated: ${this.serverList.length} server(s) active`
      );
    } catch (error) {
      console.error("Error updating server list:", error);
    }
  }

  // Enviar heartbeat periódico
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      try {
        const clock = this.incrementClock();
        const heartbeatRequest = {
          service: "heartbeat",
          data: {
            user: this.serverName,
            timestamp: Date.now(),
            clock: clock,
          },
        };

        await this.reqSocket.send(encode(heartbeatRequest));
        const [heartbeatMsg] = await this.reqSocket.receive();
        const heartbeatResponse = decode(heartbeatMsg) as HeartbeatResponse;
        this.incrementClock(heartbeatResponse.data.clock);
      } catch (error) {
        console.error("Error sending heartbeat:", error);
      }
    }, 10000); // A cada 10 segundos
  }

  // Sincronização de relógio (Berkeley)
  private startClockSync(): void {
    this.clockSyncInterval = setInterval(async () => {
      if (this.coordinator === this.serverName) {
        // Sou o coordenador - apenas respondo às requisições dos servidores
        // (tratadas em handleServerRequest)
        console.log(`[Coordinator] Ready to respond to clock requests...`);
      } else if (this.coordinator) {
        // Não sou coordenador - envio requisição clock ao coordenador
        await this.syncWithCoordinator();
      }
    }, 30000); // A cada 30 segundos
  }

  // Sincronizar com coordenador (Berkeley - servidores não-coordenadores)
  private async syncWithCoordinator(): Promise<void> {
    try {
      console.log(`[Berkeley] Requesting clock from coordinator...`);

      // Encontrar coordenador na lista
      const coordinatorServer = this.serverList.find(
        (s) => s.name === this.coordinator
      );

      if (!coordinatorServer) {
        console.log(`⚠️  Coordinator not found in server list`);
        await this.startElection();
        return;
      }

      // Enviar requisição clock ao coordenador
      const coordinatorTime = await this.requestCoordinatorClock(
        coordinatorServer
      );

      if (coordinatorTime === null) {
        // Coordenador não respondeu - iniciar eleição
        console.log(`⚠️  Coordinator did not respond. Starting election...`);
        await this.startElection();
        return;
      }

      // Calcular offset baseado no tempo do coordenador
      const myTime = Date.now(); // Tempo local antes do ajuste
      const offset = coordinatorTime - myTime;

      // Ajustar offset (pode ser positivo ou negativo)
      this.timeOffset += offset;

      console.log(
        `[Berkeley] Clock synchronized with coordinator. Offset: ${offset}ms, Total offset: ${this.timeOffset}ms`
      );
    } catch (error) {
      console.error("Error syncing with coordinator:", error);
      console.log("⚠️  Failed to sync with coordinator. Starting election...");
      await this.startElection();
    }
  }

  // Requisitar relógio do coordenador
  private async requestCoordinatorClock(
    coordinatorServer: ServerInfo
  ): Promise<number | null> {
    const socket = new zmq.Request();
    try {
      const coordinatorPort = 6000 + coordinatorServer.rank;
      const coordinatorAddress = `tcp://${coordinatorServer.name}:${coordinatorPort}`;

      socket.connect(coordinatorAddress);
      socket.receiveTimeout = 5000; // Timeout de 5 segundos

      const clock = this.incrementClock();
      const request = {
        service: "clock",
        data: {
          timestamp: Date.now(),
          clock: clock,
        },
      };

      await socket.send(encode(request));
      const [response] = await socket.receive();
      const clockResponse = decode(response) as ClockResponse;

      this.incrementClock(clockResponse.data.clock);
      return clockResponse.data.time;
    } catch (error) {
      return null;
    } finally {
      await socket.close();
    }
  }

  // Algoritmo Bully - Eleição por maior rank
  private async startElection(): Promise<void> {
    if (this.electionInProgress) {
      return; // Evitar múltiplas eleições simultâneas
    }

    try {
      this.electionInProgress = true;
      console.log(
        `🗳️  Starting Bully election (my rank: ${this.serverRank})...`
      );

      await this.updateServerList();

      // Encontrar servidores com rank MAIOR que o meu
      const higherRankServers = this.serverList.filter(
        (s) => s.rank > this.serverRank
      );

      if (higherRankServers.length === 0) {
        // Nenhum servidor com rank maior - EU sou o coordenador
        this.coordinator = this.serverName;
        console.log(`✓ Elected as coordinator (rank ${this.serverRank})`);
        await this.announceCoordinator();
        this.electionInProgress = false;
        return;
      }

      // Enviar mensagem election para todos os servidores com rank maior
      console.log(
        `📨 Sending election to ${higherRankServers.length} higher-rank server(s)...`
      );

      let receivedResponse = false;
      for (const server of higherRankServers) {
        try {
          const response = await this.sendElectionToServer(server);
          if (response) {
            receivedResponse = true;
            console.log(`✓ Server rank ${server.rank} responded to election`);
          }
        } catch (error) {
          console.log(`✗ Server rank ${server.rank} did not respond`);
        }
      }

      if (!receivedResponse) {
        // Nenhum servidor com rank maior respondeu - EU sou o coordenador
        this.coordinator = this.serverName;
        console.log(
          `✓ No higher-rank servers responded. Elected as coordinator (rank ${this.serverRank})`
        );
        await this.announceCoordinator();
      } else {
        // Algum servidor com rank maior respondeu - aguardar anúncio
        console.log(
          `Waiting for coordinator announcement from higher-rank server...`
        );
        this.coordinator = null;

        // Se não receber anúncio em 10 segundos, tentar eleição novamente
        setTimeout(() => {
          if (!this.coordinator) {
            console.log(
              "⚠️  No coordinator announcement received. Retrying election..."
            );
            this.electionInProgress = false;
            this.startElection();
          }
        }, 10000);
      }

      this.electionInProgress = false;
    } catch (error) {
      console.error("Error in election process:", error);
      this.electionInProgress = false;
    }
  }

  // Enviar requisição election para um servidor específico
  private async sendElectionToServer(server: ServerInfo): Promise<boolean> {
    const socket = new zmq.Request();
    try {
      const serverPort = 6000 + server.rank;
      const serverAddress = `tcp://${server.name}:${serverPort}`;

      socket.connect(serverAddress);
      socket.receiveTimeout = 3000; // Timeout de 3 segundos

      const clock = this.incrementClock();
      const request = {
        service: "election",
        data: {
          timestamp: Date.now(),
          clock: clock,
        },
      };

      await socket.send(encode(request));
      const [response] = await socket.receive();
      const electionResponse = decode(response) as ElectionResponse;

      this.incrementClock(electionResponse.data.clock);
      return electionResponse.data.election === "OK";
    } catch (error) {
      return false;
    } finally {
      await socket.close();
    }
  }

  // Anunciar coordenador no tópico "servers"
  private async announceCoordinator(): Promise<void> {
    try {
      const clock = this.incrementClock();
      const announcement: CoordinatorAnnouncement = {
        service: "election",
        data: {
          coordinator: this.serverName,
          timestamp: Date.now(),
          clock: clock,
        },
      };

      const topic = "servers";
      const message = encode(announcement.data);
      await this.pubSocket.send([topic, message]);
      console.log(`✓ Coordinator announcement sent to topic 'servers'`);
    } catch (error) {
      console.error("Error announcing coordinator:", error);
    }
  }

  // Processar mensagens dos tópicos "servers" e "replication"
  private async subscribeToServers(): Promise<void> {
    this.subSocket.subscribe("servers");
    this.subSocket.subscribe("replication");
    console.log(`✓ Subscribed to 'servers' and 'replication' topics`);

    // Processar em segundo plano
    (async () => {
      for await (const [topic, msg] of this.subSocket) {
        try {
          const topicStr = topic.toString();

          if (topicStr === "servers") {
            // Mensagem de coordenação
            const data = decode(msg) as CoordinatorAnnouncement["data"];
            this.incrementClock(data.clock);

            if (data.coordinator) {
              console.log(`✓ New coordinator announced: ${data.coordinator}`);
              this.coordinator = data.coordinator;
            }
          } else if (topicStr === "replication") {
            // Mensagem de replicação
            const data = decode(msg) as ReplicationRequest["data"];

            // Ignorar se a mensagem veio de mim mesmo
            if (data.source_server === this.serverName) {
              continue; // ✅ CONTINUE ao invés de RETURN
            }

            this.incrementClock(data.clock);
            console.log(
              `[Replication] Receiving ${data.operation} from ${data.source_server}`
            );

            // Processar replicação
            const { operation, payload } = data;
            try {
              switch (operation) {
                case "channel":
                  this.db
                    .prepare(
                      "INSERT OR IGNORE INTO channels (channel, created_at) VALUES (?, ?)"
                    )
                    .run(payload.channel, payload.timestamp);
                  break;

                case "publish":
                  this.db
                    .prepare(
                      "INSERT INTO publications (user, channel, message, timestamp) VALUES (?, ?, ?, ?)"
                    )
                    .run(
                      payload.user,
                      payload.channel,
                      payload.message,
                      payload.timestamp
                    );
                  break;

                case "message":
                  this.db
                    .prepare(
                      "INSERT INTO messages (src, dst, message, timestamp) VALUES (?, ?, ?, ?)"
                    )
                    .run(
                      payload.src,
                      payload.dst,
                      payload.message,
                      payload.timestamp
                    );
                  break;
              }
              console.log(
                `[Replication] ✓ ${operation} replicated successfully`
              );
            } catch (error) {
              console.error(
                `[Replication] Error processing ${operation}:`,
                error
              );
            }
          }
        } catch (error) {
          console.error("Error processing topic message:", error);
        }
      }
    })();
  }

  // Parte 5: Replicação de dados via PubSub
  private async replicateToServers(
    operation: "channel" | "publish" | "message",
    payload: any
  ): Promise<boolean> {
    try {
      const clock = this.incrementClock();
      const replicationData = {
        operation,
        payload,
        timestamp: Date.now(),
        clock,
        source_server: this.serverName,
      };

      console.log(`[Replication] Broadcasting ${operation} to other servers`);

      // Publicar no tópico "replication" via PubSub
      const topic = "replication";
      const message = encode(replicationData);
      await this.pubSocket.send([topic, message]);

      return true;
    } catch (error) {
      console.error("[Replication] Error in replicateToServers:", error);
      return false;
    }
  }

  async start(): Promise<void> {
    // Conectar ao proxy PubSub
    const pubsubPubAddress = `tcp://${this.pubsubHost}:5557`; // XSUB (publishers)
    const pubsubSubAddress = `tcp://${this.pubsubHost}:5558`; // XPUB (subscribers)

    await this.pubSocket.connect(pubsubPubAddress);
    console.log(`Connected to PubSub proxy (PUB) at ${pubsubPubAddress}`);

    await this.subSocket.connect(pubsubSubAddress);
    console.log(`Connected to PubSub proxy (SUB) at ${pubsubSubAddress}`);

    // Inscrever no tópico "servers"
    await this.subscribeToServers();

    // Aguardar um pouco para garantir que a conexão está estabelecida
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Registrar no servidor de referência
    await this.registerWithReference();

    // Conectar ao broker Request-Reply
    const brokerAddress = `tcp://${this.brokerHost}:${this.brokerPort}`;
    await this.socket.connect(brokerAddress);
    console.log(`Connected to Req-Rep broker at ${brokerAddress}`);
    console.log(`Server name: ${this.serverName}`);
    console.log(`Server rank: ${this.serverRank}`);
    console.log("Press Ctrl+C to stop");

    // Loop principal para receber mensagens
    await this.messageLoop();
  }

  private async messageLoop(): Promise<void> {
    for await (const [msg] of this.socket) {
      try {
        const request = decode(msg) as BaseRequest;

        // Atualizar relógio lógico ao receber mensagem
        if (request.data && typeof request.data.clock === "number") {
          this.incrementClock(request.data.clock);
        }

        const response = await this.processRequest(request);
        const encodedResponse = encode(response);
        await this.socket.send(encodedResponse);
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        console.error("Error processing message:", errorMsg);
        const clock = this.incrementClock();
        const errorResponse = this.createErrorResponse(
          "server_error",
          errorMsg,
          clock
        );
        const encodedResponse = encode(errorResponse);
        await this.socket.send(encodedResponse);
      }
    }
  }

  private async processRequest(request: BaseRequest): Promise<BaseResponse> {
    const { service, data } = request;

    console.log(
      `Received request: ${service} (clock: ${data.clock || "none"})`
    );

    switch (service) {
      case "login":
        return this.handleLogin(data);
      case "users":
        return this.handleListUsers(data);
      case "channel":
        return await this.handleCreateChannel(data);
      case "channels":
        return this.handleListChannels(data);
      case "publish":
        return await this.handlePublish(data);
      case "message":
        return await this.handleMessage(data);
      case "clock":
        return this.handleClockRequest(data);
      case "election":
        return this.handleElectionRequest(data);
      default:
        const clock = this.incrementClock();
        return this.createErrorResponse(
          service,
          `Unknown service: ${service}`,
          clock
        );
    }
  }

  private handleLogin(data: LoginRequest["data"]): LoginResponse {
    const { user, timestamp } = data;
    const clock = this.incrementClock();

    if (!user || user.trim() === "") {
      return this.createErrorResponse(
        "login",
        "Username is required",
        clock
      ) as LoginResponse;
    }

    // Verificar se usuário já existe
    const existingUser = this.db
      .prepare("SELECT * FROM users WHERE user = ?")
      .get(user) as UserData | undefined;

    if (existingUser) {
      // Atualizar timestamp do login
      this.db
        .prepare("UPDATE users SET last_login = ? WHERE user = ?")
        .run(timestamp, user);
      console.log(`User ${user} logged in again`);
    } else {
      // Adicionar novo usuário
      this.db
        .prepare(
          "INSERT INTO users (user, created_at, last_login) VALUES (?, ?, ?)"
        )
        .run(user, timestamp, timestamp);
      console.log(`New user registered: ${user}`);
    }

    const response: LoginResponse = {
      service: "login",
      data: {
        status: "sucesso",
        timestamp: this.getSyncedTime(),
        clock: clock,
      },
    };

    return response;
  }

  private handleListUsers(data: UsersRequest["data"]): UsersResponse {
    const clock = this.incrementClock();
    const users = this.db
      .prepare("SELECT user FROM users ORDER BY user")
      .all() as { user: string }[];
    const userList = users.map((u) => u.user);

    const response: UsersResponse = {
      service: "users",
      data: {
        timestamp: this.getSyncedTime(),
        clock: clock,
        users: userList,
      },
    };

    console.log(`Returning ${userList.length} users`);
    return response;
  }

  private async handleCreateChannel(
    data: ChannelRequest["data"]
  ): Promise<ChannelResponse> {
    const { channel, timestamp } = data;
    const clock = this.incrementClock();

    if (!channel || channel.trim() === "") {
      return this.createErrorResponse(
        "channel",
        "Channel name is required",
        clock
      ) as ChannelResponse;
    }

    // Verificar se canal já existe
    const existingChannel = this.db
      .prepare("SELECT * FROM channels WHERE channel = ?")
      .get(channel) as ChannelData | undefined;

    if (existingChannel) {
      return this.createErrorResponse(
        "channel",
        "Channel already exists",
        clock
      ) as ChannelResponse;
    }

    // Criar novo canal
    try {
      this.db
        .prepare("INSERT INTO channels (channel, created_at) VALUES (?, ?)")
        .run(channel, timestamp);
      console.log(`New channel created: ${channel}`);

      // Parte 5: Replicar para outros servidores
      await this.replicateToServers("channel", {
        channel,
        timestamp,
      });
    } catch (error) {
      return this.createErrorResponse(
        "channel",
        "Failed to create channel",
        clock
      ) as ChannelResponse;
    }

    const response: ChannelResponse = {
      service: "channel",
      data: {
        status: "sucesso",
        timestamp: this.getSyncedTime(),
        clock: clock,
      },
    };

    return response;
  }

  private handleListChannels(data: ChannelsRequest["data"]): ChannelsResponse {
    const clock = this.incrementClock();
    const channels = this.db
      .prepare("SELECT channel FROM channels ORDER BY channel")
      .all() as { channel: string }[];
    const channelList = channels.map((c) => c.channel);

    const response: ChannelsResponse = {
      service: "channels",
      data: {
        timestamp: this.getSyncedTime(),
        clock: clock,
        channels: channelList,
      },
    };

    console.log(`Returning ${channelList.length} channels`);
    return response;
  }

  private async handlePublish(
    data: PublishRequest["data"]
  ): Promise<PublishResponse> {
    const { user, channel, message, timestamp } = data;
    const clock = this.incrementClock();

    // Verificar se o canal existe
    const existingChannel = this.db
      .prepare("SELECT * FROM channels WHERE channel = ?")
      .get(channel) as ChannelData | undefined;

    if (!existingChannel) {
      const response: PublishResponse = {
        service: "publish",
        data: {
          status: "erro",
          message: `Channel '${channel}' does not exist`,
          timestamp: this.getSyncedTime(),
          clock: clock,
        },
      };
      return response;
    }

    // Salvar publicação
    this.db
      .prepare(
        "INSERT INTO publications (user, channel, message, timestamp) VALUES (?, ?, ?, ?)"
      )
      .run(user, channel, message, timestamp);

    // Parte 5: Replicar para outros servidores
    await this.replicateToServers("publish", {
      user,
      channel,
      message,
      timestamp,
    });

    // Publicar no tópico do canal
    const topic = channel;
    const pubData = {
      user,
      message,
      timestamp,
      clock,
    };
    const pubMessage = encode(pubData);

    try {
      // Enviar tópico e mensagem como multipart
      await this.pubSocket.send([topic, pubMessage]);
      console.log(`Published to channel '${channel}' by ${user}: ${message}`);

      const response: PublishResponse = {
        service: "publish",
        data: {
          status: "OK",
          timestamp: this.getSyncedTime(),
          clock: clock,
        },
      };
      return response;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(`Error publishing to channel: ${errorMsg}`);

      const response: PublishResponse = {
        service: "publish",
        data: {
          status: "erro",
          message: `Failed to publish: ${errorMsg}`,
          timestamp: this.getSyncedTime(),
          clock: clock,
        },
      };
      return response;
    }
  }

  private async handleMessage(
    data: MessageRequest["data"]
  ): Promise<MessageResponse> {
    const { src, dst, message, timestamp } = data;
    const clock = this.incrementClock();

    // Verificar se o usuário de destino existe
    const dstUser = this.db
      .prepare("SELECT * FROM users WHERE user = ?")
      .get(dst) as UserData | undefined;

    if (!dstUser) {
      const response: MessageResponse = {
        service: "message",
        data: {
          status: "erro",
          message: `User '${dst}' does not exist`,
          timestamp: this.getSyncedTime(),
          clock: clock,
        },
      };
      return response;
    }

    // Salvar mensagem
    this.db
      .prepare(
        "INSERT INTO messages (src, dst, message, timestamp) VALUES (?, ?, ?, ?)"
      )
      .run(src, dst, message, timestamp);

    // Parte 5: Replicar para outros servidores
    await this.replicateToServers("message", {
      src,
      dst,
      message,
      timestamp,
    });

    // Publicar no tópico do usuário de destino
    const topic = dst;
    const pubData = {
      src,
      message,
      timestamp,
      clock,
    };
    const pubMessage = encode(pubData);

    try {
      // Enviar tópico e mensagem como multipart
      await this.pubSocket.send([topic, pubMessage]);
      console.log(`Message sent from ${src} to ${dst}: ${message}`);

      const response: MessageResponse = {
        service: "message",
        data: {
          status: "OK",
          timestamp: this.getSyncedTime(),
          clock: clock,
        },
      };
      return response;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(`Error sending message: ${errorMsg}`);

      const response: MessageResponse = {
        service: "message",
        data: {
          status: "erro",
          message: `Failed to send message: ${errorMsg}`,
          timestamp: this.getSyncedTime(),
          clock: clock,
        },
      };
      return response;
    }
  }

  // Responder a requisição de relógio (para sincronização Berkeley)
  private handleClockRequest(data: ClockRequest["data"]): ClockResponse {
    const clock = this.incrementClock();
    const response: ClockResponse = {
      service: "clock",
      data: {
        time: this.getSyncedTime(),
        timestamp: this.getSyncedTime(),
        clock: clock,
      },
    };
    return response;
  }

  // Responder a requisição de eleição
  private handleElectionRequest(
    data: ElectionRequest["data"]
  ): ElectionResponse {
    const clock = this.incrementClock();
    const response: ElectionResponse = {
      service: "election",
      data: {
        election: "OK",
        timestamp: this.getSyncedTime(),
        clock: clock,
      },
    };
    return response;
  }

  private createErrorResponse(
    service: string,
    description: string,
    clock: number
  ): BaseResponse {
    const response: BaseResponse = {
      service,
      data: {
        status: "erro",
        timestamp: this.getSyncedTime(),
        clock: clock,
        description,
      },
    };

    return response;
  }

  async stop(): Promise<void> {
    // Parar intervalos
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.clockSyncInterval) {
      clearInterval(this.clockSyncInterval);
    }

    // Fechar conexões
    this.db.close();
    await this.socket.close();
    await this.pubSocket.close();
    await this.subSocket.close();
    await this.reqSocket.close();
    await this.serverRepSocket.close();
    console.log("Server stopped");
  }
}

// Executar servidor se este arquivo for chamado diretamente
if (require.main === module) {
  const server = new ChatServer();

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
