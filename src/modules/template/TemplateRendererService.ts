export class TemplateRendererService {
  render(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
      const val = data[key];
      return val == null ? '' : String(val);
    });
  }

  /** Prefer explicit body; fall back to stringifying extraction rules for preview. */
  resolveTemplateContent(template: { body?: string; [key: string]: unknown }): string {
    if (typeof template.body === 'string' && template.body.trim()) {
      return template.body;
    }
    return JSON.stringify(template, null, 2);
  }
}
