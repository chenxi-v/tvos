import { useEffect, useRef, useState, useMemo } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router'
import Artplayer from 'artplayer'
import Hls, {
  type LoaderContext,
  type LoaderCallbacks,
  type LoaderResponse,
  type LoaderStats,
  type HlsConfig,
  type LoaderConfiguration,
} from 'hls.js'
import { Card, CardBody, Button, Chip, Spinner, Tooltip, Select, SelectItem } from '@heroui/react'
import type { DetailResponse } from '@/types'
import { apiService } from '@/services/api.service'
import { useApiStore } from '@/store/apiStore'
import { useViewingHistoryStore } from '@/store/viewingHistoryStore'
import { useSettingStore } from '@/store/settingStore'
import { useDocumentTitle, useTheme } from '@/hooks'
import { ArrowUpIcon, ArrowDownIcon } from '@/components/icons'
import _ from 'lodash'
import { toast } from 'sonner'

// 过滤可疑的广告内容
function filterAdsFromM3U8(m3u8Content: string) {
  if (!m3u8Content) return ''

  // 按行分割M3U8内容
  const lines = m3u8Content.split('\n')
  const filteredLines = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 只过滤#EXT-X-DISCONTINUITY标识
    if (!line.includes('#EXT-X-DISCONTINUITY')) {
      filteredLines.push(line)
    }
  }

  return filteredLines.join('\n')
}

// 扩展 LoaderContext 类型以包含 type 属性
interface ExtendedLoaderContext extends LoaderContext {
  type: string
}

// 扩展 Artplayer 类型以包含 hls 属性
interface ArtplayerWithHls extends Artplayer {
  hls?: Hls
}

// 自定义M3U8 Loader用于过滤广告
class CustomHlsJsLoader extends Hls.DefaultConfig.loader {
  constructor(config: HlsConfig) {
    super(config)
    const load = this.load.bind(this)
    this.load = function (
      context: LoaderContext,
      config: LoaderConfiguration,
      callbacks: LoaderCallbacks<LoaderContext>,
    ) {
      // 拦截manifest和level请求
      const ctx = context as ExtendedLoaderContext
      if (ctx.type === 'manifest' || ctx.type === 'level') {
        const onSuccess = callbacks.onSuccess
        callbacks.onSuccess = function (
          response: LoaderResponse,
          stats: LoaderStats,
          context: LoaderContext,
          networkDetails: unknown,
        ) {
          // 如果是m3u8文件，处理内容以移除广告分段
          if (response.data && typeof response.data === 'string') {
            // 过滤掉广告段 - 实现更精确的广告过滤逻辑
            response.data = filterAdsFromM3U8(response.data)
          }
          return onSuccess(response, stats, context, networkDetails)
        }
      }
      // 执行原始load方法
      load(context, config, callbacks)
    }
  }
}

