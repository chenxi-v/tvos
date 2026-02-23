// 统一的代理处理逻辑
export async function handleProxyRequest(targetUrl: string, customHeaders?: Record<string, string>): Promise<Response> {
  // 验证 URL
  try {
    new URL(targetUrl)
  } catch {
    throw new Error('Invalid URL format')
  }

  console.log('代理请求目标URL:', targetUrl)

  const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14; SM-S928U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Referer': 'https://hd13.huaduzy.com/',
    'Origin': 'https://hd13.huaduzy.com',
  }

  const headers = customHeaders ? { ...defaultHeaders, ...customHeaders } : defaultHeaders

  try {
    // 发起请求
    const response = await fetch(targetUrl, {
      headers,
      signal: AbortSignal.timeout(30000), // 30秒超时
    })

    console.log('代理响应状态:', response.status)
    return response
  } catch (error) {
    console.error('代理请求失败:', error)
    throw error
  }
}

// 从查询参数获取目标 URL
export function getTargetUrl(url: string): string {
  const urlObj = new URL(url, 'http://localhost')
  const targetUrl = urlObj.searchParams.get('url')

  if (!targetUrl) {
    throw new Error('URL parameter is required')
  }

  return decodeURIComponent(targetUrl)
}
