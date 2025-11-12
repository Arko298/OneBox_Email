import { Client } from '@elastic/elasticsearch';
import { config } from '../config';
import { Email, SearchQuery, SearchResult } from '../types';

export class ElasticsearchService {
  private client: Client;
  private index: string;

  constructor() {
    this.client = new Client({ node: config.elasticsearch.node });
    this.index = config.elasticsearch.index;
  }

  async initialize(): Promise<void> {
    try {
      const exists = await this.client.indices.exists({ index: this.index });
      
      if (!exists) {
        await this.client.indices.create({
          index: this.index,
          body: {
            mapping: {
              properties: {
                id: { type: 'keyword' },
                accountId: { type: 'keyword' },
                messageId: { type: 'keyword' },
                from: { type: 'text' },
                to: { type: 'text' },
                cc: { type: 'text' },
                subject: { type: 'text' },
                body: { type: 'text' },
                html: { type: 'text', index: false },
                date: { type: 'date' },
                folder: { type: 'keyword' },
                uid: { type: 'integer' },
                category: { type: 'keyword' },
                isRead: { type: 'boolean' },
                timestamp: { type: 'date' }
              }
            }
          }
        });
        console.log(`✅ Elasticsearch index '${this.index}' created`);
      } else {
        console.log(`✅ Elasticsearch index '${this.index}' already exists`);
      }
    } catch (error) {
      console.error('❌ Error initializing Elasticsearch:', error);
      throw error;
    }
  }

  async indexEmail(email: Email): Promise<void> {
    try {
      await this.client.index({
        index: this.index,
        id: email.id,
        document: email,
        refresh: true
      });
      console.log(` Indexed email: ${email.subject}`);
    } catch (error) {
      console.error(' Error indexing email:', error);
      throw error;
    }
  }

  async bulkIndexEmails(emails: Email[]): Promise<void> {
    if (emails.length === 0) return;

    const operations = emails.flatMap(email => [
      { index: { _index: this.index, _id: email.id } },
      email
    ]);

    try {
      const result = await this.client.bulk({
        refresh: true,
        operations
      });

      if (result.errors) {
        console.error(' Bulk indexing had errors');
      } else {
        console.log(` Bulk indexed ${emails.length} emails`);
      }
    } catch (error) {
      console.error(' Error bulk indexing emails:', error);
      throw error;
    }
  }

  async searchEmails(searchQuery: SearchQuery): Promise<SearchResult> {
    const { query, folder, accountId, category, from, to, page = 1, size = 20 } = searchQuery;

    const must: any[] = [];
    const filter: any[] = [];

    if (query) {
      must.push({
        multi_match: {
          query,
          fields: ['subject^2', 'body', 'from', 'to']
        }
      });
    }

    if (folder) {
      filter.push({ term: { folder } });
    }

    if (accountId) {
      filter.push({ term: { accountId } });
    }

    if (category) {
      filter.push({ term: { category } });
    }

    if (from || to) {
      const range: any = {};
      if (from) range.gte = from;
      if (to) range.lte = to;
      filter.push({ range: { date: range } });
    }

    try {
      const result = await this.client.search({
        index: this.index,
        from: (page - 1) * size,
        size,
        query: {
          bool: {
            must: must.length > 0 ? must : [{ match_all: {} }],
            filter
          }
        },
        sort: [{ date: { order: 'desc' } }]
      });

      const emails = result.hits.hits.map(hit => hit._source as Email);
      const total = typeof result.hits.total === 'number' 
        ? result.hits.total 
        : result.hits.total?.value || 0;

      return {
        emails,
        total,
        page,
        size
      };
    } catch (error) {
      console.error(' Error searching emails:', error);
      throw error;
    }
  }

  async updateEmailCategory(emailId: string, category: string): Promise<void> {
    try {
      await this.client.update({
        index: this.index,
        id: emailId,
        doc: { category },
        refresh: true
      });
      console.log(` Updated email ${emailId} category to ${category}`);
    } catch (error) {
      console.error(' Error updating email category:', error);
      throw error;
    }
  }

  async getEmailById(emailId: string): Promise<Email | null> {
    try {
      const result = await this.client.get({
        index: this.index,
        id: emailId
      });
      return result._source as Email;
    } catch (error) {
      console.error(' Error getting email by ID:', error);
      return null;
    }
  }
}