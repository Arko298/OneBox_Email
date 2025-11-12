import { ImapFlow } from 'imapflow';
import { simpleParser, ParsedMail } from 'mailparser';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { EmailAccount, Email } from '../types';

export class ImapService extends EventEmitter {
  private imap: ImapFlow;
  private account: EmailAccount;
  private isConnected: boolean = false;
  private pollIntervalId?: NodeJS.Timeout;
  private lastExists: number = 0;

  constructor(account: EmailAccount) {
    super();
    this.account = account;

    this.imap = new ImapFlow({
      host: account.host,
      port: account.port,
      secure: true,
      auth: {
        user: account.user,
        pass: account.password
      },
      tls: { rejectUnauthorized: false }
    });

    this.imap.on('error', (err) => {
      console.error(` IMAP error for ${this.account.user}:`, err);
      this.emit('error', err);
    });

    this.imap.on('close', () => {
      console.log(` IMAP connection closed: ${this.account.user}`);
      this.isConnected = false;
      this.emit('end');
      // Attempt to reconnect after 5 seconds
      setTimeout(() => this.reconnect(), 5000);
    });
  }

  async connect(): Promise<void> {
    await this.imap.connect();
    this.isConnected = true;
    console.log(` IMAP connected: ${this.account.user}`);
    this.emit('ready');
    
    // Initialize lastExists
    const mailbox = await this.imap.mailboxOpen('INBOX');
    this.lastExists = mailbox.exists || 0;
    
    // Start polling for new mail
    this.startPollingForNewMail();
  }

  private async reconnect(): Promise<void> {
    if (this.isConnected) return;
    
    try {
      console.log(` Attempting to reconnect: ${this.account.user}`);
      await this.connect();
    } catch (error) {
      console.error(` Reconnection failed for ${this.account.user}:`, error);
      setTimeout(() => this.reconnect(), 5000);
    }
  }

  async openInbox(): Promise<void> {
    // Open INBOX - already done in connect(), but keep for compatibility
    await this.imap.mailboxOpen('INBOX');
    console.log(` Opened INBOX for ${this.account.user}`);
  }

  private async getMailboxLock(): Promise<any> {
    // Use imapflow's getMailboxLock to safely read messages
    return await this.imap.getMailboxLock('INBOX');
  }

  async fetchLast30Days(): Promise<Email[]> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const emails: Email[] = [];
    const lock = await this.getMailboxLock();
    
    try {
      // Search by SINCE date
      const uids = await this.imap.search({ since: thirtyDaysAgo });
      
      if (!uids || uids.length === 0) {
        console.log(` No emails found in last 30 days for ${this.account.user}`);
        return [];
      }

      console.log(` Found ${uids.length} emails in last 30 days for ${this.account.user}`);

      // Fetch messages
      for await (const message of this.imap.fetch(uids, { envelope: true, source: true })) {
        try {
          // message.source is a Buffer with full RFC822 message
          if (!message.source) {
            console.warn(' Message source is undefined, skipping');
            continue;
          }
          const parsed = simpleParser(message.source);
          const uid = message.uid || 0;
          emails.push(this.convertToEmail(await parsed, uid));
        } catch (parseError) {
          console.error(' Error parsing email:', parseError);
        }
      }

      console.log(` Fetched ${emails.length} emails for ${this.account.user}`);
      return emails;
    } finally {
      lock.release();
    }
  }

  async fetchRecentEmails(count: number): Promise<Email[]> {
    const emails: Email[] = [];
    const lock = await this.getMailboxLock();
    
    try {
      // Get all UIDs
      const uids = await this.imap.search({ all: true });
      
      if (!uids || uids.length === 0) {
        return [];
      }

      // Get the most recent ones
      const recentUids = uids.slice(-count);

      // Fetch messages
      for await (const message of this.imap.fetch(recentUids, { envelope: true, source: true })) {
        try {
          if (!message.source) {
            console.warn(' Message source is undefined, skipping');
            continue;
          }  
          const parsed = simpleParser(message.source);
          const uid = message.uid || 0;
          emails.push(this.convertToEmail(await parsed, uid));
        } catch (parseError) {
          console.error(' Error parsing email:', parseError);
        }
      }

      return emails;
    } finally {
      lock.release();
    }
  }

  async fetchNewEmails(): Promise<void> {
    try {
      const emails = await this.fetchRecentEmails(10);
      emails.forEach(email => this.emit('newEmail', email));
    } catch (error) {
      console.error(' Error fetching new emails:', error);
    }
  }

  private startPollingForNewMail(intervalMs = 15000): void {
    if (this.pollIntervalId) return;
    
    this.pollIntervalId = setInterval(async () => {
      if (!this.isConnected) return;
      
      try {
        const box = await this.imap.mailboxOpen('INBOX');
        const exists = box.exists || 0;
        
        if (exists > this.lastExists) {
          const newCount = exists - this.lastExists;
          this.lastExists = exists;
          console.log(` Detected ${newCount} new messages for ${this.account.user}`);
          
          // Fetch the new emails
          const recent = await this.fetchRecentEmails(newCount);
          recent.forEach(email => this.emit('newEmail', email));
        } else {
          // Update lastExists in case emails were deleted
          this.lastExists = exists;
        }
      } catch (err) {
        console.error(' Error polling for new mail:', err);
      }
    }, intervalMs);
  }

  startIdleMode(): void {
    // ImapFlow uses polling instead of IDLE mode
    // Already started in connect(), but this method is kept for compatibility
    console.log(`Polling mode active for ${this.account.user}`);
  }

  async disconnect(): Promise<void> {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = undefined;
    }
    
    if (this.isConnected) {
      try {
        await this.imap.logout();
        this.isConnected = false;
        console.log(` Disconnected: ${this.account.user}`);
      } catch (error) {
        console.error(` Error disconnecting ${this.account.user}:`, error);
      }
    }
  }

  private convertToEmail(parsed: ParsedMail, uid: number): Email {
    const extractAddresses = (addrObj?: any): string[] => {
      if (!addrObj) return [];
      const list = Array.isArray(addrObj) ? addrObj : [addrObj];
      const out: string[] = [];
      for (const a of list) {
        if (a.text) {
          out.push(a.text);
          continue;
        }
        if (a.value && Array.isArray(a.value)) {
          for (const v of a.value) {
            if (v.name && v.address) {
              out.push(`${v.name} <${v.address}>`);
            } else if (v.address) {
              out.push(v.address);
            } else if (v.name) {
              out.push(v.name);
            }
          }
        }
      }
      return out;
    };

    return {
      id: uuidv4(),
      accountId: this.account.id,
      messageId: parsed.messageId || uuidv4(),
      from: parsed.from?.text || '',
      to: extractAddresses(parsed.to),
      cc: extractAddresses(parsed.cc),
      subject: parsed.subject || '(No Subject)',
      body: parsed.text || '',
      html: parsed.html ? parsed.html.toString() : undefined, // FIXED: Convert to string
      date: parsed.date || new Date(),
      folder: 'INBOX',
      uid,
      isRead: false,
      attachments: (parsed.attachments || []).map((att: any) => ({
        filename: att.filename || 'unknown',
        contentType: att.contentType,
        size: att.size
      })),
      timestamp: new Date()
    };
  }
}