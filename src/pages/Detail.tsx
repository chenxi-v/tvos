import { useParams, useNavigate, useLocation } from 'react-router'
import { useState, useEffect, useMemo } from 'react'
import { apiService } from '@/services/api.service'
import { type DetailResponse } from '@/types'
import { useApiStore } from '@/store/apiStore'
import { useSettingStore } from '@/store/settingStore'
import { Button, Spinner, Tooltip, Select, SelectItem } from '@heroui/react'
import { useDocumentTitle, useTheme } from '@/hooks'
import { ArrowUpIcon, ArrowDownIcon } from '@/components/icons'
import MobileNavBar from '@/components/MobileNavBar'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'

export default function Detail() {
  const { sourceCode } = useParams<{ sourceCode: string }>()
  const location = useLocation()
  const vodId = decodeURIComponent(location.pathname.split('/detail/')[1]?.split('/').slice(1).join('/') || '')
  const navigate = useNavigate()
  const { videoAPIs } = useApiStore()
  const { playback, home } = useSettingStore()
  const passedData = location.state as { vod_pic?: string; vod_name?: string; vod_remarks?: string } | null
  
  console.log('[Detail] sourceCode:', sourceCode)
  console.log('[Detail] vodId:', vodId)
  console.log('[Detail] location.pathname:', location.pathname)
  
  useTheme()

  const [detail, setDetail] = useState<DetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [isReversed, setIsReversed] = useState(playback.defaultEpisodeOrder === 'desc')
  const [currentPageRange, setCurrentPageRange] = useState<string>('')
  const [episodesPerPage, setEpisodesPerPage] = useState(100)
  const [selectedLineIndex, setSelectedLineIndex] = useState(0)

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

  // 动态更新页面标题
  useDocumentTitle(detail?.videoInfo?.title || '视频详情')

  // 获取显示信息的辅助函数
  const getTitle = () => passedData?.vod_name || detail?.videoInfo?.title || ''
  const getCover = () =>
    detail?.videoInfo?.cover || passedData?.vod_pic || 'https://via.placeholder.com/300x400?text=暂无封面'
  const getRemarks = () => detail?.videoInfo?.remarks || passedData?.vod_remarks || ''
  const getType = () => detail?.videoInfo?.type || ''
  const getYear = () => detail?.videoInfo?.year || ''
  const getDirector = () => {
    const director = detail?.videoInfo?.director || ''
    // 过滤掉 TVBoxOSC 特殊格式
    if (director.includes('[a=cr:') || director.includes('[/a]')) {
      return ''
    }
    return director
  }
  const getActor = () => detail?.videoInfo?.actor || ''
  const getArea = () => detail?.videoInfo?.area || ''
  const getContent = () => detail?.videoInfo?.desc || ''
  const getSourceName = () => detail?.videoInfo?.source_name || ''

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

  const parseEpisodesByLine = useMemo(() => {
    if (!detail?.videoInfo?.vod_play_from || !detail?.videoInfo?.vod_play_url) {
      return []
    }

    const playFroms = detail.videoInfo.vod_play_from.split('$$$')
    const playUrls = detail.videoInfo.vod_play_url.split('$$$')

    return playFroms.map((from, index) => {
      const episodeList = playUrls[index]?.split('#') || []
      const episodes = episodeList.map((ep: string) => {
        const parts = ep.split('$')
        return {
          name: parts.length > 1 ? parts[0] : `第${index + 1}集`,
          url: parts.length > 1 ? parts[1] : '',
        }
      })
      return {
        name: from,
        episodes,
      }
    })
  }, [detail?.videoInfo?.vod_play_from, detail?.videoInfo?.vod_play_url])

  // 当前选择的线路的集数
  const currentLineEpisodes = useMemo(() => {
    console.log('[Detail] currentLineEpisodes 计算中...')
    console.log('[Detail] detail?.videoInfo?.episodes_names:', detail?.videoInfo?.episodes_names)
    console.log('[Detail] detail?.videoInfo?.episodes:', detail?.videoInfo?.episodes)
    console.log('[Detail] parseEpisodesByLine:', parseEpisodesByLine)
    console.log('[Detail] selectedLineIndex:', selectedLineIndex)
    
    // 优先使用后端返回的 episodes_names 和 episodes
    if (detail?.videoInfo?.episodes_names && detail?.videoInfo?.episodes && detail.videoInfo.episodes.length > 0) {
      const episodes = detail.videoInfo.episodes
      const result = detail.videoInfo.episodes_names.map((name, index) => ({
        name,
        url: episodes[index] || ''
      }))
      console.log('[Detail] 使用 episodes_names 和 episodes，结果:', result)
      return result
    }
    
    // 否则使用 parseEpisodesByLine
    if (parseEpisodesByLine.length === 0) {
      console.log('[Detail] parseEpisodesByLine 为空，返回空数组')
      return []
    }
    const result = parseEpisodesByLine[selectedLineIndex]?.episodes || []
    console.log('[Detail] 使用 parseEpisodesByLine，结果:', result)
    return result
  }, [detail?.videoInfo?.episodes_names, detail?.videoInfo?.episodes, parseEpisodesByLine, selectedLineIndex])

  // 当前页显示的剧集
  const currentPageEpisodes = useMemo(() => {
    if (!currentPageRange || !currentLineEpisodes || currentLineEpisodes.length === 0) return []

    const [start, end] = currentPageRange.split('-').map(Number)
    const totalEpisodes = currentLineEpisodes.length

    if (isReversed) {
      // 倒序：取出对应范围的集数并反转
      const selectedEpisodes = []
      for (let i = start; i <= end; i++) {
        const actualIndex = totalEpisodes - 1 - i
        if (actualIndex >= 0 && actualIndex < totalEpisodes) {
          selectedEpisodes.push({
            name: currentLineEpisodes[actualIndex].name,
            url: currentLineEpisodes[actualIndex].url,
            displayIndex: i,
            actualIndex: actualIndex,
          })
        }
      }
      return selectedEpisodes
    } else {
      // 正序：直接取出对应范围
      return currentLineEpisodes.slice(start, end + 1).map((episode, idx) => ({
        name: episode.name,
        url: episode.url,
        displayIndex: start + idx,
        actualIndex: start + idx,
      }))
    }
  }, [currentPageRange, currentLineEpisodes, isReversed])

  useEffect(() => {
    const fetchDetail = async () => {
      if (!sourceCode || !vodId) return

      setLoading(true)
      try {
        const api = videoAPIs.find(api => api.id === sourceCode)
        console.log('[Detail] API 配置:', api ? { id: api.id, name: api.name, url: api.url, isSpider: api.isSpider } : null)
        
        if (!api) {
          throw new Error('未找到对应的API配置')
        }

        const response = await apiService.getVideoDetail(vodId, api)
        console.log('[Detail] 视频详情响应:', response)
        setDetail(response)
      } catch (error) {
        console.error('获取视频详情失败:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchDetail()
  }, [sourceCode, vodId, videoAPIs])

  // 初始化当前页范围 & 当切换正序倒序时自动调整页码
  useEffect(() => {
    if (pageRanges.length === 0) return

    // 切换正序倒序时，跳转到第一页
    setCurrentPageRange(pageRanges[0].value)
  }, [pageRanges, isReversed])

  // 处理播放按钮点击
  const handlePlayEpisode = (displayIndex: number) => {
    console.log('[Detail] handlePlayEpisode 被调用, displayIndex:', displayIndex)
    console.log('[Detail] currentLineEpisodes:', currentLineEpisodes)
    console.log('[Detail] isReversed:', isReversed)
    
    // displayIndex 是在当前显示列表中的索引（已考虑倒序）
    // 需要转换成原始列表中的实际索引
    const actualIndex = isReversed
      ? (currentLineEpisodes.length || 0) - 1 - displayIndex
      : displayIndex
    
    console.log('[Detail] actualIndex:', actualIndex)
    
    const episode = currentLineEpisodes[actualIndex]
    console.log('[Detail] episode:', episode)
    console.log('[Detail] episodeUrl:', episode?.url)
    console.log('[Detail] sourceCode:', sourceCode, 'vodId:', vodId)
    
    // 跳转到播放页面,使用新的路由格式,不传递 state
    const targetUrl = `/video/${sourceCode}/${encodeURIComponent(vodId)}/${actualIndex}`
    console.log('[Detail] 准备跳转到:', targetUrl)
    navigate(targetUrl, { state: { episodeUrl: episode.url, flag: parseEpisodesByLine[selectedLineIndex]?.name } })
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-gray-500 dark:text-gray-400">正在加载视频详情...</p>
        </div>
      </div>
    )
  }

  if (!detail || detail.code !== 200) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="rounded-2xl bg-white/40 p-8 text-center shadow-xl backdrop-blur-xl dark:bg-white/10">
          <p className="mb-4 text-gray-500 dark:text-gray-400">获取视频详情失败</p>
          <Button
            className="bg-gradient-to-r from-blue-500 to-purple-500 font-medium text-white"
            onPress={() => navigate(-1)}
          >
            返回
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-6xl overflow-x-hidden p-2 pb-20 pt-20 sm:p-4 sm:pt-4 md:pt-8">
      <MobileNavBar showSettings={false} />

      {/* 顶部导航栏 */}
      <div className="mb-4 flex items-center justify-end">
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button
            className="gap-2 rounded-xl bg-black text-white shadow-lg transition-all duration-300 hover:bg-black/80"
            onPress={() => navigate(-1)}
          >
            <ArrowLeft size={18} />
            <span className="font-medium">返回</span>
          </Button>
        </motion.div>
      </div>

      {/* 视频信息卡片 */}
      <motion.div
        className="flex flex-col gap-4 md:flex-row md:gap-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* 封面图 - 桌面端 */}
        <motion.div
          className="hidden md:block"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="overflow-hidden rounded-2xl shadow-2xl shadow-black/20">
            <img
              src={getCover()}
              alt={getTitle()}
              className={`object-cover ${home.posterAspectRatio === '16/9' ? 'aspect-video h-[180px] w-[320px]' : 'aspect-[3/4] h-[320px] w-[220px]'}`}
            />
          </div>
        </motion.div>

        {/* 详细信息 */}
        <motion.div
          className="flex-1 overflow-hidden rounded-2xl bg-white/40 shadow-xl shadow-black/5 backdrop-blur-xl dark:bg-white/10"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          {/* 移动端详情 */}
          <div className="md:hidden">
            {home.posterAspectRatio === '16/9' ? (
              <div className="flex flex-col gap-4 p-4">
                <motion.img
                  src={getCover()}
                  alt={getTitle()}
                  className="aspect-video w-full rounded-xl object-cover shadow-lg"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.25 }}
                />
                <motion.div
                  className="flex flex-col gap-2"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 }}
                >
                  {getTitle() && (
                    <h1 className="line-clamp-2 text-lg font-bold leading-tight text-gray-900 dark:text-white">
                      {getTitle()}
                    </h1>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {getSourceName() && (
                      <span className="rounded-full bg-gradient-to-r from-blue-500 to-purple-500 px-2 py-0.5 text-xs font-medium text-white">
                        {getSourceName()}
                      </span>
                    )}
                    {getRemarks() && (
                      <span className="rounded-full bg-green-500 px-2 py-0.5 text-xs font-medium text-white">
                        {getRemarks()}
                      </span>
                    )}
                    {getYear() && (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                        {getYear()}
                      </span>
                    )}
                    {getType() && (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                        {getType()}
                      </span>
                    )}
                    {getArea() && (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                        {getArea()}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                    {getDirector() && (
                      <p className="line-clamp-1">
                        <span className="font-medium text-gray-800 dark:text-gray-200">导演：</span>
                        {getDirector()}
                      </p>
                    )}
                    {getActor() && (
                      <p className="line-clamp-2">
                        <span className="font-medium text-gray-800 dark:text-gray-200">演员：</span>
                        {getActor()}
                      </p>
                    )}
                  </div>
                </motion.div>
                {getContent() && (
                  <div className="border-t border-gray-200/50 pt-4 dark:border-gray-700/50">
                    <div
                      className="line-clamp-4 text-sm text-gray-600 dark:text-gray-300"
                      dangerouslySetInnerHTML={{ __html: getContent() }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex gap-4 p-4">
                <motion.img
                  src={getCover()}
                  alt={getTitle()}
                  className="aspect-[3/4] h-[180px] w-[120px] rounded-xl object-cover shadow-lg"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.25 }}
                />
                <motion.div
                  className="flex flex-1 flex-col gap-2"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 }}
                >
                  {getTitle() && (
                    <h1 className="line-clamp-2 text-lg font-bold leading-tight text-gray-900 dark:text-white">
                      {getTitle()}
                    </h1>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {getSourceName() && (
                      <span className="rounded-full bg-gradient-to-r from-blue-500 to-purple-500 px-2 py-0.5 text-xs font-medium text-white">
                        {getSourceName()}
                      </span>
                    )}
                    {getRemarks() && (
                      <span className="rounded-full bg-green-500 px-2 py-0.5 text-xs font-medium text-white">
                        {getRemarks()}
                      </span>
                    )}
                    {getYear() && (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                        {getYear()}
                      </span>
                    )}
                    {getType() && (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                        {getType()}
                      </span>
                    )}
                    {getArea() && (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                        {getArea()}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                    {getDirector() && (
                      <p className="line-clamp-1">
                        <span className="font-medium text-gray-800 dark:text-gray-200">导演：</span>
                        {getDirector()}
                      </p>
                    )}
                    {getActor() && (
                      <p className="line-clamp-2">
                        <span className="font-medium text-gray-800 dark:text-gray-200">演员：</span>
                        {getActor()}
                      </p>
                    )}
                  </div>
                </motion.div>
              </div>
            )}
            {getContent() && home.posterAspectRatio !== '16/9' && (
              <div className="border-t border-gray-200/50 p-4 dark:border-gray-700/50">
                <div
                  className="line-clamp-4 text-sm text-gray-600 dark:text-gray-300"
                  dangerouslySetInnerHTML={{ __html: getContent() }}
                />
              </div>
            )}
          </div>

          {/* 桌面端详情 */}
          <div className="hidden md:block">
            <div className="p-6">
              {/* 标题和标签 */}
              <div className="mb-4">
                {getTitle() && (
                  <motion.h1
                    className="mb-3 text-2xl font-bold text-gray-900 dark:text-white"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.3 }}
                  >
                    {getTitle()}
                  </motion.h1>
                )}
                <motion.div
                  className="flex flex-wrap gap-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.4 }}
                >
                  {getSourceName() && (
                    <span className="rounded-full bg-gradient-to-r from-blue-500 to-purple-500 px-3 py-1 text-sm font-medium text-white">
                      {getSourceName()}
                    </span>
                  )}
                  {getRemarks() && (
                    <span className="rounded-full bg-green-500 px-3 py-1 text-sm font-medium text-white">
                      {getRemarks()}
                    </span>
                  )}
                  {getYear() && (
                    <span className="rounded-full bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                      {getYear()}
                    </span>
                  )}
                  {getType() && (
                    <span className="rounded-full bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                      {getType()}
                    </span>
                  )}
                  {getArea() && (
                    <span className="rounded-full bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                      {getArea()}
                    </span>
                  )}
                </motion.div>
              </div>

              {/* 详细信息 */}
              <motion.div
                className="space-y-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.5 }}
              >
                {getDirector() && (
                  <div className="text-gray-600 dark:text-gray-300">
                    <span className="font-semibold text-gray-900 dark:text-white">导演：</span>
                    <span>{getDirector()}</span>
                  </div>
                )}
                {getActor() && (
                  <div className="text-gray-600 dark:text-gray-300">
                    <span className="font-semibold text-gray-900 dark:text-white">演员：</span>
                    <span>{getActor()}</span>
                  </div>
                )}
              </motion.div>

              {/* 简介 */}
              {getContent() && (
                <motion.div
                  className="mt-4 rounded-xl bg-gray-50/50 p-4 dark:bg-gray-800/50"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.6 }}
                >
                  <h3 className="mb-2 font-semibold text-gray-900 dark:text-white">剧情简介</h3>
                  <div
                    className="text-sm leading-relaxed text-gray-600 dark:text-gray-300"
                    dangerouslySetInnerHTML={{ __html: getContent() }}
                  />
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Spider API 专用播放控制 - 仅当没有 vod_play_from 时使用 */}
      {(() => {
        const api = videoAPIs.find(a => a.id === sourceCode)
        const isSpiderApi = api && (api.isSpider || api.spiderKey || (api.url && api.url.includes('/api/spider')))
        const hasStandardPlayFormat = detail?.videoInfo?.vod_play_from && detail?.videoInfo?.vod_play_url
        
        // 只有当是爬虫 API 且没有标准播放格式时，才使用 Spider API 专用播放控制
        if (isSpiderApi && !hasStandardPlayFormat && detail?.videoInfo?.episodes_names && detail.videoInfo.episodes_names.length > 0) {
          return (
            <motion.div
              className="mt-6 overflow-hidden rounded-2xl bg-white/40 shadow-xl shadow-black/5 backdrop-blur-xl dark:bg-white/10"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <div className="border-b border-gray-200/50 p-4 dark:border-gray-700/50">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-1 rounded-full bg-gradient-to-b from-blue-500 to-purple-500" />
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">播放控制</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      共 {detail.videoInfo.episodes_names.length} 集
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
                {detail.videoInfo.episodes_names.map((name, index) => (
                  <motion.div
                    key={`${name}-${index}`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{
                      duration: 0.3,
                      delay: index * 0.02,
                      ease: 'easeOut',
                    }}
                  >
                    <Button
                      size="sm"
                      variant="flat"
                      className="w-full bg-gray-100 font-medium text-gray-700 hover:bg-blue-500 hover:text-white dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-blue-500"
                      onPress={() => navigate(`/video/${sourceCode}/${vodId}/${index}`)}
                    >
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                        {name.length > 20 ? name.substring(0, 20) + '...' : name}
                      </span>
                    </Button>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )
        }
        return null
      })()}

      {/* 播放列表 - 标准格式（vod_play_from/vod_play_url）或非 Spider API */}
      {(() => {
        const api = videoAPIs.find(a => a.id === sourceCode)
        const isSpiderApi = api && (api.isSpider || api.spiderKey || (api.url && api.url.includes('/api/spider')))
        const hasStandardPlayFormat = detail?.videoInfo?.vod_play_from && detail?.videoInfo?.vod_play_url
        
        // 如果有标准播放格式，或者不是爬虫 API，则显示原版选集组件
        return (hasStandardPlayFormat || !isSpiderApi) && currentLineEpisodes.length > 0
      })() && (
        <motion.div
          className="mt-6 overflow-hidden rounded-2xl bg-white/40 shadow-xl shadow-black/5 backdrop-blur-xl dark:bg-white/10"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <div className="border-b border-gray-200/50 p-4 dark:border-gray-700/50">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-1 rounded-full bg-gradient-to-b from-blue-500 to-purple-500" />
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">选集</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    共 {currentLineEpisodes.length} 集
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* 线路切换按钮 */}
                {parseEpisodesByLine.length > 1 && (
                  <Select
                    size="sm"
                    selectedKeys={[String(selectedLineIndex)]}
                    onChange={e => setSelectedLineIndex(Number(e.target.value))}
                    className="w-28"
                    classNames={{
                      trigger: 'bg-gray-100 border-none font-medium dark:bg-gray-700',
                      value: 'text-gray-700 dark:text-gray-200',
                      popoverContent: 'bg-white/90 backdrop-blur-xl border border-gray-200/50 dark:bg-gray-800/90',
                    }}
                    aria-label="选择播放线路"
                  >
                    {parseEpisodesByLine.map((line, index) => (
                      <SelectItem key={String(index)}>{line.name}</SelectItem>
                    ))}
                  </Select>
                )}
                <Button
                  size="sm"
                  variant="flat"
                  onPress={() => setIsReversed(!isReversed)}
                  startContent={
                    isReversed ? <ArrowUpIcon size={16} /> : <ArrowDownIcon size={16} />
                  }
                  className="bg-gray-100 font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                >
                  {isReversed ? '正序' : '倒序'}
                </Button>
                {pageRanges.length > 1 && (
                  <Select
                    size="sm"
                    selectedKeys={[currentPageRange]}
                    onChange={e => setCurrentPageRange(e.target.value)}
                    className="w-28"
                    classNames={{
                      trigger: 'bg-gray-100 border-none font-medium dark:bg-gray-700',
                      value: 'text-gray-700 dark:text-gray-200',
                      popoverContent: 'bg-white/90 backdrop-blur-xl border border-gray-200/50 dark:bg-gray-800/90',
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
          <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
            {currentPageEpisodes.map(({ name, displayIndex }, index) => (
              <motion.div
                key={`${name}-${displayIndex}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  duration: 0.3,
                  delay: index * 0.02,
                  ease: 'easeOut',
                }}
              >
                <Tooltip content={name} placement="top" delay={1000}>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handlePlayEpisode(displayIndex)}
                    className="relative w-full overflow-hidden rounded-xl bg-black px-3 py-2 text-sm font-medium text-white transition-all duration-300 hover:bg-black/80 hover:shadow-md"
                  >
                    <span className="relative z-10 block overflow-hidden text-ellipsis whitespace-nowrap">
                      {name}
                    </span>
                  </motion.button>
                </Tooltip>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}
