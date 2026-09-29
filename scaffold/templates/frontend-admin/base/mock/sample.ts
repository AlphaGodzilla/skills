import type { Request, Response } from 'express';

/**
 * 开发期假数据（仅 `npm start` 生效，`npm run dev` 用 `MOCK=none` 关掉）。
 *
 * 让骨架在没有后端时也能点通列表与详情；接上真实后端后本文件可以直接删。
 * 返回体刻意与 `src/services/sample.ts` 的约定一致（含 RFC 7807 形状的错误体），
 * 这样错误处理分支也能在本地被看到。
 */
const samples = Array.from({ length: 23 }, (_, index) => {
  const seq = index + 1;
  const day = String((seq % 28) + 1).padStart(2, '0');
  return {
    id: `01SAMPLE${String(seq).padStart(4, '0')}`,
    name: `示例 ${seq}`,
    description: seq % 3 === 0 ? '' : `第 ${seq} 条示例数据的说明文字`,
    createdAt: `2026-01-${day}T08:30:00.000Z`,
    updatedAt: `2026-02-${day}T09:00:00.000Z`,
  };
});

export default {
  'GET /api/samples': (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const size = Math.max(1, Number(req.query.size ?? 20));
    const keyword =
      typeof req.query.keyword === 'string' ? req.query.keyword.trim() : '';

    const filtered = keyword
      ? samples.filter(
          (item) =>
            item.name.includes(keyword) || item.description.includes(keyword),
        )
      : samples;

    const start = (page - 1) * size;
    res.json({
      items: filtered.slice(start, start + size),
      total: filtered.length,
    });
  },

  'GET /api/samples/:id': (req: Request, res: Response) => {
    const found = samples.find((item) => item.id === req.params.id);
    if (!found) {
      res.status(404).json({
        status: 404,
        title: 'Not Found',
        detail: `示例不存在：${req.params.id}`,
      });
      return;
    }
    res.json(found);
  },

  'POST /api/samples': (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { name?: unknown; description?: unknown };
    const name = String(body.name ?? '').trim();
    if (!name) {
      res.status(400).json({
        status: 400,
        title: 'Bad Request',
        detail: '参数校验失败',
        errors: [{ field: 'name', message: '名称不能为空' }],
      });
      return;
    }

    const now = new Date().toISOString();
    const created = {
      id: `01SAMPLE${String(samples.length + 1).padStart(4, '0')}`,
      name,
      description: String(body.description ?? ''),
      createdAt: now,
      updatedAt: now,
    };
    samples.unshift(created);
    res.status(201).json(created);
  },

  'DELETE /api/samples/:id': (req: Request, res: Response) => {
    const index = samples.findIndex((item) => item.id === req.params.id);
    if (index < 0) {
      res.status(404).json({
        status: 404,
        title: 'Not Found',
        detail: `示例不存在：${req.params.id}`,
      });
      return;
    }
    samples.splice(index, 1);
    res.status(204).end();
  },
};
