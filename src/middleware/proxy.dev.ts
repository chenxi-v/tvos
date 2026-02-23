import type { Plugin } from 'vite'
import { handleProxyRequest, getTargetUrl } from '../utils/proxy'

const SPIDER_BACKEND_URL = 'http://localhost:8000'

export function proxyMiddleware(): Plugin {
  return {
    name: 'proxy-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith('/api/spiders')) {
          try {
            const backendUrl = `${SPIDER_BACKEND_URL}${req.url}`
            
            const body = await new Promise<string>((resolve, reject) => {
              const chunks: Buffer[] = []
              req.on('data', (chunk: Buffer) => chunks.push(chunk))
              req.on('end', () => resolve(Buffer.concat(chunks).toString()))
              req.on('error', reject)
            })
            
            const fetchOptions: RequestInit = {
              method: req.method,
              headers: {
                'Content-Type': 'application/json',
              },
              body: body,
            }
            
            const response = await fetch(backendUrl, fetchOptions)
            const text = await response.text()
            const contentType = response.headers.get('content-type') || 'application/json'

            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Content-Type', contentType)
            res.writeHead(response.status)
            res.end(text)
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Spiders API request failed', message }))
          }
          return
        }

        if (!req.url?.startsWith('/proxy')) {
          return next()
        }

        try {
          const targetUrl = getTargetUrl(req.url)
          
          // 从查询参数中获取自定义 headers
          const urlObj = new URL(req.url, 'http://localhost')
          const headersParam = urlObj.searchParams.get('headers')
          let customHeaders: Record<string, string> | undefined
          
          if (headersParam) {
            try {
              customHeaders = JSON.parse(decodeURIComponent(headersParam))
            } catch (error) {
              console.error('解析 headers 参数失败:', error)
            }
          }
          
          const response = await handleProxyRequest(targetUrl, customHeaders)
          const text = await response.text()
          const contentType = response.headers.get('content-type') || 'application/json'

          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Content-Type', contentType)
          res.writeHead(response.status)
          res.end(text)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error'
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Proxy request failed', message }))
        }
      })
    },
  }
}
