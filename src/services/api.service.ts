import { API_CONFIG, M3U8_PATTERN, getProxyUrl } from '@/config/api.config'
import { useSettingStore } from '@/store/settingStore'
import type { SearchResponse, DetailResponse, VideoItem, VideoApi } from '@/types'

class ApiService {
  private isSpiderApi(api: VideoApi): boolean {
    return !!(api.isSpider || api.spiderKey || (api.url && api.url.includes('/api/spider')))
  }

  private getProxyUrl(targetUrl: string, api?: VideoApi): string {
    if (api?.proxyUrl) {
      return getProxyUrl(targetUrl, api.proxyUrl)
    }

    const { proxy } = useSettingStore.getState()
    if (proxy.enabled && proxy.proxyUrl) {
      return getProxyUrl(targetUrl, proxy.proxyUrl)
    }

    return getProxyUrl(targetUrl)
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeout = 10000,
    retry = 3,
  ): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort('request timeout')
    }, timeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)

      if (retry > 0) {
        console.warn(`请求失败，正在重试 (剩余${retry}次):`, error)
        return this.fetchWithTimeout(url, options, timeout, retry - 1)
      }

      throw error
    }
  }

  private buildApiUrl(baseUrl: string, configPath: string, queryValue: string): string {
    const url = baseUrl.replace(/\/+$/, '')
    const [pathPart, queryPart] = configPath.split('?')

    if (
      url.toLowerCase().endsWith(pathPart.replace(/\/+$/, '').toLowerCase()) ||
      url.toLowerCase().includes('/api.php/provide/vod')
    ) {
      const prefix = url.includes('?') ? '&' : '?'
      return `${url}${prefix}${queryPart}${queryValue}`
    }

    return `${url}${configPath}${queryValue}`
  }

  private buildSpiderUrl(baseUrl: string, action: string, params: Record<string, string>): string {
    const url = baseUrl.replace(/\/+$/, '')
    const queryString = Object.entries(params)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&')
    return `${url}/${action}?${queryString}`
  }

  private parseXmlResponse(xmlText: string): any {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml')

    const videoElements = xmlDoc.getElementsByTagName('video')
    const list: any[] = []

    for (let i = 0; i < videoElements.length; i++) {
      const video = videoElements[i]
      const videoData: any = {}

      const fields = [
        { tag: 'id', field: 'vod_id' },
        { tag: 'name', field: 'vod_name' },
        { tag: 'pic', field: 'vod_pic' },
        { tag: 'type', field: 'type_name' },
        { tag: 'year', field: 'vod_year' },
        { tag: 'area', field: 'vod_area' },
        { tag: 'director', field: 'vod_director' },
        { tag: 'actor', field: 'vod_actor' },
        { tag: 'note', field: 'vod_remarks' },
        { tag: 'des', field: 'vod_content' },
      ]

      fields.forEach(({ tag, field }) => {
        const element = video.getElementsByTagName(tag)[0]
        if (element) {
          videoData[field] = element.textContent
        }
      })

      const dlElements = video.getElementsByTagName('dl')
      const playUrls: string[] = []
      const playFroms: string[] = []

      for (let j = 0; j < dlElements.length; j++) {
        const ddElements = dlElements[j].getElementsByTagName('dd')
        for (let k = 0; k < ddElements.length; k++) {
          const dd = ddElements[k]
          const flag = dd.getAttribute('flag') || 'default'
          const urls = dd.textContent || ''

          if (urls) {
            playFroms.push(flag)
            playUrls.push(urls)
          }
        }
      }

      videoData.vod_play_from = playFroms.join('$$$')
      videoData.vod_play_url = playUrls.join('$$$')

      list.push(videoData)
    }

    return { list }
  }

  async searchVideos(query: string, api: VideoApi): Promise<SearchResponse> {
    try {
      if (!query) {
        throw new Error('缺少搜索参数')
      }

      if (!api || !api.url) {
        throw new Error('无效的API配置')
      }

      let apiUrl: string

      if (this.isSpiderApi(api)) {
        apiUrl = this.buildSpiderUrl(api.url, 'search', { keyword: query })
      } else {
        apiUrl = this.buildApiUrl(api.url, API_CONFIG.search.path, encodeURIComponent(query))
        apiUrl = this.getProxyUrl(apiUrl, api)
      }

      const response = await this.fetchWithTimeout(
        apiUrl,
        { headers: API_CONFIG.search.headers },
        api.timeout || 30000,
        api.retry || 1,
      )

      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status}`)
      }

      const text = await response.text()
      let data: any

      if (text.trim().startsWith('<?xml') || text.trim().startsWith('<rss')) {
        console.log('[apiService] 搜索检测到 XML 响应，开始解析')
        data = this.parseXmlResponse(text)
      } else {
        console.log('[apiService] 搜索检测到 JSON 响应，开始解析')
        data = JSON.parse(text)
      }

      if (!data || !Array.isArray(data.list)) {
        return { code: 200, list: [] }
      }

      data.list.forEach((item: VideoItem) => {
        item.source_name = api.name
        item.source_code = api.id
        item.api_url = api.url
      })

      return { code: 200, list: data.list || [] }
    } catch (error) {
      console.error('搜索错误:', error)
      return {
        code: 400,
        msg: error instanceof Error ? error.message : '请求处理失败',
        list: [],
      }
    }
  }

  async getVideoDetail(id: string, api: VideoApi): Promise<DetailResponse> {
    try {
      if (!id) {
        throw new Error('缺少视频ID参数')
      }

      if (!api || !api.url) {
        throw new Error('无效的API配置')
      }

      console.log('[apiService] getVideoDetail 调用:', { id, apiId: api.id, apiUrl: api.url, isSpider: this.isSpiderApi(api) })

      let apiUrl: string

      if (this.isSpiderApi(api)) {
        apiUrl = this.buildSpiderUrl(api.url, 'detail', { ids: id })
        console.log('[apiService] Spider API URL:', apiUrl)
      } else {
        const baseUrl = api.detailUrl || api.url
        apiUrl = this.buildApiUrl(baseUrl, API_CONFIG.detail.path, id)
        apiUrl = this.getProxyUrl(apiUrl, api)
        console.log('[apiService] 普通 API URL:', apiUrl)
      }

      const response = await this.fetchWithTimeout(
        apiUrl,
        { headers: API_CONFIG.detail.headers },
        api.timeout || 30000,
        api.retry || 1,
      )

      if (!response.ok) {
        throw new Error(`详情请求失败: ${response.status}`)
      }

      const text = await response.text()
      let data: any

      if (text.trim().startsWith('<?xml') || text.trim().startsWith('<rss')) {
        console.log('[apiService] 检测到 XML 响应，开始解析')
        data = this.parseXmlResponse(text)
      } else {
        console.log('[apiService] 检测到 JSON 响应，开始解析')
        data = JSON.parse(text)
      }

      if (!data || !data.list || !Array.isArray(data.list) || data.list.length === 0) {
        throw new Error('获取到的详情内容无效')
      }

      return this.parseVideoDetail(data, api, apiUrl)
    } catch (error) {
      console.error('详情获取错误:', error)
      return {
        code: 400,
        msg: error instanceof Error ? error.message : '请求处理失败',
        episodes: [],
      }
    }
  }

  private parseVideoDetail(data: { list: VideoItem[] }, _api: VideoApi, detailUrl: string): DetailResponse {
    console.log('[apiService] parseVideoDetail 原始数据:', data)
    const videoDetail = data.list[0]
    let episodes: string[] = []
    let episodeNames: string[] = []

    // 优先使用后端返回的 episodes 和 episodes_names
    if (videoDetail.episodes && videoDetail.episodes.length > 0) {
      episodes = videoDetail.episodes
      episodeNames = videoDetail.episodes_names || episodes.map((_: string, index: number) => `第${index + 1}集`)
      console.log('[apiService] 使用后端返回的 episodes:', episodes)
      console.log('[apiService] 使用后端返回的 episodes_names:', episodeNames)
    } else {
      // 否则自己解析 vod_play_url
      console.log('[apiService] vod_play_url:', videoDetail.vod_play_url)
      console.log('[apiService] vod_play_from:', videoDetail.vod_play_from)

      if (videoDetail.vod_play_url) {
        const playSources = videoDetail.vod_play_url.split('$$$')
        const playFroms = (videoDetail.vod_play_from || '').split('$$$')

        console.log('[apiService] playSources:', playSources)
        console.log('[apiService] playFroms:', playFroms)

        if (playSources.length > 0) {
          let sourceIndex = playFroms.findIndex((from: string) =>
            from.toLowerCase().includes('m3u8'),
          )

          if (sourceIndex === -1) {
            sourceIndex = playSources.length - 1
          }

          if (sourceIndex >= playSources.length) {
            sourceIndex = playSources.length - 1
          }

          console.log('[apiService] 选择的 sourceIndex:', sourceIndex)

          const mainSource = playSources[sourceIndex]

          // 检查是否是直接的播放链接（不包含 $）
          if (!mainSource.includes('$')) {
            // 直接使用播放链接
            episodes = [mainSource]
            episodeNames = ['播放']
            console.log('[apiService] 检测到直接播放链接:', mainSource)
          } else {
            // 按标准格式解析
            const episodeList = mainSource.split('#')
            episodes = episodeList
              .map((ep: string) => {
                const parts = ep.split('$')
                return parts.length > 1 ? parts[1] : ''
              })
              .filter(
                (url: string) => url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')),
              )

            episodeNames = episodeList.map((ep: string, index: number) => {
              const parts = ep.split('$')
              return parts.length > 1 ? parts[0] : `第${index + 1}集`
            })
          }

          console.log('[apiService] 解析后的 episodes:', episodes)
          console.log('[apiService] 解析后的 episodeNames:', episodeNames)
        }
      }

      if (episodes.length === 0 && videoDetail.vod_content) {
        const matches = videoDetail.vod_content.match(M3U8_PATTERN) || []
        episodes = matches.map((link: string) => link.replace(/^\$/, ''))
        console.log('[apiService] 从 vod_content 提取的 episodes:', episodes)
      }
    }

    return {
      code: 200,
      episodes,
      detailUrl,
      videoInfo: {
        title: videoDetail.vod_name,
        cover: videoDetail.vod_pic,
        desc: videoDetail.vod_content,
        type: videoDetail.type_name,
        year: videoDetail.vod_year,
        area: videoDetail.vod_area,
        director: videoDetail.vod_director,
        actor: videoDetail.vod_actor,
        remarks: videoDetail.vod_remarks,
        source_name: videoDetail.source_name,
        source_code: videoDetail.source_code,
        episodes_names: episodeNames,
        episodes: episodes,  // 添加 episodes 到 videoInfo
        vod_play_from: videoDetail.vod_play_from,
        vod_play_url: videoDetail.vod_play_url,
      },
    }
  }

  async getPlayUrl(api: VideoApi, episodeUrl: string, flag?: string): Promise<{ url: string; parse: number; header?: Record<string, string> }> {
    console.log('[apiService] getPlayUrl 调用:', { apiId: api.id, episodeUrl, flag })
    if (this.isSpiderApi(api)) {
      try {
        const apiUrl = this.buildSpiderUrl(api.url, 'play', { 
          flag: flag || 'default', 
          id: episodeUrl 
        })
        console.log('[apiService] 请求 URL:', apiUrl)
        
        const response = await this.fetchWithTimeout(apiUrl, {}, api.timeout || 30000, 1)

        if (!response.ok) {
          throw new Error(`播放请求失败: ${response.status}`)
        }

        const data = await response.json()
        console.log('[apiService] 响应数据:', data)
        
        return {
          url: data.url || episodeUrl,
          parse: data.parse || 0,
          header: data.header,
        }
      } catch (error) {
        console.error('播放获取错误:', error)
        return { url: episodeUrl, parse: 1 }
      }
    }
    return { url: episodeUrl, parse: 0 }
  }

  private createConcurrencyLimiter(limit: number) {
    let running = 0
    const queue: (() => void)[] = []

    const tryRun = () => {
      while (running < limit && queue.length > 0) {
        const next = queue.shift()
        if (next) {
          running++
          next()
        }
      }
    }

    return <T>(task: () => Promise<T>): Promise<T> => {
      return new Promise((resolve, reject) => {
        const run = () => {
          task()
            .then(resolve)
            .catch(reject)
            .finally(() => {
              running--
              tryRun()
            })
        }

        queue.push(run)
        tryRun()
      })
    }
  }

  aggregatedSearch(
    query: string,
    selectedAPIs: VideoApi[],
    onNewResults: (results: VideoItem[]) => void,
    signal?: AbortSignal,
  ): Promise<VideoItem[]> {
    if (selectedAPIs.length === 0) {
      console.warn('没有选中任何 API 源')
      return Promise.resolve([])
    }

    let aborted = false
    if (signal) {
      if (signal.aborted) {
        return Promise.reject(new DOMException('Aborted', 'AbortError'))
      }
      signal.addEventListener('abort', () => {
        aborted = true
      })
    }

    const seen = new Set<string>()
    const limiter = this.createConcurrencyLimiter(3)

    const tasks = selectedAPIs.map(api =>
      limiter(async () => {
        if (aborted) return [] as VideoItem[]
        let results: VideoItem[] = []
        try {
          results = await this.searchSingleSource(query, api)
        } catch (error) {
          if (aborted) return [] as VideoItem[]
          console.warn(`${api.name} 源搜索失败:`, error)
        }
        if (aborted) return [] as VideoItem[]

        const newUnique = results.filter(item => {
          const key = `${item.source_code}_${item.vod_id}`
          if (!seen.has(key)) {
            seen.add(key)
            return true
          }
          return false
        })
        if (aborted || newUnique.length === 0) return [] as VideoItem[]

        onNewResults(newUnique)
        return newUnique
      }),
    )

    const allPromise: Promise<VideoItem[]> = Promise.all(tasks).then(chunks => chunks.flat())
    if (signal) {
      const abortPromise = new Promise<VideoItem[]>((_, reject) => {
        signal.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
      return Promise.race([allPromise, abortPromise])
    }
    return allPromise
  }

  private async searchSingleSource(query: string, api: VideoApi): Promise<VideoItem[]> {
    try {
      const result = await this.searchVideos(query, api)
      if (result.code === 200 && result.list) {
        return result.list
      }
      return []
    } catch (error) {
      console.warn(`${api.name}源搜索失败:`, error)
      return []
    }
  }
}

export const apiService = new ApiService()
