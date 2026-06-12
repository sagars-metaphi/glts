import fs from 'fs/promises';
import path from 'path';
import type { PrismaService } from '../../infrastructure/prisma/PrismaService.js';
import { paths } from '../../config/paths.js';
import { NotFoundError, ValidationError } from '../../common/exceptions/AppError.js';

export interface TemplateRecord {
  id: string;
  name?: string;
  body?: string;
  fields?: Record<string, unknown>;
  [key: string]: unknown;
}

export class TemplateRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templatesDir = paths.templates,
  ) {}

  private filePath(id: string) {
    return path.join(this.templatesDir, `${id}.json`);
  }

  async exists(id: string): Promise<boolean> {
    try {
      const row = await this.prisma.client.template.findUnique({ where: { id } });
      if (row) return true;
    } catch {
      // fall through
    }
    try {
      await fs.access(this.filePath(id));
      return true;
    } catch {
      return false;
    }
  }

  async findById(id: string): Promise<TemplateRecord> {
    try {
      const row = await this.prisma.client.template.findUnique({ where: { id } });
      if (row) {
        const content = (row.content as Record<string, unknown>) || {};
        return { id: row.id, name: row.name ?? undefined, body: row.body ?? undefined, ...content };
      }
    } catch {
      // fall through to filesystem
    }

    try {
      const raw = await fs.readFile(this.filePath(id), 'utf8');
      return JSON.parse(raw) as TemplateRecord;
    } catch {
      throw new NotFoundError(`Template "${id}" not found`);
    }
  }

  async create(id: string, data: Record<string, unknown>): Promise<TemplateRecord> {
    if (await this.exists(id)) {
      throw new ValidationError(`Template "${id}" already exists. Use PUT to update.`);
    }
    const normalized: TemplateRecord = { ...data, id };
    await this.writeTemplate(normalized);
    return normalized;
  }

  private async writeTemplate(normalized: TemplateRecord): Promise<void> {
    const id = normalized.id;
    await fs.mkdir(this.templatesDir, { recursive: true });
    await fs.writeFile(this.filePath(id), JSON.stringify(normalized, null, 2), 'utf8');

    try {
      await this.prisma.client.template.upsert({
        where: { id },
        create: {
          id,
          name: typeof normalized.name === 'string' ? normalized.name : null,
          body: typeof normalized.body === 'string' ? normalized.body : null,
          content: normalized as object,
        },
        update: {
          name: typeof normalized.name === 'string' ? normalized.name : null,
          body: typeof normalized.body === 'string' ? normalized.body : null,
          content: normalized as object,
        },
      });
    } catch {
      // filesystem remains source of truth when DB unavailable
    }
  }

  async update(id: string, patch: Record<string, unknown>): Promise<TemplateRecord> {
    const exists = await this.exists(id);
    if (!exists) {
      throw new NotFoundError(`Template "${id}" not found`);
    }

    const existing = await this.findById(id);
    const normalized: TemplateRecord = { ...existing, ...patch, id };
    await this.writeTemplate(normalized);
    return normalized;
  }

  async listIds(): Promise<string[]> {
    const files = await fs.readdir(this.templatesDir);
    return files.filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
  }
}
