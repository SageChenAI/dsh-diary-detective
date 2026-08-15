import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'diary-detective'

export function apply(ctx) {
  const fs = ctx.get('fs')
  if (fs === undefined) return
  const sandbox = ctx.get('sandboxPolicy')
  const root = sandbox && sandbox.workspaceRoot ? sandbox.workspaceRoot : '.'
  const DEFAULT_DIR = root + '/diary'
  const DEFAULT_MEMORY = root + '/diary-memory.md'

  const MEMORY_TEMPLATE = [
    '# 赛博日记 · 记忆压缩 Diary Memory',
    '',
    '> 大脑每次复盘后重写：合并今天的新信息、删除过时内容。这是下次复盘的背景。',
    '> 办案守则：人文视角 / 人类共性 / 尊重差异 / 词义频率（只是粗糙代理）',
    '',
    '## 长期习惯（可验证的模式：主题 + 证据日期 + 频次）',
    '<!-- 状态标记：活跃 / 待验证 / 已过去 -->',
    '',
    '## 模式与洞察（情绪节奏 / 反复出现的问题 / 已验证的策略）',
    '',
    '## 进行中（正在形成或中断中的习惯）',
    '',
    '## 不再提及清单（用户划定的边界，绝不触碰）',
    '',
    '## 待办追踪',
    '',
  ].join('\n')

  function pad(n) { return n < 10 ? '0' + n : String(n) }
  function todayIso() {
    const d = new Date()
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
  }
  function dayNum(iso) {
    const p = iso.split('-')
    return Math.floor(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / 86400000)
  }
  function weekdayIndex(iso) {
    const p = iso.split('-')
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getDay()
  }
  const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

  function parseFrontmatter(text) {
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
    const meta = {}
    let body = text
    if (m) {
      for (const line of m[1].split(/\r?\n/)) {
        const i = line.indexOf(':')
        if (i > 0) {
          let v = line.slice(i + 1).trim()
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
          meta[line.slice(0, i).trim()] = v
        }
      }
      body = text.slice(m[0].length)
    }
    meta._body = body
    return meta
  }
  function bigrams(text) {
    // 中文：连续汉字二元组；英文：单词二元组（忽略大小写）
    const out = {}
    const cnRuns = text.match(/[\u4e00-\u9fff]+/g) || []
    for (const run of cnRuns) {
      for (let i = 0; i < run.length - 1; i++) {
        const g = run.slice(i, i + 2)
        out[g] = (out[g] || 0) + 1
      }
    }
    const enWords = text.match(/[A-Za-z]+/g) || []
    for (let i = 0; i < enWords.length - 1; i++) {
      const g = (enWords[i] + ' ' + enWords[i + 1]).toLowerCase()
      out[g] = (out[g] || 0) + 1
    }
    return out
  }
  

  function isTemplate(name) {
    return /模板|template|YYYY|\bTMP\b/i.test(name)
  }

  async function listMarkdown(dir, signal) {
    const target = await fs.resolve(dir, { signal })
    const entries = await fs.listDir(target, signal)
    const names = []
    for (const e of entries) {
      if (e.type && e.type !== 'file') continue
      if (isTemplate(e.name)) continue
      if (/\.md$/i.test(e.name)) names.push(e.name)
    }
    return names
  }

  async function readFileText(dir, name, signal) {
    const target = await fs.resolve(dir.replace(/[\\/]+$/, '') + '/' + name, { signal })
    return fs.readText(target, signal)
  }

  async function buildIndex(dir, signal) {
    const files = []
    for (const name of await listMarkdown(dir, signal)) {
      const text = await readFileText(dir, name, signal)
      const meta = parseFrontmatter(text)
      const m = /(\d{4}-\d{2}-\d{2})/.exec(name)
      const date = m ? m[1] : (meta.date || null)
      if (!date) continue
      files.push({
        date,
        name,
        title: meta.title || '',
        tags: meta.tags || '',
        mood: meta.mood || '',
        energy: meta.energy || '',
        body: meta._body || '',
      })
    }
    files.sort((a, b) => (a.date < b.date ? -1 : 1))
    const dayCounts = [0, 0, 0, 0, 0, 0, 0]
    const tagCounts = {}
    const bg = {}
    for (const f of files) {
      dayCounts[weekdayIndex(f.date)]++
      for (const t of String(f.tags || '').split(/[\s,#]+/).filter(Boolean)) {
        tagCounts[t] = (tagCounts[t] || 0) + 1
      }
      const b = bigrams(f.body || '')
      for (const k in b) bg[k] = (bg[k] || 0) + b[k]
    }
    const nums = files.map((f) => dayNum(f.date))
    let longest = 0
    let run = 0
    let prev = null
    const gaps = []
    for (const n of nums) {
      if (prev === null) {
        run = 1
      } else if (n - prev === 1) {
        run++
      } else {
        if (run > longest) longest = run
        if (n - prev > 1) gaps.push({ days: n - prev - 1 })
        run = 1
      }
      prev = n
    }
    if (run > longest) longest = run
    gaps.sort((a, b) => b.days - a.days)
    return {
      dir,
      total: files.length,
      range: files.length ? { from: files[0].date, to: files[files.length - 1].date } : null,
      dayOfWeek: WEEKDAYS.map((n, i) => ({ day: n, entries: dayCounts[i] })),
      topBigrams: Object.entries(bg).sort((a, b) => b[1] - a[1]).slice(0, 30).map((e) => ({ word: e[0], count: e[1] })),
      topTags: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 15).map((e) => ({ tag: e[0], count: e[1] })),
      longestStreak: longest,
      lastStreak: run,
      largestGaps: gaps.slice(0, 10),
      entries: files.map((f) => ({ date: f.date, name: f.name, title: f.title, tags: f.tags, mood: f.mood, energy: f.energy })),
    }
  }

  function stripFrontmatter(text) {
    return text.replace(/^---\r?\n[\s\S]*?\r?\n---/, '').trim()
  }

  const renderJson = (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }]
  const output = { schema: { type: 'object', additionalProperties: true }, render: renderJson }

  const tools = [
    {
      name: 'diary_write',
      description: '赛博日记·写日记（手）：把用户口述的内容落盘为当日日记文件 YYYY-MM-DD.md。若当日文件已存在则追加，否则新建。不强制任何格式（frontmatter/模板都自由），文件名携带日期即可。日记永远为用户自己而写。',
      parameters: {
        content: { type: 'string', required: true, description: '日记正文内容' },
        date: { type: 'string', description: '日期 YYYY-MM-DD，默认今天' },
        dir: { type: 'string', description: '日记目录，默认 <workspace>/diary' },
      },
      output,
      
        try       async execute(args, exec) {
        const dir = args.dir || DEFAULT_DIR
        const date = args.date || todayIso()
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return { ok: false, error: 'date 格式必须为 YYYY-MM-DD' }
        }
        const name = date + '.md'{
          const target = await fs.resolve(dir.replace(/[\\/]+$/, '') + '/' + name, { signal: exec.signal })
          let existing = null
          try {
            existing = await fs.readText(target, exec.signal)
          } catch {
            existing = null
          }
          const mode = existing ? 'appended' : 'created'
          const text = existing ? existing.replace(/\s+$/, '') + '\n\n' + args.content + '\n' : args.content + '\n'
          const out = await fs.writeText(target, text, undefined, exec.signal)
          if (out && (out.isDenied || out.error)) {
            return { path: dir + '/' + name, ok: false, error: String(out.error || out.isDenied) }
          }
          return { path: dir + '/' + name, date, mode, ok: true, chars: args.content.length }
        } catch (err) {
          return { path: dir + '/' + name, ok: false, error: String((err && err.message) || err) }
        }
      },
    },
    {
      name: 'diary_index',
      description: '赛博日记·索引与机械统计（眼睛 + for 循环）：列出日记目录全部条目并计算机械统计——按星期分布、标签频次、中文二元词频（词义频率，只是粗糙代理）、最长连续天数、最大间隔。语义归类（如「学逻辑」「做数学题」「读哲学」→ 同一主题「学习」）由你完成，不要照抄词频。返回结构化 JSON。',
      parameters: {
        dir: { type: 'string', description: '日记目录，默认 <workspace>/diary' },
      },
      output,
      async execute(args, exec) {
        try {
          return await buildIndex(args.dir || DEFAULT_DIR, exec.signal)
        } catch (err) {
          return { error: '索引失败: ' + String((err && err.message) || err) }
        }
      },
    },
    {
      name: 'diary_read',
      description: '赛博日记·读原文（眼睛）：按日期或范围读取日记正文（去掉 frontmatter）。原文是当天信息的唯一事实来源；记忆压缩只是背景。',
      parameters: {
        date: { type: 'string', description: '精确日期 YYYY-MM-DD' },
        from: { type: 'string', description: '起始日期 YYYY-MM-DD' },
        to: { type: 'string', description: '结束日期 YYYY-MM-DD' },
        limit: { type: 'number', description: '只取最近 N 篇' },
        dir: { type: 'string', description: '日记目录，默认 <workspace>/diary' },
      },
      output,
      async execute(args, exec) {
        try {
          const dir = args.dir || DEFAULT_DIR
          const index = await buildIndex(dir, exec.signal)
          let list = index.entries
          if (args.date) list = list.filter((e) => e.date === args.date)
          if (args.from) list = list.filter((e) => e.date >= args.from)
          if (args.to) list = list.filter((e) => e.date <= args.to)
          if (args.limit) list = list.slice(-Number(args.limit))
          const entries = []
          for (const e of list) {
            entries.push({
              date: e.date,
              name: e.name,
              title: e.title,
              tags: e.tags,
              mood: e.mood,
              energy: e.energy,
              text: stripFrontmatter(await readFileText(dir, e.name, exec.signal)),
            })
          }
          return { dir, count: entries.length, entries }
        } catch (err) {
          return { error: '读取失败: ' + String((err && err.message) || err) }
        }
      },
    },
    {
      name: 'diary_memory',
      description: '赛博日记·读记忆压缩（记忆）：读取长期记忆文件（长期习惯/模式与洞察/进行中/不再提及清单/待办）。文件不存在时返回模板。',
      parameters: {
        path: { type: 'string', description: '记忆文件路径，默认 <workspace>/diary-memory.md' },
      },
      output,
      async execute(args, exec) {
        const path = args.path || DEFAULT_MEMORY
        try {
          const target = await fs.resolve(path, { signal: exec.signal })
          const text = await fs.readText(target, exec.signal)
          return { path, exists: true, text }
        } catch (err) {
          return { path, exists: false, error: String((err && err.message) || err), template: MEMORY_TEMPLATE }
        }
      },
    },
    {
      name: 'diary_memory_update',
      description: '赛博日记·更新记忆压缩（记忆写入）：用新内容整体替换记忆文件。正确流程：先 diary_memory 读旧记忆 → 大脑合并今天的新洞察 → 整体重写（压缩 + 存 + 下次再读）。记忆以用户确认为准：假设被否认→追问一次→接受→修正记忆。',
      parameters: {
        content: { type: 'string', required: true, description: '重写后的完整记忆内容（markdown）' },
        path: { type: 'string', description: '记忆文件路径，默认 <workspace>/diary-memory.md' },
      },
      output,
      async execute(args, exec) {
        const path = args.path || DEFAULT_MEMORY
        try {
          const target = await fs.resolve(path, { signal: exec.signal })
          const out = await fs.writeText(target, args.content, undefined, exec.signal)
          if (out && (out.isDenied || out.error)) {
            return { path, ok: false, error: String(out.error || out.isDenied) }
          }
          return { path, ok: true, chars: args.content.length }
        } catch (err) {
          return { path, ok: false, error: String((err && err.message) || err) }
        }
      },
    },
    {
      name: 'diary_feedback',
      description: '赛博日记侦探·开工包（一键）：一次取回今天的日记原文 + 记忆压缩 + 近期机械统计，供大脑综合分析后输出当日反馈（嘴巴）。办案守则：人文视角 / 人类共性 / 尊重差异 / 词义频率只是粗糙代理。拿到结果后：1) 语义归类今日内容（不同表述→同一主题）2) 对比记忆中的旧模式 3) 识别新习惯/周期/中断 4) 输出当日反馈（每日一句温暖回应；有真发现才说发现，绝不硬编），并给出记忆更新建议。',
      parameters: {
        date: { type: 'string', description: '反馈日期 YYYY-MM-DD，默认今天' },
        dir: { type: 'string', description: '日记目录，默认 <workspace>/diary' },
        memoryPath: { type: 'string', description: '记忆文件路径，默认 <workspace>/diary-memory.md' },
      },
      output,
      async execute(args, exec) {
        try {
          const dir = args.dir || DEFAULT_DIR
          const today = args.date || todayIso()
          const stats = await buildIndex(dir, exec.signal)
          const todayEntry = stats.entries.find((e) => e.date === today)
          let entry = null
          if (todayEntry) {
            entry = stripFrontmatter(await readFileText(dir, todayEntry.name, exec.signal))
          }
          const path = args.memoryPath || DEFAULT_MEMORY
          let memory
          try {
            const target = await fs.resolve(path, { signal: exec.signal })
            memory = { path, exists: true, text: await fs.readText(target, exec.signal) }
          } catch {
            memory = { path, exists: false, template: MEMORY_TEMPLATE }
          }
          return {
            today,
            hasEntry: !!todayEntry,
            entry,
            memory,
            stats: {
              total: stats.total,
              range: stats.range,
              dayOfWeek: stats.dayOfWeek,
              topBigrams: stats.topBigrams,
              topTags: stats.topTags,
              longestStreak: stats.longestStreak,
              lastStreak: stats.lastStreak,
              largestGaps: stats.largestGaps,
            },
          }
        } catch (err) {
          return { error: '开工包失败: ' + String((err && err.message) || err) }
        }
      },
    },
  ]

  for (const def of tools) {
    ctx.tools.register(defineTool(def))
  }
}
