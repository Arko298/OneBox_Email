import dotenv from 'dotenv';
import { EmailAccount } from '../types';

dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  elasticsearch: {
    node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
    index: 'emails'
  },
  slack: {
    webhookUrl: process.env.SLACK_WEBHOOK_URL || ''
  },
  webhook: {
    url: process.env.WEBHOOK_URL || ''
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || ''
  },
  pinecone: {
    apiKey: process.env.PINECONE_API_KEY || '',
    environment: process.env.PINECONE_ENVIRONMENT || '',
    indexName: process.env.PINECONE_INDEX_NAME || 'email-replies'
  }
};

export const emailAccounts: EmailAccount[] = [
  {
    id: 'account-1',
    user: process.env.EMAIL1_USER || '',
    password: process.env.EMAIL1_PASSWORD || '',
    host: process.env.EMAIL1_HOST || 'imap.gmail.com',
    port: parseInt(process.env.EMAIL1_PORT || '993'),
    name: 'Account 1'
  },
  {
    id: 'account-2',
    user: process.env.EMAIL2_USER || '',
    password: process.env.EMAIL2_PASSWORD || '',
    host: process.env.EMAIL2_HOST || 'imap.gmail.com',
    port: parseInt(process.env.EMAIL2_PORT || '993'),
    name: 'Account 2'
  }
];