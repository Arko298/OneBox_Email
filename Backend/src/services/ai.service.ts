import OpenAI from 'openai';
import { config } from '../config';
import { Email, EmailCategory, AICategorizationResult } from '../types';

export class AIService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey
    });
  }

  async categorizeEmail(email: Email): Promise<AICategorizationResult> {
    const prompt = `
Analyze the following email and categorize it into one of these categories:
1. Interested - The sender shows interest in a product/service/proposal
2. Meeting Booked - The email is about scheduling or confirming a meeting
3. Not Interested - The sender explicitly declines or shows no interest
4. Spam - The email appears to be spam, promotional, or unsolicited
5. Out of Office - Automated out-of-office reply

Email Details:
From: ${email.from}
Subject: ${email.subject}
Body: ${email.body.substring(0, 1000)}

Respond in JSON format with:
{
  "category": "one of the categories above",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}
`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert email classifier. Analyze emails and categorize them accurately.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        category: this.mapToEmailCategory(result.category),
        confidence: result.confidence || 0.5,
        reasoning: result.reasoning || 'AI categorization'
      };
    } catch (error) {
      console.error(' Error categorizing email:', error);
      return {
        category: EmailCategory.UNCATEGORIZED,
        confidence: 0,
        reasoning: 'Error during categorization'
      };
    }
  }

  async batchCategorizeEmails(emails: Email[]): Promise<Map<string, AICategorizationResult>> {
    const results = new Map<string, AICategorizationResult>();
    
    // Process in batches of 5 to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(email => this.categorizeEmail(email))
      );
      
      batch.forEach((email, index) => {
        results.set(email.id, batchResults[index]);
      });

      // Small delay between batches
      if (i + batchSize < emails.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  private mapToEmailCategory(category: string): EmailCategory {
    const normalized = category.toLowerCase().trim();
    
    if (normalized.includes('interested') && !normalized.includes('not')) {
      return EmailCategory.INTERESTED;
    }
    if (normalized.includes('meeting') || normalized.includes('booked')) {
      return EmailCategory.MEETING_BOOKED;
    }
    if (normalized.includes('not interested') || normalized.includes('decline')) {
      return EmailCategory.NOT_INTERESTED;
    }
    if (normalized.includes('spam')) {
      return EmailCategory.SPAM;
    }
    if (normalized.includes('out of office') || normalized.includes('ooo')) {
      return EmailCategory.OUT_OF_OFFICE;
    }
    
    return EmailCategory.UNCATEGORIZED;
  }

  async generateSuggestedReply(
    email: Email,
    context: string[],
    productInfo?: string
  ): Promise<string> {
    const contextStr = context.join('\n');
    
    const prompt = `
You are an AI assistant helping to draft professional email replies.

Context about our product/service:
${productInfo || 'Not provided'}

Relevant previous context:
${contextStr}

Incoming email:
From: ${email.from}
Subject: ${email.subject}
Body: ${email.body}

Generate a professional, concise reply to this email. The reply should:
1. Address the sender's main points
2. Be friendly and professional
3. Include relevant information from the context
4. Be ready to send (no placeholders)

Reply:
`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a professional email assistant. Write clear, concise, and professional email replies.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      return response.choices[0].message.content || 'Unable to generate reply';
    } catch (error) {
      console.error(' Error generating reply:', error);
      throw error;
    }
  }
}