export default function Video() {
  const navigate = useNavigate()
  const { sourceCode: sourceCodeFromParams } = useParams<{ sourceCode: string }>()
  const location = useLocation()
  
  const pathParts = location.pathname.split('/video/')[1]?.split('/') || []
  const sourceCodeFromPath = pathParts[0] || ''
  const episodeIndex = pathParts[pathParts.length - 1]
  const vodId = decodeURIComponent(pathParts.slice(1, -1).join('/'))
  
  // 优先使用从路径解析的 sourceCode
  const sourceCode = sourceCodeFromPath || sourceCodeFromParams
  
  console.log('[Video] sourceCodeFromParams:', sourceCodeFromParams)
  console.log('[Video] sourceCodeFromPath:', sourceCodeFromPath)
  console.log('[Video] sourceCode:', sourceCode)
  console.log('[Video] vodId:', vodId)
  console.log('[Video] episodeIndex:', episodeIndex)
  
  // 从 location.state 获取 episodeUrl、flag 和视频信息
  const state = location.state as { 
    episodeUrl?: string; 
    flag?: string;
    vod_pic?: string;
    vod_name?: string;
    vod_remarks?: string;
  } | null
  const episodeUrlFromState = state?.episodeUrl
  const flagFromState = state?.flag
  const vodPicFromState = state?.vod_pic
  const vodNameFromState = state?.vod_name
  const vodRemarksFromState = state?.vod_remarks

  console.log('[Video] location.state:', state)
  console.log('[Video] episodeUrlFromState:', episodeUrlFromState)
  console.log('[Video] flagFromState:', flagFromState)

  const playerRef = useRef<Artplayer | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 初始化主题
  useTheme()

  // 从 store 获取 API 配置
  const { videoAPIs, adFilteringEnabled } = useApiStore()
  const { addViewingHistory, viewingHistory } = useViewingHistoryStore()
  const { playback } = useSettingStore()

  // Use refs to access latest values in main useEffect without triggering re-renders
  const viewingHistoryRef = useRef(viewingHistory)
  const playbackRef = useRef(playback)

  useEffect(() => {
    viewingHistoryRef.current = viewingHistory
    playbackRef.current = playback
  }, [viewingHistory, playback])

  // 状态管理
  const [detail, setDetail] = useState<DetailResponse | null>(null)
  const [selectedEpisode, setSelectedEpisode] = useState(() => {
    const index = parseInt(episodeIndex || '0')
    return isNaN(index) ? 0 : index
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isReversed, setIsReversed] = useState(playback.defaultEpisodeOrder === 'desc')
  const [currentPageRange, setCurrentPageRange] = useState<string>('')
  const [episodesPerPage, setEpisodesPerPage] = useState(100)

  // 测试播放函数 - 用于 URL 测试输入框
  const testPlayUrl = (url: string, headers?: Record<string, string>) => {
    if (!containerRef.current) return
    
    console.log('[测试播放] URL:', url, 'headers:', headers)
    
    // 销毁旧的播放器
    if (playerRef.current && playerRef.current.destroy) {
      playerRef.current.destroy(false)
      playerRef.current = null
    }

    // 清空容器
    containerRef.current.innerHTML = ''

    // 检查 URL 是否是 iframe 播放
    if (url.includes('hhplayer.com') || url.includes('index.php?url=')) {
      console.log('[测试播放] 检测到 iframe 播放')
      // 创建 iframe 元素
      const iframe = document.createElement('iframe')
      iframe.src = url
      iframe.style.width = '100%'
      iframe.style.height = '100%'
      iframe.style.border = 'none'
      iframe.style.position = 'absolute'
      iframe.style.top = '0'
      iframe.style.left = '0'
      iframe.setAttribute('allowfullscreen', 'true')
      containerRef.current.appendChild(iframe)
      return
    }

    // 使用 Artplayer 播放
    const art = new Artplayer({
      container: containerRef.current!,
      url: url,
      volume: 0.7,
      isLive: false,
      muted: false,
      autoplay: true,
      pip: true,
      autoSize: true,
      autoMini: true,
      screenshot: true,
      setting: true,
      loop: false,
      flip: true,
      playbackRate: true,
      aspectRatio: true,
      fullscreen: true,
      fullscreenWeb: true,
      subtitleOffset: true,
      miniProgressBar: true,
      mutex: true,
      backdrop: true,
      playsInline: true,
      autoOrientation: true,
      airplay: true,
      theme: '#22c55e',
      lang: 'zh-cn',
      moreVideoAttr: {
        crossOrigin: 'anonymous',
      },
      customType: {
        m3u8: function (video: HTMLMediaElement, url: string, art: Artplayer) {
          const artWithHls = art as ArtplayerWithHls
          if (Hls.isSupported()) {
            if (artWithHls.hls) artWithHls.hls.destroy()
            const hlsConfig: Partial<HlsConfig> = {
              ...(adFilteringEnabled ? { loader: CustomHlsJsLoader as unknown as typeof Hls.DefaultConfig.loader } : {}),
              xhrSetup: (xhr: XMLHttpRequest) => {
                if (headers) {
                  Object.entries(headers).forEach(([key, value]) => {
                    xhr.setRequestHeader(key, value)
                  })
                } else {
                  // 默认 headers
                  xhr.setRequestHeader('User-Agent', 'Mozilla/5.0 (Linux; Android 14; SM-S928U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36')
                  xhr.setRequestHeader('Referer', 'https://hd13.huaduzy.com/')
                }
              },
            }
            const hls = new Hls(hlsConfig)
            hls.loadSource(url)
            hls.attachMedia(video)
            artWithHls.hls = hls
            art.on('destroy', () => hls.destroy())
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url
          } else {
            art.notice.show = 'Unsupported playback format: m3u8'
          }
        },
      },
    })

    playerRef.current = art
  }

  // 计算响应式的每页集数 (基于屏幕尺寸和列数)
  useEffect(() => {
    const calculateEpisodesPerPage = () => {
      const width = window.innerWidth
      let cols = 2 // 手机默认2列
      let rows = 8 // 默认行数

      if (width >= 1024) {
        cols = 8 // 桌面端8列
        rows = 5 // 桌面端行数，确保一屏显示完整
      } else if (width >= 768) {
        cols = 6 // 平板横屏6列
        rows = 6 // 平板行数
      } else if (width >= 640) {
        cols = 3 // 平板竖屏3列
        rows = 8
      }

      setEpisodesPerPage(cols * rows)
    }

    calculateEpisodesPerPage()
    window.addEventListener('resize', calculateEpisodesPerPage)
    return () => window.removeEventListener('resize', calculateEpisodesPerPage)
  }, [])

  // 获取显示信息
  const getTitle = () => vodNameFromState || detail?.videoInfo?.title || '未知视频'
  const sourceName = detail?.videoInfo?.source_name || '未知来源'
  const getCover = () => vodPicFromState || detail?.videoInfo?.cover || ''
  const getRemarks = () => vodRemarksFromState || detail?.videoInfo?.remarks || ''

  // 动态更新页面标题
  const pageTitle = useMemo(() => {
    const title = vodNameFromState || detail?.videoInfo?.title
    if (title) {
      return `${title}`
    }
    return '视频播放'
  }, [vodNameFromState, detail?.videoInfo?.title])

  useDocumentTitle(pageTitle)

  // 获取视频详情
  useEffect(() => {
    const fetchVideoDetail = async () => {
      if (!sourceCode || !vodId) {
        setError('缺少必要的参数')
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        // 根据 sourceCode 找到对应的 API 配置
        const api = videoAPIs.find(api => api.id === sourceCode)
        if (!api) {
          throw new Error('未找到对应的API配置')
        }

        // 获取视频详情
        const response = await apiService.getVideoDetail(vodId, api)

        if (response.code === 200 && response.episodes && response.episodes.length > 0) {
          setDetail(response)
        } else {
          throw new Error(response.msg || '获取视频详情失败')
        }
      } catch (err) {
        console.error('获取视频详情失败:', err)
        setError(err instanceof Error ? err.message : '获取视频详情失败')
      } finally {
        setLoading(false)
      }
    }

    fetchVideoDetail()
  }, [sourceCode, vodId, videoAPIs])

  // 监听 selectedEpisode 和 URL 参数变化
  useEffect(() => {
    const urlEpisodeIndex = parseInt(episodeIndex || '0')
    if (!isNaN(urlEpisodeIndex) && urlEpisodeIndex !== selectedEpisode) {
      setSelectedEpisode(urlEpisodeIndex)
    }
  }, [episodeIndex, selectedEpisode])

  useEffect(() => {
    // 如果有从 Detail.tsx 传递的 episodeUrl，直接使用，不需要等待 detail.episodes
    if (!episodeUrlFromState && (!detail?.episodes || !detail.episodes[selectedEpisode] || !containerRef.current)) return

    // 销毁旧的播放器实例
    if (playerRef.current && playerRef.current.destroy) {
      playerRef.current.destroy(false)
    }

    const nextEpisode = () => {
      if (!playbackRef.current.isAutoPlayEnabled) return

      const total = detail.videoInfo?.episodes_names?.length || 0
      if (selectedEpisode < total - 1) {
        const nextIndex = selectedEpisode + 1
        setSelectedEpisode(nextIndex)
        navigate(`/video/${sourceCode}/${vodId}/${nextIndex}`, {
          replace: true,
        })
        toast.info(`即将播放下一集: ${detail.videoInfo?.episodes_names?.[nextIndex]}`)
      }
    }

    const initPlayer = async (playUrl: string, parse: number, headers?: Record<string, string>) => {
      let finalUrl = playUrl
      
      if (parse === 1) {
        let proxyUrl = `/proxy?url=${encodeURIComponent(playUrl)}`
        if (headers) {
          proxyUrl += `&headers=${encodeURIComponent(JSON.stringify(headers))}`
        }
        finalUrl = proxyUrl
      }

      const art = new Artplayer({
        container: containerRef.current!,
        url: finalUrl,
        volume: 0.7,
        isLive: false,
        muted: false,
        autoplay: false,
        pip: true,
      autoSize: true,
      autoMini: true,
      screenshot: true,
      setting: true,
      loop: false,
      flip: true,
      playbackRate: true,
      aspectRatio: true,
      fullscreen: true,
      fullscreenWeb: true,
      subtitleOffset: true,
      miniProgressBar: true,
      mutex: true,
      backdrop: true,
      playsInline: true,
      autoOrientation: true,
      // autoPlayback: true, // Removed to avoid duplicate resume logic with viewingHistoryStore
      airplay: true,
      theme: '#22c55e',
      lang: 'zh-cn',
      moreVideoAttr: {
        crossOrigin: 'anonymous',
      },
      customType: {
        m3u8: function (video: HTMLMediaElement, url: string, art: Artplayer) {
          const artWithHls = art as ArtplayerWithHls
          if (Hls.isSupported()) {
            if (artWithHls.hls) artWithHls.hls.destroy()
            const hlsConfig: Partial<HlsConfig> = {
              ...(adFilteringEnabled ? { loader: CustomHlsJsLoader as unknown as typeof Hls.DefaultConfig.loader } : {}),
              xhrSetup: (xhr: XMLHttpRequest) => {
                if (headers) {
                  Object.entries(headers).forEach(([key, value]) => {
                    xhr.setRequestHeader(key, value)
                  })
                }
              },
            }
            const hls = new Hls(hlsConfig)
            hls.loadSource(url)
            hls.attachMedia(video)
            artWithHls.hls = hls
            art.on('destroy', () => hls.destroy())
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url
          } else {
            art.notice.show = 'Unsupported playback format: m3u8'
          }
        },
      },
    })

    playerRef.current = art

    // 自动续播
    art.on('ready', () => {
      const existingHistory = viewingHistoryRef.current.find(
        item =>
          item.sourceCode === sourceCode &&
          item.vodId === vodId &&
          item.episodeIndex === selectedEpisode,
      )
      if (existingHistory && existingHistory.playbackPosition > 0) {
        art.seek = existingHistory.playbackPosition
        toast.success('已自动跳转到上次观看位置')
      }
    })

    // 记录观看历史
    const normalAddHistory = () => {
      if (!sourceCode || !vodId || !detail?.videoInfo) return
      addViewingHistory({
        title: detail.videoInfo.title || '未知视频',
        imageUrl: detail.videoInfo.cover || '',
        sourceCode: sourceCode || '',
        sourceName: detail.videoInfo.source_name || '',
        vodId: vodId || '',
        episodeIndex: selectedEpisode,
        episodeName: detail.videoInfo.episodes_names?.[selectedEpisode],
        playbackPosition: art.currentTime || 0,
        duration: art.duration || 0,
        timestamp: Date.now(),
      })
    }

    art.on('video:play', normalAddHistory)
    art.on('video:pause', normalAddHistory)
    art.on('video:ended', () => {
      normalAddHistory()
      nextEpisode()
    })
    art.on('video:error', normalAddHistory)

    let lastTimeUpdate = 0
    const TIME_UPDATE_INTERVAL = 3000

    const timeUpdateHandler = () => {
      if (!sourceCode || !vodId || !detail?.videoInfo) return
      const currentTime = art.currentTime || 0
      const duration = art.duration || 0
      const timeSinceLastUpdate = Date.now() - lastTimeUpdate

      if (timeSinceLastUpdate >= TIME_UPDATE_INTERVAL && currentTime > 0 && duration > 0) {
        lastTimeUpdate = Date.now()
        addViewingHistory({
          title: detail.videoInfo.title || '未知视频',
          imageUrl: detail.videoInfo.cover || '',
          sourceCode: sourceCode || '',
          sourceName: detail.videoInfo.source_name || '',
          vodId: vodId || '',
          episodeIndex: selectedEpisode,
          episodeName: detail.videoInfo.episodes_names?.[selectedEpisode],
          playbackPosition: currentTime,
          duration: duration,
          timestamp: Date.now(),
        })
      }
    }

    art.on('video:timeupdate', _.throttle(timeUpdateHandler, TIME_UPDATE_INTERVAL))
    }

    const api = videoAPIs.find(api => api.id === sourceCode)
    
    // 优先使用从 Detail.tsx 传递的 episodeUrl 和 flag
    const episodeUrl = episodeUrlFromState || detail.episodes[selectedEpisode]
    const flag = flagFromState || 'default'
    
    // 判断是否为 Spider API（与 apiService.isSpiderApi 逻辑一致）
    const isSpiderApi = api && (api.isSpider || api.spiderKey || (api.url && api.url.includes('/api/spider')))
    
    console.log('[Video] 播放参数:', {
      sourceCode,
      episodeUrl,
      selectedEpisode,
      flag,
      episodeUrlFromState,
      flagFromState,
      api: api ? { id: api.id, name: api.name, url: api.url, isSpider: api.isSpider, spiderKey: api.spiderKey } : null,
      isSpiderApi,
    })
    
    // 如果是 Spider API，检查 episodeUrl 是否包含播放链接
    // 如果 episodeUrl 包含 '$'，说明是 tuit.py 格式（视频名称$播放链接），直接使用第二部分
    // 否则调用 getPlayUrl 解析
    if (isSpiderApi) {
      if (episodeUrl.includes('$')) {
        // tuit.py 格式：视频名称$播放链接
        const parts = episodeUrl.split('$')
        const playUrl = parts[1] || parts[0]
        console.log('[Video] tuit.py 格式，直接播放:', playUrl)
        testPlayUrl(playUrl)
      } else {
        console.log('[Video] Spider API - 调用 getPlayUrl, episodeUrl:', episodeUrl, 'flag:', flag)
        apiService.getPlayUrl(api!, episodeUrl, flag).then(result => {
          console.log('[Video] getPlayUrl 结果:', result)
          // 使用 testPlayUrl 直接播放 m3u8，传递 headers
          if (result.url) {
            testPlayUrl(result.url, result.header)
          }
        }).catch(err => {
          console.error('[Video] 获取播放地址失败:', err)
        })
      }
    } else {
      console.log('[Video] 非 Spider API，直接播放')
      initPlayer(episodeUrl, 0)
    }

    return () => {
      if (playerRef.current && playerRef.current.destroy) {
        playerRef.current.destroy(false)
        playerRef.current = null
      }
    }
  }, [selectedEpisode, detail, sourceCode, vodId, addViewingHistory, navigate, adFilteringEnabled, videoAPIs, episodeUrlFromState, flagFromState])

  // 处理集数切换
  const handleEpisodeChange = (displayIndex: number) => {
    // displayIndex 是在当前显示列表中的索引（已考虑倒序）
    // 需要转换成原始列表中的实际索引
    const actualIndex = isReversed
      ? (detail?.videoInfo?.episodes_names?.length || 0) - 1 - displayIndex
      : displayIndex
    setSelectedEpisode(actualIndex)
    // 更新 URL，保持路由同步
    navigate(`/video/${sourceCode}/${vodId}/${actualIndex}`, {
      replace: true,
    })
  }

  // 计算分页范围（根据正序倒序调整标签）
  const pageRanges = useMemo(() => {
    const totalEpisodes = detail?.videoInfo?.episodes_names?.length || 0
    if (totalEpisodes === 0) return []

    const ranges: { label: string; value: string; start: number; end: number }[] = []

    if (isReversed) {
      // 倒序：从最后一集开始
      for (let i = 0; i < totalEpisodes; i += episodesPerPage) {
        const start = i
        const end = Math.min(i + episodesPerPage - 1, totalEpisodes - 1)
        // 倒序时，标签应该显示从大到小
        const labelStart = totalEpisodes - start
        const labelEnd = totalEpisodes - end
        ranges.push({
          label: `${labelStart}-${labelEnd}`,
          value: `${start}-${end}`,
          start,
          end,
        })
      }
    } else {
      // 正序：从第一集开始
      for (let i = 0; i < totalEpisodes; i += episodesPerPage) {
        const start = i
        const end = Math.min(i + episodesPerPage - 1, totalEpisodes - 1)
        ranges.push({
          label: `${start + 1}-${end + 1}`,
          value: `${start}-${end}`,
          start,
          end,
        })
      }
    }

    return ranges
  }, [detail?.videoInfo?.episodes_names?.length, episodesPerPage, isReversed])

  // 初始化当前页范围 & 当切换正序倒序时自动调整页码
  useEffect(() => {
    if (pageRanges.length === 0 || !detail?.videoInfo?.episodes_names) return

    const totalEpisodes = detail.videoInfo.episodes_names.length
    const actualSelectedIndex = selectedEpisode

    // 根据实际索引计算显示索引
    const displayIndex = isReversed ? totalEpisodes - 1 - actualSelectedIndex : actualSelectedIndex

    // 找到包含当前选集的页范围
    const rangeContainingSelected = pageRanges.find(
      range => displayIndex >= range.start && displayIndex <= range.end,
    )

    if (rangeContainingSelected) {
      setCurrentPageRange(rangeContainingSelected.value)
    } else {
      // 如果没有找到，设置为第一页
      setCurrentPageRange(pageRanges[0].value)
    }
  }, [pageRanges, selectedEpisode, isReversed, detail?.videoInfo?.episodes_names])

  // 当前页显示的剧集
  const currentPageEpisodes = useMemo(() => {
    if (!currentPageRange || !detail?.videoInfo?.episodes_names) return []

    const [start, end] = currentPageRange.split('-').map(Number)
    const totalEpisodes = detail.videoInfo.episodes_names.length
    const episodes = detail.videoInfo.episodes_names

    if (isReversed) {
      // 倒序：取出对应范围的集数并反转
      const selectedEpisodes = []
      for (let i = start; i <= end; i++) {
        const actualIndex = totalEpisodes - 1 - i
        if (actualIndex >= 0 && actualIndex < totalEpisodes) {
          selectedEpisodes.push({
            name: episodes[actualIndex],
            displayIndex: i,
            actualIndex: actualIndex,
          })
        }
      }
      return selectedEpisodes
    } else {
      // 正序：直接取出对应范围
      return episodes.slice(start, end + 1).map((name, idx) => ({
        name,
        displayIndex: start + idx,
        actualIndex: start + idx,
      }))
    }
  }, [currentPageRange, detail?.videoInfo?.episodes_names, isReversed])

  // 加载状态
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-muted-foreground">正在加载视频信息...</p>
        </div>
      </div>
    )
  }

  // 错误状态
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardBody className="text-center">
            <p className="mb-4 text-red-500">{error}</p>
            <Button className="w-full bg-black text-white hover:bg-black/80" onPress={() => navigate(-1)}>
              返回
            </Button>
          </CardBody>
        </Card>
      </div>
    )
  }

  // 如果没有数据且正在加载，显示加载状态
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Spinner size="lg" />
      </div>
    )
  }

  // 如果加载完成但没有数据，显示错误信息
  if (!detail || !detail.episodes || detail.episodes.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardBody className="text-center">
            <p className="mb-4 text-muted-foreground">{error || '无法获取播放信息'}</p>
            <Button className="w-full bg-black text-white hover:bg-black/80" onPress={() => navigate(-1)}>
              返回
            </Button>
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-6xl p-2 sm:p-4">
      {/* 视频信息 - 移动端在播放器上方，桌面端浮层 */}
      <div className="mb-4 flex flex-col gap-2 md:hidden">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold bg-gradient-to-r from-green-400 to-emerald-600 bg-clip-text text-transparent">{sourceName}</p>
            <h4 className="text-lg font-bold">{getTitle()}</h4>
          </div>
          <Button size="sm" className="bg-black text-white hover:bg-black/80" onPress={() => navigate(-1)}>
            返回
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Chip size="sm" color="primary" variant="flat">
            第 {selectedEpisode + 1} 集
          </Chip>
          <p className="text-sm text-muted-foreground">共 {detail.episodes.length} 集</p>
        </div>
      </div>

      {/* 播放器卡片 */}
      <div className="mb-4 hidden items-center justify-between md:flex">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-sm font-semibold bg-gradient-to-r from-green-400 to-emerald-600 bg-clip-text text-transparent">{sourceName}</p>
            <h4 className="text-xl font-bold">{getTitle()}</h4>
          </div>
          <div className="flex items-center gap-2">
            <Chip size="sm" color="primary" variant="flat">
              第 {selectedEpisode + 1} 集
            </Chip>
            <p className="text-sm text-muted-foreground">共 {detail.episodes.length} 集</p>
          </div>
        </div>
        <Button size="sm" className="bg-black text-white hover:bg-black/80" onPress={() => navigate(-1)}>
          返回
        </Button>
      </div>

      <Card className="mb-4 border-none sm:mb-6" radius="lg">
        {/* Removed absolute header to fix display issues, moved info to top of card or separate div above */}
        <CardBody className="p-0">
          <div
            id="player"
            ref={containerRef}
            className="relative flex aspect-video w-full items-center overflow-hidden rounded-lg bg-black"
          />
        </CardBody>
      </Card>

      {/* URL 测试输入框 */}
      <Card className="mb-4 border-none" radius="lg">
        <CardBody className="p-4">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground">URL 播放测试</h3>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="输入 m3u8 或视频 URL 直接播放测试"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                id="test-url-input"
              />
              <Button
                size="sm"
                className="bg-green-600 text-white hover:bg-green-700"
                onPress={() => {
                  const input = document.getElementById('test-url-input') as HTMLInputElement
                  const url = input?.value?.trim()
                  if (url) {
                    testPlayUrl(url)
                  }
                }}
              >
                播放
              </Button>
            </div>
            {detail?.episodes && detail.episodes.length > 0 && (
              <div className="mt-2 text-xs text-muted-foreground">
                <p>当前选集 URL: <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">{detail.episodes[selectedEpisode]}</code></p>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Spider API 专用播放组件 - 仅当没有 vod_play_from 时使用 */}
      {(() => {
        const api = videoAPIs.find(a => a.id === sourceCode)
        const isSpiderApi = api && (api.isSpider || api.spiderKey || (api.url && api.url.includes('/api/spider')))
        const hasStandardPlayFormat = detail?.videoInfo?.vod_play_from && detail?.videoInfo?.vod_play_url
        
        // 只有当是爬虫 API 且没有标准播放格式时，才使用 Spider API 专用播放组件
        if (isSpiderApi && !hasStandardPlayFormat && detail?.episodes && detail.episodes.length > 0) {
          return (
            <Card className="mb-4 border-none" radius="lg">
              <CardBody className="p-4">
                <div className="flex flex-col gap-3">
                  <h3 className="text-lg font-semibold text-foreground">播放控制</h3>
                  <div className="flex flex-wrap gap-2">
                    {detail.videoInfo?.episodes_names?.map((name, index) => (
                      <Button
                        key={index}
                        size="sm"
                        variant={selectedEpisode === index ? "solid" : "bordered"}
                        color={selectedEpisode === index ? "primary" : "default"}
                        onPress={async () => {
                          setSelectedEpisode(index)
                          const episodeUrl = detail.episodes[index]
                          
                          console.log('[Spider播放] episodeUrl:', episodeUrl)
                          
                          try {
                            const result = await apiService.getPlayUrl(api!, episodeUrl)
                            console.log('[Spider播放] getPlayUrl 结果:', result)
                            
                            if (result.url) {
                              testPlayUrl(result.url)
                            }
                          } catch (err) {
                            console.error('[Spider播放] 获取播放地址失败:', err)
                          }
                        }}
                      >
                        {name.length > 20 ? name.substring(0, 20) + '...' : name}
                      </Button>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <p>当前播放: {detail.videoInfo?.episodes_names?.[selectedEpisode] || '未选择'}</p>
                    <p>播放链接: {detail.episodes[selectedEpisode]}</p>
                  </div>
                </div>
              </CardBody>
            </Card>
          )
        }
        return null
      })()}

      {/* 选集列表 - 标准格式（vod_play_from/vod_play_url）或非 Spider API 使用 */}
      {(() => {
        const api = videoAPIs.find(a => a.id === sourceCode)
        const isSpiderApi = api && (api.isSpider || api.spiderKey || (api.url && api.url.includes('/api/spider')))
        const hasStandardPlayFormat = detail?.videoInfo?.vod_play_from && detail?.videoInfo?.vod_play_url
        
        // 如果有标准播放格式，或者不是爬虫 API，则显示原版选集组件
        return (hasStandardPlayFormat || !isSpiderApi) && detail.videoInfo?.episodes_names && detail.videoInfo?.episodes_names.length > 0
      })() && (
        <div className="mt-4 flex flex-col">
          <div className="flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-foreground">选集</h2>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="light"
                  onPress={() => setIsReversed(!isReversed)}
                  startContent={
                    isReversed ? <ArrowUpIcon size={18} /> : <ArrowDownIcon size={18} />
                  }
                  className="min-w-unit-16 text-sm text-muted-foreground"
                >
                  {isReversed ? '正序' : '倒序'}
                </Button>
                {pageRanges.length > 1 && (
                  <Select
                    size="sm"
                    selectedKeys={[currentPageRange]}
                    onChange={e => setCurrentPageRange(e.target.value)}
                    className="w-32"
                    classNames={{
                      trigger: 'bg-white/30 backdrop-blur-md border border-border',
                      value: 'text-foreground font-medium',
                      popoverContent: 'bg-white/40 backdrop-blur-2xl border border-border/50',
                    }}
                    aria-label="选择集数范围"
                  >
                    {pageRanges.map(range => (
                      <SelectItem key={range.value}>{range.label}</SelectItem>
                    ))}
                  </Select>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-white/30 p-4 pt-0 shadow-lg/5 backdrop-blur-md sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-8 dark:bg-black/30">
            {currentPageEpisodes.map(({ name, displayIndex, actualIndex }) => {
              return (
                <Tooltip
                  key={`${name}-${displayIndex}`}
                  content={name}
                  placement="top"
                  delay={1000}
                >
                  <Button
                    size="md"
                    color="default"
                    variant="shadow"
                    className={
                      selectedEpisode === actualIndex
                        ? 'border border-border bg-primary text-primary-foreground drop-shadow-2xl'
                        : 'border border-border bg-white/30 text-foreground drop-shadow-2xl backdrop-blur-md transition-all duration-300 hover:scale-105 hover:bg-black/80 hover:text-white dark:bg-black/30 dark:hover:bg-white/80 dark:hover:text-black'
                    }
                    onPress={() => handleEpisodeChange(displayIndex)}
                  >
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap">{name}</span>
                  </Button>
                </Tooltip>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
