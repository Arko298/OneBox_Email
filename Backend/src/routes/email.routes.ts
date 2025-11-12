import { Router, Request, Response } from 'express';
import { ElasticsearchService } from '../services/elasticsearch.service';
import  {EmailSyncService}  from '../services/emailSync.service';
import { VectorService } from '../services/vector.service';
import { AIService } from '../services/ai.service';
import { SearchQuery } from '../types';

export function createEmailRoutes(
  elasticsearchService: ElasticsearchService,
  emailSyncService: EmailSyncService,
  vectorService: VectorService,
  aiService: AIService
): Router {
  const router = Router();

  // Get all emails with search and filters
  router.get('/emails', async (req: Request, res: Response) => {
    try {
      const searchQuery: SearchQuery = {
        query: req.query.query as string,
        folder: req.query.folder as string,
        accountId: req.query.accountId as string,
        category: req.query.category as any,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        size: req.query.size ? parseInt(req.query.size as string) : 20
      };

      const result = await elasticsearchService.searchEmails(searchQuery);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get single email by ID
  router.get('/emails/:id', async (req: Request, res: Response) => {
    try {
      const email = await elasticsearchService.getEmailById(req.params.id);
      
      if (!email) {
        return res.status(404).json({
          success: false,
          error: 'Email not found'
        });
      }

      res.json({
        success: true,
        data: email
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Recategorize an email
  router.post('/emails/:id/recategorize', async (req: Request, res: Response) => {
    try {
      await emailSyncService.recategorizeEmail(req.params.id);
      const email = await elasticsearchService.getEmailById(req.params.id);

      res.json({
        success: true,
        message: 'Email recategorized successfully',
        data: email
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Search emails
  router.post('/emails/search', async (req: Request, res: Response) => {
    try {
      const searchQuery: SearchQuery = req.body;
      const result = await elasticsearchService.searchEmails(searchQuery);

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get email statistics
  router.get('/emails/stats/categories', async (req: Request, res: Response) => {
    try {
      const accountId = req.query.accountId as string;
      
      const categories = ['Interested', 'Meeting Booked', 'Not Interested', 'Spam', 'Out of Office', 'Uncategorized'];
      const stats: any = {};

      for (const category of categories) {
        const result = await elasticsearchService.searchEmails({
          category: category as any,
          accountId,
          page: 1,
          size: 0
        });
        stats[category] = result.total;
      }

      res.json({
        success: true,
        data: stats
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Store product context for RAG
  router.post('/context/product', async (req: Request, res: Response) => {
    try {
      const { id, text, metadata } = req.body;

      if (!id || !text) {
        return res.status(400).json({
          success: false,
          error: 'ID and text are required'
        });
      }

      await vectorService.storeProductContext(id, text, metadata);

      res.json({
        success: true,
        message: 'Product context stored successfully'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Store outreach agenda for RAG
  router.post('/context/agenda', async (req: Request, res: Response) => {
    try {
      const { id, text, metadata } = req.body;

      if (!id || !text) {
        return res.status(400).json({
          success: false,
          error: 'ID and text are required'
        });
      }

      await vectorService.storeOutreachAgenda(id, text, metadata);

      res.json({
        success: true,
        message: 'Outreach agenda stored successfully'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Generate suggested reply using RAG
  router.post('/emails/:id/suggest-reply', async (req: Request, res: Response) => {
    try {
      const email = await elasticsearchService.getEmailById(req.params.id);
      
      if (!email) {
        return res.status(404).json({
          success: false,
          error: 'Email not found'
        });
      }

      const suggestedReply = await vectorService.generateSuggestedReply(email);

      res.json({
        success: true,
        data: suggestedReply
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Health check
  router.get('/health', (req: Request, res: Response) => {
    res.json({
      success: true,
      message: 'Onebox Email Backend is running',
      timestamp: new Date().toISOString()
    });
  });

  return router;
}