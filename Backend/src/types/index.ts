export interface EmailAccount {
  id: string;
  user: string;
  password: string;
  host: string;
  port: number;
  name: string;
}

export interface Email {
  id: string;
  accountId: string;
  messageId: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  html?: string;
  date: Date;
  folder: string;
  uid: number;
  category?: EmailCategory;
  isRead: boolean;
  attachments: EmailAttachment[];
  timestamp: Date;
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
}

export enum EmailCategory {
  INTERESTED = 'Interested',
  MEETING_BOOKED = 'Meeting Booked',
  NOT_INTERESTED = 'Not Interested',
  SPAM = 'Spam',
  OUT_OF_OFFICE = 'Out of Office',
  UNCATEGORIZED = 'Uncategorized'
}

export interface SearchQuery {
  query?: string;
  folder?: string;
  accountId?: string;
  category?: EmailCategory;
  from?: Date;
  to?: Date;
  page?: number;
  size?: number;
}

export interface SearchResult {
  emails: Email[];
  total: number;
  page: number;
  size: number;
}

export interface AICategorizationResult {
  category: EmailCategory;
  confidence: number;
  reasoning: string;
}

export interface SuggestedReply {
  reply: string;
  confidence: number;
  context: string[];
}