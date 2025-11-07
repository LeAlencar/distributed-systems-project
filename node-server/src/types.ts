// Types para as mensagens do protocolo

export interface BaseRequest {
  service: string;
  data: any;
}

export interface BaseResponse {
  service: string;
  data: any;
}

// Login
export interface LoginRequest {
  service: "login";
  data: {
    user: string;
    timestamp: number;
    clock: number;
  };
}

export interface LoginResponse {
  service: "login";
  data: {
    status: "sucesso" | "erro";
    timestamp: number;
    clock: number;
    description?: string;
  };
}

// Users
export interface UsersRequest {
  service: "users";
  data: {
    timestamp: number;
    clock: number;
  };
}

export interface UsersResponse {
  service: "users";
  data: {
    timestamp: number;
    clock: number;
    users: string[];
  };
}

// Channel
export interface ChannelRequest {
  service: "channel";
  data: {
    channel: string;
    timestamp: number;
    clock: number;
  };
}

export interface ChannelResponse {
  service: "channel";
  data: {
    status: "sucesso" | "erro";
    timestamp: number;
    clock: number;
    description?: string;
  };
}

// Channels
export interface ChannelsRequest {
  service: "channels";
  data: {
    timestamp: number;
    clock: number;
  };
}

export interface ChannelsResponse {
  service: "channels";
  data: {
    timestamp: number;
    clock: number;
    channels: string[];
  };
}

// Publish (Parte 2)
export interface PublishRequest {
  service: "publish";
  data: {
    user: string;
    channel: string;
    message: string;
    timestamp: number;
    clock: number;
  };
}

export interface PublishResponse {
  service: "publish";
  data: {
    status: "OK" | "erro";
    message?: string;
    timestamp: number;
    clock: number;
  };
}

// Message (Parte 2)
export interface MessageRequest {
  service: "message";
  data: {
    src: string;
    dst: string;
    message: string;
    timestamp: number;
    clock: number;
  };
}

export interface MessageResponse {
  service: "message";
  data: {
    status: "OK" | "erro";
    message?: string;
    timestamp: number;
    clock: number;
  };
}

// Data persistence
export interface UserData {
  user: string;
  created_at: number;
  last_login: number;
}

export interface ChannelData {
  channel: string;
  created_at: number;
}

export interface PublicationData {
  user: string;
  channel: string;
  message: string;
  timestamp: number;
}

export interface DirectMessageData {
  src: string;
  dst: string;
  message: string;
  timestamp: number;
}

export interface ServerData {
  users: UserData[];
  channels: ChannelData[];
  publications: PublicationData[];
  messages: DirectMessageData[];
  last_updated: number;
}

// Parte 4: Novos serviços para sincronização

// Rank service
export interface RankRequest {
  service: "rank";
  data: {
    user: string;
    timestamp: number;
    clock: number;
  };
}

export interface RankResponse {
  service: "rank";
  data: {
    rank: number;
    timestamp: number;
    clock: number;
  };
}

// List service
export interface ServerInfo {
  name: string;
  rank: number;
}

export interface ListRequest {
  service: "list";
  data: {
    timestamp: number;
    clock: number;
  };
}

export interface ListResponse {
  service: "list";
  data: {
    list: ServerInfo[];
    timestamp: number;
    clock: number;
  };
}

// Heartbeat service
export interface HeartbeatRequest {
  service: "heartbeat";
  data: {
    user: string;
    timestamp: number;
    clock: number;
  };
}

export interface HeartbeatResponse {
  service: "heartbeat";
  data: {
    timestamp: number;
    clock: number;
  };
}

// Clock service (Berkeley Algorithm)
export interface ClockRequest {
  service: "clock";
  data: {
    timestamp: number;
    clock: number;
  };
}

export interface ClockResponse {
  service: "clock";
  data: {
    time: number;
    timestamp: number;
    clock: number;
  };
}

// Election service
export interface ElectionRequest {
  service: "election";
  data: {
    timestamp: number;
    clock: number;
  };
}

export interface ElectionResponse {
  service: "election";
  data: {
    election: "OK";
    timestamp: number;
    clock: number;
  };
}

// Coordinator announcement (PubSub on "servers" topic)
export interface CoordinatorAnnouncement {
  service: "election";
  data: {
    coordinator: string;
    timestamp: number;
    clock: number;
  };
}

// Replication service (Parte 5)
export interface ReplicationRequest {
  service: "replicate";
  data: {
    operation: "channel" | "publish" | "message";
    payload: any;
    timestamp: number;
    clock: number;
    source_server: string;
  };
}

export interface ReplicationResponse {
  service: "replicate";
  data: {
    status: "OK" | "erro";
    timestamp: number;
    clock: number;
  };
}
