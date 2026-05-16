import fs from 'fs'
import path from 'path'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://ghostsplits.com'

function isPageFile(name: string) {
  return /^(page)\.(tsx|ts|jsx|js)$/.test(name)
}

function walkPages(dir: string, baseDir: string): string[] {
  const results: string[] = []

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    // Skip grouping folders like (group) and hidden/underscore folders
    if (entry.name.startsWith('(') || entry.name.startsWith('_')) continue

    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      results.push(...walkPages(fullPath, baseDir))
      continue
    }

    if (entry.isFile() && isPageFile(entry.name)) {
      const rel = path.relative(baseDir, path.dirname(fullPath))

      // Ignore dynamic routes (contain '[')
      if (rel.includes('[')) continue

      const route = rel === '' ? '/' : `/${rel.replace(/\\/g, '/')}`
      results.push(route)
    }
  }

  return results
}

export async function GET() {
  try {
    const appDir = path.join(process.cwd(), 'app')

    if (!fs.existsSync(appDir)) {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`
      return new Response(xml, { headers: { 'Content-Type': 'application/xml' } })
    }

    const routes = walkPages(appDir, appDir)

    // Deduplicate and ensure root first
    const uniq = Array.from(new Set(routes)).sort((a, b) => (a === '/' ? -1 : a.localeCompare(b)))

    const now = new Date().toISOString()

    const urlEntries = uniq
      .map((r) => {
        const priority = r === '/' ? '1.00' : '0.80'
        return `  <url>\n    <loc>${SITE_URL}${r}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>\n  </url>`
      })
      .join('\n')

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>`

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    })
  } catch (err) {
    return new Response('Internal Server Error', { status: 500 })
  }
}
