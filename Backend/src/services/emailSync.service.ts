import { EmailAccount, Email, EmailCategory } from '../types';
import { ImapService } from './imap.services';
import { ElasticsearchService } from './elasticsearch.service';
import { AIService } from './ai.service';
import { NotificationService } from './notification.services';

export class EmailSyncService {
  private imapServices: Map<string, ImapService> = new Map();
  private elasticsearchService: ElasticsearchService;
  private aiService: AIService;
  private notificationService: NotificationService;

  constructor(
    elasticsearchService: ElasticsearchService,
    aiService: AIService,
    notificationService: NotificationService
  ) {
    this.elasticsearchService = elasticsearchService;
    this.aiService = aiService;
    this.notificationService = notificationService;
  }

  async initializeAccounts(accounts: EmailAccount[]): Promise<void> {
    console.log(`Initializing ${accounts.length} email accounts...`);

    for (const account of accounts) {
      try {
        await this.initializeAccount(account);
      } catch (error) {
        console.error(` Failed to initialize account ${account.user}:`, error);
      }
    }

    console.log(` Email accounts initialized`);
  }

  private async initializeAccount(account: EmailAccount): Promise<void> {
    const imapService = new ImapService(account);
    
    // Setup event handlers
    imapService.on('newEmail', async (email: Email) => {
      await this.handleNewEmail(email);
    });

    imapService.on('error', (error) => {
      console.error(` IMAP error for ${account.user}:`, error);
    });

    imapService.on('end', () => {
      console.log(` IMAP connection ended for ${account.user}`);
    });

    // Connect to IMAP
    await imapService.connect();
  // imapflow connect already opens mailbox and polling is started in connect()

    // Fetch last 30 days of emails
    console.log(` Fetching last 30 days of emails for ${account.user}...`);
    const emails = await imapService.fetchLast30Days();
    
    if (emails.length > 0) {
      console.log(` Categorizing ${emails.length} emails for ${account.user}...`);
      await this.categorizeAndIndexEmails(emails);
    }

  // Real-time updates handled by ImapService polling after connect()

    this.imapServices.set(account.id, imapService);
    console.log(` Account ${account.user} initialized and syncing`);
  }

  private async categorizeAndIndexEmails(emails: Email[]): Promise<void> {
    // Categorize emails in batches
    const categorizations = await this.aiService.batchCategorizeEmails(emails);

    // Update emails with categories
    emails.forEach(email => {
      const result = categorizations.get(email.id);
      if (result) {
        email.category = result.category;
      }
    });

    // Index in Elasticsearch
    await this.elasticsearchService.bulkIndexEmails(emails);

    // Handle interested emails
    const interestedEmails = emails.filter(
      email => email.category === EmailCategory.INTERESTED
    );

    for (const email of interestedEmails) {
      await this.notificationService.handleInterestedEmail(email);
    }
  }

  private async handleNewEmail(email: Email): Promise<void> {
    console.log(` New email received: ${email.subject}`);

    try {
      // Categorize the email
      const categorization = await this.aiService.categorizeEmail(email);
      email.category = categorization.category;

      console.log(`  Email categorized as: ${categorization.category}`);

      // Index in Elasticsearch
      await this.elasticsearchService.indexEmail(email);

      // If interested, trigger notifications
      if (email.category === EmailCategory.INTERESTED) {
        await this.notificationService.handleInterestedEmail(email);
      }
    } catch (error) {
      console.error(' Error handling new email:', error);
    }
  }

  async recategorizeEmail(emailId: string): Promise<void> {
    const email = await this.elasticsearchService.getEmailById(emailId);
    if (!email) {
      throw new Error('Email not found');
    }

    const categorization = await this.aiService.categorizeEmail(email);
    await this.elasticsearchService.updateEmailCategory(emailId, categorization.category);

    console.log(` Email ${emailId} recategorized to ${categorization.category}`);
  }

  getImapService(accountId: string): ImapService | undefined {
    return this.imapServices.get(accountId);
  }

  async shutdown(): Promise<void> {
    console.log(' Shutting down email sync services...');
    
    for (const [accountId, imapService] of this.imapServices.entries()) {
      imapService.disconnect();
      console.log(` Disconnected account: ${accountId}`);
    }

    this.imapServices.clear();
    console.log(' Email sync services shut down');
  }
}