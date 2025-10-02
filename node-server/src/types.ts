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
  };
}

export interface LoginResponse {
  service: "login";
  data: {
    status: "sucesso" | "erro";
    timestamp: number;
    description?: string;
  };
}

// Users
export interface UsersRequest {
  service: "users";
  data: {
    timestamp: number;
  };
}

export interface UsersResponse {
  service: "users";
  data: {
    timestamp: number;
    users: string[];
  };
}

// Channel
export interface ChannelRequest {
  service: "channel";
  data: {
    channel: string;
    timestamp: number;
  };
}

export interface ChannelResponse {
  service: "channel";
  data: {
    status: "sucesso" | "erro";
    timestamp: number;
    description?: string;
  };
}

// Channels
export interface ChannelsRequest {
  service: "channels";
  data: {
    timestamp: number;
  };
}

export interface ChannelsResponse {
  service: "channels";
  data: {
    timestamp: number;
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
  };
}

export interface PublishResponse {
  service: "publish";
  data: {
    status: "OK" | "erro";
    message?: string;
    timestamp: number;
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
  };
}

export interface MessageResponse {
  service: "message";
  data: {
    status: "OK" | "erro";
    message?: string;
    timestamp: number;
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
