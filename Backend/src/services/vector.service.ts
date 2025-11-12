import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { config } from '../config';
import { Email, SuggestedReply } from '../types';

export class VectorService {
  private pinecone: Pinecone;
  private openai: OpenAI;
  private indexName: string;

  constructor() {
    this.pinecone = new Pinecone({
      apiKey: config.pinecone.apiKey
    });
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey
    });
    this.indexName = config.pinecone.indexName;
  }

  async initialize(): Promise<void> {
    try {
      const indexes = await this.pinecone.listIndexes();
      const indexExists = indexes.indexes?.some(idx => idx.name === this.indexName);

      if (!indexExists) {
        console.log(`Creating Pinecone index: ${this.indexName}`);
        await this.pinecone.createIndex({
          name: this.indexName,
          dimension: 1536, // OpenAI embedding dimension
          metric: 'cosine',
          spec: {
            serverless: {
              cloud: 'aws',
              region: 'us-east-1'
            }
          }
        });
        console.log(` Pinecone index created: ${this.indexName}`);
      } else {
        console.log(` Pinecone index exists: ${this.indexName}`);
      }
    } catch (error) {
      console.error(' Error initializing Pinecone:', error);
    }
  }

  async storeProductContext(contextId: string, text: string, metadata: any = {}): Promise<void> {
    try {
      const embedding = await this.createEmbedding(text);
      const index = this.pinecone.Index(this.indexName);

      await index.upsert([
        {
          id: contextId,
          values: embedding,
          metadata: {
            text,
            type: 'product_context',
            ...metadata
          }
        }
      ]);

      console.log(`Stored product context: ${contextId}`);
    } catch (error) {
      console.error(' Error storing product context:', error);
      throw error;
    }
  }

  async storeOutreachAgenda(agendaId: string, text: string, metadata: any = {}): Promise<void> {
    try {
      const embedding = await this.createEmbedding(text);
      const index = this.pinecone.Index(this.indexName);

      await index.upsert([
        {
          id: agendaId,
          values: embedding,
          metadata: {
            text,
            type: 'outreach_agenda',
            ...metadata
          }
        }
      ]);

      console.log(` Stored outreach agenda: ${agendaId}`);
    } catch (error) {
      console.error(' Error storing outreach agenda:', error);
      throw error;
    }
  }

  async queryRelevantContext(queryText: string, topK: number = 3): Promise<string[]> {
    try {
      const embedding = await this.createEmbedding(queryText);
      const index = this.pinecone.Index(this.indexName);

      const queryResponse = await index.query({
        vector: embedding,
        topK,
        includeMetadata: true
      });

      const contexts = queryResponse.matches
        .filter(match => match.score && match.score > 0.7)
        .map(match => match.metadata?.text as string)
        .filter(Boolean);

      return contexts;
    } catch (error) {
      console.error(' Error querying context:', error);
      return [];
    }
  }

  async generateSuggestedReply(email: Email): Promise<SuggestedReply> {
    try {
      // Query relevant context from vector DB
      const queryText = `${email.subject} ${email.body}`;
      const relevantContexts = await this.queryRelevantContext(queryText);

      if (relevantContexts.length === 0) {
        return {
          reply: 'No relevant context found. Please add product information and outreach agendas to the vector database.',
          confidence: 0,
          context: []
        };
      }

      // Generate reply using RAG
      const prompt = `
You are an AI assistant helping to draft professional email replies based on our product information and outreach strategy.

Relevant Context from our knowledge base:
${relevantContexts.map((ctx, i) => `${i + 1}. ${ctx}`).join('\n\n')}

Incoming Email:
From: ${email.from}
Subject: ${email.subject}
Body: ${email.body}

Based on the context above, generate a professional and helpful reply. The reply should:
1. Address the sender's inquiry or interest
2. Use information from the context appropriately
3. Include any relevant meeting links or next steps mentioned in the context
4. Be concise and professional
5. Be ready to send (no placeholders like [Your Name])

Generate only the email reply text, nothing else.
`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a professional email assistant that uses company knowledge to craft perfect replies.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      const reply = response.choices[0].message.content || 'Unable to generate reply';

      return {
        reply,
        confidence: relevantContexts.length > 0 ? 0.85 : 0.5,
        context: relevantContexts
      };
    } catch (error) {
      console.error(' Error generating suggested reply:', error);
      throw error;
    }
  }

  private async createEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error(' Error creating embedding:', error);
      throw error;
    }
  }
}