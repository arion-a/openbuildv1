import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/env.js';
import { pool } from '../db/pool.js';

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

export const llmService = {
  async summariseDiscussion(ideaId: string) {
    // Check cache
    const threadCountRes = await pool.query(
      'SELECT COUNT(*) as count FROM idea_threads WHERE idea_id = $1',
      [ideaId]
    );
    const currentThreadCount = parseInt(threadCountRes.rows[0].count);

    const cachedRes = await pool.query(
      `SELECT * FROM idea_summaries WHERE idea_id = $1
       ORDER BY generated_at DESC LIMIT 1`,
      [ideaId]
    );
    const cached = cachedRes.rows[0];
    if (cached && cached.thread_count_at_generation === currentThreadCount) {
      return { summary: cached.summary_text, generated_at: cached.generated_at, cached: true };
    }

    // Fetch idea + threads
    const ideaRes = await pool.query('SELECT * FROM ideas WHERE id = $1', [ideaId]);
    const idea = ideaRes.rows[0];
    if (!idea) throw new Error('Idea not found');

    const threadsRes = await pool.query(
      'SELECT t.body, u.username FROM idea_threads t JOIN users u ON t.author_id = u.id WHERE t.idea_id = $1 ORDER BY t.created_at',
      [ideaId]
    );

    const discussionText = threadsRes.rows
      .map((t) => `${t.username}: ${t.body}`)
      .join('\n\n');

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Summarise this discussion about "${idea.title}".

The original idea: ${idea.body || idea.title}

Discussion:
${discussionText}

Provide a concise summary with:
1. Key takeaways
2. Points of consensus
3. Open questions
4. Suggested next steps`,
        },
      ],
    });

    const summaryText =
      message.content[0].type === 'text' ? message.content[0].text : '';

    await pool.query(
      `INSERT INTO idea_summaries (idea_id, summary_text, thread_count_at_generation)
       VALUES ($1, $2, $3)`,
      [ideaId, summaryText, currentThreadCount]
    );

    return { summary: summaryText, generated_at: new Date(), cached: false };
  },
};
