import 'dotenv/config';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET!;
const KEY_BUFFER = createHash('sha256').update(ENCRYPTION_KEY).digest();

export function encrypt(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY_BUFFER, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(data: string): string {
  const [ivHex, tagHex, encHex] = data.split(':');
  if (!ivHex || !tagHex || !encHex) {
    console.warn('[decrypt] Value does not appear encrypted (legacy plaintext fallback)');
    return data;
  }
  const decipher = createDecipheriv('aes-256-gcm', KEY_BUFFER, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(encHex, 'hex'), undefined, 'utf8') + decipher.final('utf8');
}

export const config = {
  port: parseInt(process.env.PORT || '41935'),
  database: {
    url: process.env.DATABASE_URL!,
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  jwt: {
    secret: process.env.JWT_SECRET!,
  },
  gitea: {
    url: process.env.GITEA_URL!,
    adminToken: process.env.GITEA_ADMIN_TOKEN!,
  },
  docker: {
    socket: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
    sessionImage: process.env.SESSION_IMAGE || 'openbuild/session:latest',
    sessionTimeoutHours: parseInt(process.env.SESSION_TIMEOUT_HOURS || '4'),
  },
  sessions: {
    mode: (process.env.SESSION_MODE || 'docker') as 'docker' | 'process',
    dir: process.env.SESSIONS_DIR || '/var/sessions',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY!,
  },
};

export function giteaWebBase(): string {
  return (config.gitea.url || '').replace(/\/$/, '');
}
