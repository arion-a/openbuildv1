import { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { encrypt } from '../config/env.js';

const SUPPORTED_PROVIDERS = ['anthropic', 'openai', 'google', 'groq', 'mistral', 'deepseek', 'openrouter'] as const;

export async function settingsRoutes(app: FastifyInstance) {
  // Get user's OpenCode settings
  app.get('/', { preHandler: [(app as any).authenticate] }, async (request) => {
    const { id: userId } = (request as any).user;
    const res = await pool.query(
      `SELECT provider, model, claude_md, settings_json, mcp_servers, permissions, custom_instructions, updated_at
       FROM user_settings WHERE user_id = $1`,
      [userId]
    );
    if (!res.rows[0]) {
      return { provider: 'anthropic', model: 'claude-sonnet-4-6', claude_md: '', settings_json: {}, mcp_servers: [], permissions: {}, custom_instructions: '' };
    }
    return res.rows[0];
  });

  // Update OpenCode settings
  app.put('/', { preHandler: [(app as any).authenticate] }, async (request) => {
    const { id: userId } = (request as any).user;
    const { provider, api_key, model, claude_md, settings_json, mcp_servers, permissions, custom_instructions } = request.body as any;

    if (provider && !SUPPORTED_PROVIDERS.includes(provider)) {
      return { error: `Unsupported provider. Supported: ${SUPPORTED_PROVIDERS.join(', ')}` };
    }

    const res = await pool.query(
      `INSERT INTO user_settings (user_id, provider, api_key_encrypted, model, claude_md, settings_json, mcp_servers, permissions, custom_instructions, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         provider = COALESCE($2, user_settings.provider),
         api_key_encrypted = COALESCE($3, user_settings.api_key_encrypted),
         model = COALESCE($4, user_settings.model),
         claude_md = COALESCE($5, user_settings.claude_md),
         settings_json = COALESCE($6, user_settings.settings_json),
         mcp_servers = COALESCE($7, user_settings.mcp_servers),
         permissions = COALESCE($8, user_settings.permissions),
         custom_instructions = COALESCE($9, user_settings.custom_instructions),
         updated_at = NOW()
       RETURNING provider, model, claude_md, settings_json, mcp_servers, permissions, custom_instructions, updated_at`,
      [userId, provider, api_key ? encrypt(api_key) : null, model, claude_md, JSON.stringify(settings_json || {}), JSON.stringify(mcp_servers || []), JSON.stringify(permissions || {}), custom_instructions]
    );
    return res.rows[0];
  });

  // Check if API key is configured
  app.get('/status', { preHandler: [(app as any).authenticate] }, async (request) => {
    const { id: userId } = (request as any).user;
    const res = await pool.query(
      'SELECT api_key_encrypted IS NOT NULL as has_api_key, provider, model FROM user_settings WHERE user_id = $1',
      [userId]
    );
    if (!res.rows[0]) return { has_api_key: false, provider: null, model: null };
    return res.rows[0];
  });
}
