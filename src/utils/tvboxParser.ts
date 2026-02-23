import type { VideoApi } from '@/types'

function getBackendUrl(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('backend_url') || 'http://localhost:8000'
  }
  return 'http://localhost:8000'
}

interface TVBoxSite {
  key: string
  name: string
  type: number
  api: string
  searchable?: number
  quickSearch?: number
  filterable?: number
  categories?: string[]
  jar?: string
  ext?: string | object
  playerType?: number
}

interface TVBoxConfig {
  sites?: TVBoxSite[]
  spider?: string
  wallpaper?: string
  logo?: string
  ads?: string[]
  rules?: unknown[]
  parses?: unknown[]
  flags?: string[]
  headers?: Record<string, string>
}

interface SpiderSite extends VideoApi {
  spiderKey: string
  spiderType: 'script' | 'jar'
  scriptUrl?: string
}

/**
 * 检测数据是否为 TVBox 格式
 */
export function isTVBoxFormat(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) {
    return false
  }

  const config = data as TVBoxConfig

  // 检查是否有 sites 数组
  if (Array.isArray(config.sites) && config.sites.length > 0) {
    // 检查第一个站点是否有 TVBox 特有的字段
    const firstSite = config.sites[0]
    return (
      typeof firstSite === 'object' &&
      firstSite !== null &&
      'key' in firstSite &&
      'name' in firstSite &&
      'type' in firstSite &&
      'api' in firstSite
    )
  }

  return false
}

/**
 * 将 TVBox 站点转换为 VideoApi
 */
function convertTVBoxSiteToVideoApi(site: TVBoxSite, spiderJar?: string): VideoApi | SpiderSite | null {
  const cleanName = site.name
    .replace(/[🍃🌍🥗🐉🎬📺]/g, '')
    .trim()

  const id = `tvbox_${site.key}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  if (site.type === 3) {
    const api = site.api
    const isScript = api.endsWith('.py') || api.endsWith('.js')
    
    if (isScript) {
      const backendUrl = getBackendUrl()
      const spiderUrl = `${backendUrl}/api/spider/${site.key}`
      
      return {
        id,
        name: cleanName || site.key,
        url: spiderUrl,
        detailUrl: spiderUrl,
        timeout: 30000,
        retry: 1,
        isEnabled: true,
        updatedAt: new Date(),
        spiderKey: site.key,
        spiderType: 'script',
        isSpider: true,
        scriptUrl: api.startsWith('http') ? api : undefined,
        searchable: site.searchable === 1,
        quickSearch: site.quickSearch === 1,
        filterable: site.filterable === 1,
      } as SpiderSite
    } else {
      console.warn(`跳过JAR爬虫站点: ${site.name}, api: ${api}`)
      return null
    }
  }

  if (![0, 1].includes(site.type)) {
    console.warn(`跳过不支持的站点类型: ${site.name}, type: ${site.type}`)
    return null
  }

  return {
    id,
    name: cleanName || site.key,
    url: site.api,
    detailUrl: site.api,
    timeout: 10000,
    retry: 3,
    isEnabled: true,
    updatedAt: new Date(),
  }
}

/**
 * 解析 TVBox 配置
 */
export function parseTVBoxConfig(data: unknown): VideoApi[] {
  if (!isTVBoxFormat(data)) {
    throw new Error('无效的 TVBox 格式')
  }

  const config = data as TVBoxConfig
  const sites = config.sites || []
  const spiderJar = config.spider

  const videoApis: VideoApi[] = []

  for (const site of sites) {
    try {
      const api = convertTVBoxSiteToVideoApi(site, spiderJar)
      if (api) {
        videoApis.push(api)
      }
    } catch (error) {
      console.warn(`转换站点失败: ${site.name}`, error)
    }
  }

  return videoApis
}

export function extractSpiderSites(data: unknown): SpiderSite[] {
  if (!isTVBoxFormat(data)) {
    return []
  }

  const config = data as TVBoxConfig
  const sites = config.sites || []

  const spiderSites: SpiderSite[] = []
  const backendUrl = getBackendUrl()

  for (const site of sites) {
    if (site.type === 3) {
      const api = site.api
      const isScript = api.endsWith('.py') || api.endsWith('.js')
      
      if (isScript) {
        const cleanName = site.name
          .replace(/[🍃🌍🥗🐉🎬📺]/g, '')
          .trim()
        
        const spiderUrl = `${backendUrl}/api/spider/${site.key}`
        
        spiderSites.push({
          id: `spider_${site.key}_${Date.now()}`,
          name: cleanName || site.key,
          url: spiderUrl,
          detailUrl: spiderUrl,
          timeout: 30000,
          retry: 1,
          isEnabled: true,
          updatedAt: new Date(),
          spiderKey: site.key,
          spiderType: 'script',
          isSpider: true,
          scriptUrl: api.startsWith('http') ? api : undefined,
          searchable: site.searchable === 1,
          quickSearch: site.quickSearch === 1,
          filterable: site.filterable === 1,
        })
      }
    }
  }

  return spiderSites
}

/**
 * 尝试解析多种格式的视频源配置
 * 支持：
 * 1. TVBox 格式（{ sites: [...] }）
 * 2. 标准数组格式（[...]）
 */
export function parseVideoSourceConfig(data: unknown): VideoApi[] {
  // 先尝试 TVBox 格式
  if (isTVBoxFormat(data)) {
    console.log('检测到 TVBox 格式')
    return parseTVBoxConfig(data)
  }

  // 尝试标准数组格式
  if (Array.isArray(data)) {
    console.log('检测到标准数组格式')
    // 验证数组项是否符合 VideoApi 格式
    const validApis = data.filter((item): item is VideoApi => {
      return (
        typeof item === 'object' &&
        item !== null &&
        'name' in item &&
        'url' in item
      )
    })

    if (validApis.length > 0) {
      return validApis.map(api => ({
        ...api,
        id: api.id || `imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        updatedAt: new Date(),
      }))
    }
  }

  throw new Error('无法识别的视频源格式')
}

export function getTVBoxSpiderConfig(data: unknown): { key: string; scriptUrl: string }[] {
  if (!isTVBoxFormat(data)) {
    return []
  }

  const config = data as TVBoxConfig
  const sites = config.sites || []
  const spiders: { key: string; scriptUrl: string }[] = []

  for (const site of sites) {
    if (site.type === 3) {
      const api = site.api
      const isScript = api.endsWith('.py') || api.endsWith('.js')
      
      if (isScript && api.startsWith('http')) {
        spiders.push({
          key: site.key,
          scriptUrl: api,
        })
      }
    }
  }

  return spiders
}

export { SpiderSite }
