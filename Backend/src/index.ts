import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { config, emailAccounts } from './config';
import { ElasticsearchService } from './services/elasticsearch.service';
import { AIService } from './services/ai.service';
import { NotificationService } from './services/notification.services';
import { EmailSyncService } from './services/emailSync.service';
import { VectorService } from './services/vector.service';
import { createEmailRoutes } from './routes/email.routes';

class OneboxServer {
  private app: express.Application;
  private elasticsearchService: ElasticsearchService;
  private aiService: AIService;
  private notificationService: NotificationService;
  private emailSyncService: EmailSyncService;
  private vectorService: VectorService;

  constructor() {
    this.app = express();
    this.elasticsearchService = new ElasticsearchService();
    this.aiService = new AIService();
    this.notificationService = new NotificationService();
    this.emailSyncService = new EmailSyncService(
      this.elasticsearchService,
      this.aiService,
      this.notificationService
    );
    this.vectorService = new VectorService();

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    const emailRoutes = createEmailRoutes(
      this.elasticsearchService,
      this.emailSyncService,
      this.vectorService,
      this.aiService
    );

    this.app.use('/api', emailRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        message: 'Onebox Email Backend API',
        version: '1.0.0',
        endpoints: {
          health: '/api/health',
          emails: '/api/emails',
          search: '/api/emails/search',
          stats: '/api/emails/stats/categories',
          productContext: '/api/context/product',
          outreachAgenda: '/api/context/agenda',
          suggestReply: '/api/emails/:id/suggest-reply'
        }
      });
    });
  }

  async initialize(): Promise<void> {
    console.log(' Starting Backend...');
    console.log('='.repeat(50));

    try {
      // Initialize Elasticsearch
      console.log('\n Initializing Elasticsearch...');
      await this.elasticsearchService.initialize();

      // Initialize Vector Database (optional - only if Pinecone is configured)
      if (config.pinecone.apiKey) {
        console.log('\n Initializing Vector Database...');
        await this.vectorService.initialize();
      } else {
        console.log('\n  Pinecone not configured - RAG features will be unavailable');
      }

      // Initialize email accounts
      console.log('\n📧 Initializing Email Accounts...');
      await this.emailSyncService.initializeAccounts(emailAccounts);

      console.log('\n' + '='.repeat(50));
      console.log(' Backend initialized successfully!');
      console.log('='.repeat(50));
    } catch (error) {
      console.error(' Failed to initialize server:', error);
      throw error;
    }
  }

  start(): void {
    this.app.listen(config.port, () => {
      console.log(`\n🌐 Server running on http://localhost:${config.port}`);
      console.log(`📚 API Documentation: http://localhost:${config.port}/`);
      console.log(`❤️  Health Check: http://localhost:${config.port}/api/health`);
      console.log('\n✨ Ready to accept requests!');
    });
  }

  async shutdown(): Promise<void> {
    console.log('\n🛑 Shutting down server...');
    await this.emailSyncService.shutdown();
    console.log('✅ Server shut down successfully');
    process.exit(0);
  }
}

// Main execution
const server = new OneboxServer();

server.initialize()
  .then(() => {
    server.start();
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', async () => {
  await server.shutdown();
});

process.on('SIGTERM', async () => {
  await server.shutdown();
});