export interface TelegramUserLike {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface TelegramChatLike {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  is_forum?: boolean;
}

export interface TelegramMessageEntityLike {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: TelegramUserLike;
}

export interface TelegramPhotoSizeLike {
  file_id: string;
  file_unique_id?: string;
}

export interface TelegramFileLike {
  file_id: string;
  file_name?: string;
  mime_type?: string;
  file_unique_id?: string;
}

export interface TelegramMessageLike {
  message_id: number;
  date: number;
  edit_date?: number;
  text?: string;
  caption?: string;
  chat: TelegramChatLike;
  from?: TelegramUserLike;
  sender_chat?: TelegramChatLike;
  reply_to_message?: TelegramMessageLike;
  entities?: TelegramMessageEntityLike[];
  caption_entities?: TelegramMessageEntityLike[];
  photo?: TelegramPhotoSizeLike[];
  document?: TelegramFileLike;
  audio?: TelegramFileLike;
  video?: TelegramFileLike;
  animation?: TelegramFileLike;
  voice?: TelegramFileLike;
  video_note?: TelegramFileLike;
  sticker?: TelegramFileLike;
  contact?: {
    phone_number: string;
    first_name: string;
    last_name?: string;
    user_id?: number;
  };
  location?: {
    latitude: number;
    longitude: number;
  };
  venue?: {
    title: string;
    address: string;
  };
  poll?: {
    id: string;
    question: string;
  };
  media_group_id?: string;
  forward_origin?: unknown;
}

export interface Entity {
  id: string;
  username?: string;
  name?: string;
  language_code?: string;
  type: "bot" | "user" | "chat";
}

export type ConnectionState =
  | "idle"
  | "starting"
  | "connected"
  | "disconnected";

export interface Device {
  library: string;
  mode: "polling";
}

export interface Connection {
  profile: {
    env: string;
  };
  status: ConnectionState;
  device: Device;
  bot?: Entity;
}

export interface MessageFlags {
  outgoing: boolean;
  forwarded: boolean;
  edited: boolean;
}

export interface MessageRelationships {
  media: boolean;
  reply: boolean;
  reaction: boolean;
}

export interface ChatFlags {
  forum: boolean;
  verified: boolean;
}

export interface Chat {
  id: string;
  name?: string;
  username?: string;
  type: string;
  flags: ChatFlags;
  unreads: number;
  timestamp: Date;
}

export interface ChatParticipantFlags {
  admin: boolean;
  owner: boolean;
  anonymous: boolean;
  bot: boolean;
}

export interface ChatParticipant extends Entity {
  flags: ChatParticipantFlags;
}

export interface LookupResult {
  q: string;
  id?: string;
  username?: string;
  type?: string;
  found: boolean;
}

export interface MessageReference {
  chat_id: string;
  message_id: number;
}

export interface Message {
  id: string;
  message_id: number;
  body: string;
  type: string | null;
  chat: Chat;
  sender: Entity;
  timestamp: Date;
  flags: MessageFlags;
  relationships: MessageRelationships;
  attachments: string[];
  links: string[];
  mentions: string[];
  parent_id?: string;
}
