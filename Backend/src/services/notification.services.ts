import { IncomingWebhook } from '@slack/webhook';
import axios from 'axios';
import { config } from '../config';
import { Email, EmailCategory } from '../types';

export class NotificationService {
  private slackWebhook: IncomingWebhook;

  constructor() {
    this.slackWebhook = new IncomingWebhook(config.slack.webhookUrl);
  }

  async sendSlackNotification(email: Email): Promise<void> {
    if (!config.slack.webhookUrl) {
      console.warn('  Slack webhook URL not configured');
      return;
    }

    try {
      await this.slackWebhook.send({
        text: ' New Interested Email!',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: ' New Interested Email Received',
              emoji: true
            }
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*From:*\n${email.from}`
              },
              {
                type: 'mrkdwn',
                text: `*Subject:*\n${email.subject}`
              }
            ]
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Preview:*\n${email.body.substring(0, 200)}...`
            }
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: ` Email ID: ${email.id} |  ${email.date.toLocaleString()}`
              }
            ]
          }
        ]
      });

      console.log(`Slack notification sent for email: ${email.id}`);
    } catch (error) {
      console.error(' Error sending Slack notification:', error);
      throw error;
    }
  }

  async triggerWebhook(email: Email): Promise<void> {
    if (!config.webhook.url) {
      console.warn('  Webhook URL not configured');
      return;
    }

    const payload = {
      event: 'email.interested',
      timestamp: new Date().toISOString(),
      data: {
        emailId: email.id,
        from: email.from,
        to: email.to,
        subject: email.subject,
        category: email.category,
        date: email.date,
        preview: email.body.substring(0, 200)
      }
    };

    try {
      const response = await axios.post(config.webhook.url, payload, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log(` Webhook triggered for email: ${email.id}, Status: ${response.status}`);
    } catch (error) {
      console.error(' Error triggering webhook:', error);
      throw error;
    }
  }

  async handleInterestedEmail(email: Email): Promise<void> {
    console.log(` Handling Interested email: ${email.subject}`);
    
    try {
      // Send both notifications in parallel
      await Promise.all([
        this.sendSlackNotification(email),
        this.triggerWebhook(email)
      ]);
      
      console.log(` All notifications sent for Interested email: ${email.id}`);
    } catch (error) {
      console.error(' Error handling Interested email notifications:', error);
    }
  }
}