import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Settings, Trash2, Copy, Plus, RefreshCw, Server, Link, ExternalLink, Upload } from 'lucide-react'
import { motion } from 'framer-motion'

interface SpiderInfo {
  key: string
  script_url?: string
  type: 'local' | 'remote'
}

export default function BackendSettings() {
  const [backendUrl, setBackendUrl] = useState('http://localhost:8000')
  const [spiders, setSpiders] = useState<SpiderInfo[]>([])
  const [newSpiderKey, setNewSpiderKey] = useState('')
  const [newSpiderUrl, setNewSpiderUrl] = useState('')
  const [uploadSpiderKey, setUploadSpiderKey] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)

  useEffect(() => {
    const savedUrl = localStorage.getItem('backend_url')
    if (savedUrl) {
      setBackendUrl(savedUrl)
    }
    fetchSpiders()
  }, [])

  const saveBackendUrl = () => {
    localStorage.setItem('backend_url', backendUrl)
    toast.success('后台地址已保存')
    fetchSpiders()
  }

  const fetchSpiders = async () => {
    const url = localStorage.getItem('backend_url') || backendUrl
    try {
      const response = await fetch(`${url}/api/spiders/info`)
      if (response.ok) {
        const data = await response.json()
        const spiderList: SpiderInfo[] = []
        
        data.local_spiders?.forEach((key: string) => {
          spiderList.push({ key, type: 'local' })
        })
        
        Object.entries(data.python_script_spiders || {}).forEach(([key, scriptUrl]) => {
          spiderList.push({ key, script_url: scriptUrl as string, type: 'remote' })
        })
        
        setSpiders(spiderList)
      }
    } catch (error) {
      console.error('获取爬虫列表失败:', error)
    }
  }

  const testConnection = async () => {
    setTestingConnection(true)
    try {
      const response = await fetch(`${backendUrl}/api/spiders/info`, { 
        signal: AbortSignal.timeout(5000) 
      })
      if (response.ok) {
        toast.success('连接成功')
        fetchSpiders()
      } else {
        toast.error('连接失败: ' + response.status)
      }
    } catch (error) {
      toast.error('连接失败: ' + (error instanceof Error ? error.message : '未知错误'))
    } finally {
      setTestingConnection(false)
    }
  }

  const addSpider = async () => {
    if (!newSpiderKey || !newSpiderUrl) {
      toast.error('请填写爬虫ID和脚本URL')
      return
    }

    setLoading(true)
    const url = localStorage.getItem('backend_url') || backendUrl
    try {
      const response = await fetch(`${url}/api/spiders/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: newSpiderKey, script_url: newSpiderUrl }),
        signal: AbortSignal.timeout(120000)
      })

      const result = await response.json()
      
      if (response.ok) {
        toast.success(`爬虫 ${newSpiderKey} 添加成功`)
        setNewSpiderKey('')
        setNewSpiderUrl('')
        fetchSpiders()
      } else {
        toast.error(result.detail || '添加失败')
      }
    } catch (error) {
      toast.error('添加失败: ' + (error instanceof Error ? error.message : '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  const uploadSpider = async () => {
    if (!uploadSpiderKey || !uploadFile) {
      toast.error('请填写爬虫ID并选择文件')
      return
    }

    if (!uploadFile.name.endsWith('.py')) {
      toast.error('请选择 Python 脚本文件 (.py)')
      return
    }

    setUploading(true)
    const url = localStorage.getItem('backend_url') || backendUrl
    try {
      const formData = new FormData()
      formData.append('file', uploadFile)
      
      const response = await fetch(`${url}/api/spiders/upload?key=${uploadSpiderKey}`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(120000)
      })

      const result = await response.json()
      
      if (response.ok) {
        toast.success(`爬虫 ${uploadSpiderKey} 上传并加载成功`)
        setUploadSpiderKey('')
        setUploadFile(null)
        fetchSpiders()
      } else {
        toast.error(result.detail || '上传失败')
      }
    } catch (error) {
      toast.error('上传失败: ' + (error instanceof Error ? error.message : '未知错误'))
    } finally {
      setUploading(false)
    }
  }

  const removeSpider = async (key: string) => {
    const url = localStorage.getItem('backend_url') || backendUrl
    try {
      const response = await fetch(`${url}/api/spiders/${key}`, { method: 'DELETE' })
      if (response.ok) {
        toast.success(`爬虫 ${key} 已移除`)
        fetchSpiders()
      } else {
        toast.error('移除失败')
      }
    } catch (error) {
      toast.error('移除失败')
    }
  }

  const copyUrl = (key: string) => {
    const url = localStorage.getItem('backend_url') || backendUrl
    const spiderUrl = `${url}/api/spider/${key}`
    navigator.clipboard.writeText(spiderUrl)
    toast.success('URL已复制')
  }

  const getSpiderUrl = (key: string) => {
    const url = localStorage.getItem('backend_url') || backendUrl
    return `${url}/api/spider/${key}`
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white/40 p-6 shadow-xl shadow-black/5 backdrop-blur-xl dark:bg-gray-900/80">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-white">
          <Server size={20} className="text-blue-500 dark:text-red-400" />
          后台服务配置
        </h3>
        
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-600 dark:text-gray-300">
              后台服务地址
            </label>
            <div className="flex gap-2">
              <Input
                value={backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
                placeholder="http://localhost:8000 或 https://your-domain.com"
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={testConnection}
                disabled={testingConnection}
                className="shrink-0"
              >
                {testingConnection ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  '测试连接'
                )}
              </Button>
              <Button onClick={saveBackendUrl} className="shrink-0">
                保存
              </Button>
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              本地开发使用 http://localhost:8000，部署后使用实际域名
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white/40 p-6 shadow-xl shadow-black/5 backdrop-blur-xl dark:bg-gray-900/80">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-white">
          <Plus size={20} className="text-green-500 dark:text-red-400" />
          添加远程爬虫脚本
        </h3>
        
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-600 dark:text-gray-300">
                爬虫ID（英文）
              </label>
              <Input
                value={newSpiderKey}
                onChange={(e) => setNewSpiderKey(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                placeholder="例如: wawa, xiaohong"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-600 dark:text-gray-300">
                脚本URL
              </label>
              <Input
                value={newSpiderUrl}
                onChange={(e) => setNewSpiderUrl(e.target.value)}
                placeholder="https://example.com/spider.py"
              />
            </div>
          </div>
          
          <Button 
            onClick={addSpider} 
            disabled={loading || !newSpiderKey || !newSpiderUrl}
            className="w-full md:w-auto"
          >
            {loading ? (
              <>
                <RefreshCw size={16} className="mr-2 animate-spin" />
                加载中...
              </>
            ) : (
              <>
                <Plus size={16} className="mr-2" />
                加载脚本
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl bg-white/40 p-6 shadow-xl shadow-black/5 backdrop-blur-xl dark:bg-gray-900/80">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-white">
          <Upload size={20} className="text-orange-500 dark:text-red-400" />
          上传本地Python脚本
        </h3>
        
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-600 dark:text-gray-300">
                爬虫ID（英文）
              </label>
              <Input
                value={uploadSpiderKey}
                onChange={(e) => setUploadSpiderKey(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                placeholder="例如: wawa, xiaohong"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-600 dark:text-gray-300">
                Python脚本文件
              </label>
              <Input
                type="file"
                accept=".py"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    setUploadFile(file)
                  }
                }}
                className="cursor-pointer"
              />
              {uploadFile && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  已选择: {uploadFile.name}
                </p>
              )}
            </div>
          </div>
          
          <Button 
            onClick={uploadSpider} 
            disabled={uploading || !uploadSpiderKey || !uploadFile}
            className="w-full md:w-auto"
          >
            {uploading ? (
              <>
                <RefreshCw size={16} className="mr-2 animate-spin" />
                上传中...
              </>
            ) : (
              <>
                <Upload size={16} className="mr-2" />
                上传脚本
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl bg-white/40 p-6 shadow-xl shadow-black/5 backdrop-blur-xl dark:bg-gray-900/80">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-white">
            <Settings size={20} className="text-purple-500 dark:text-red-400" />
            已加载爬虫 ({spiders.length})
          </h3>
          <Button variant="ghost" size="sm" onClick={fetchSpiders}>
            <RefreshCw size={16} />
          </Button>
        </div>

        {spiders.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-gray-400 py-8">
            暂无爬虫，请先添加
          </p>
        ) : (
          <div className="space-y-3">
            {spiders.map((spider) => (
              <motion.div
                key={spider.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between rounded-xl bg-gray-100/50 p-4 dark:bg-gray-800/50"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800 dark:text-white">
                      {spider.key}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      spider.type === 'local' 
                        ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                    }`}>
                      {spider.type === 'local' ? '本地' : '远程'}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <Link size={14} className="text-gray-400" />
                    <code className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {getSpiderUrl(spider.key)}
                    </code>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyUrl(spider.key)}
                    title="复制URL"
                  >
                    <Copy size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(`${getSpiderUrl(spider.key)}/home`, '_blank')}
                    title="测试"
                  >
                    <ExternalLink size={16} />
                  </Button>
                  {spider.type === 'remote' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSpider(spider.key)}
                      className="text-red-500 hover:text-red-600"
                      title="删除"
                    >
                      <Trash2 size={16} />
                    </Button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-white/40 p-6 shadow-xl shadow-black/5 backdrop-blur-xl dark:bg-gray-900/80">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-white">
          <Link size={20} className="text-orange-500 dark:text-red-400" />
          使用说明
        </h3>
        
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
          <p>1. 配置后台服务地址并保存</p>
          <p>2. 添加远程Python爬虫脚本（支持TVBox Spider格式）</p>
          <p>3. 上传本地Python脚本文件（.py格式）</p>
          <p>4. 复制生成的URL，在「视频源管理」中添加新视频源</p>
          <p>5. URL格式：<code className="rounded bg-gray-200 px-1 dark:bg-gray-700">{'{后台地址}/api/spider/{爬虫ID}'}</code></p>
          
          <div className="mt-4 rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
            <p className="font-medium text-blue-700 dark:text-blue-300">示例配置：</p>
            <ul className="mt-2 space-y-1 text-blue-600 dark:text-blue-400">
              <li>• 本地: <code>http://localhost:8000/api/spider/wawa</code></li>
              <li>• 远程: <code>https://your-domain.com/api/spider/wawa</code></li>
            </ul>
          </div>
          
          <div className="mt-4 rounded-lg bg-orange-50 p-3 dark:bg-orange-900/20">
            <p className="font-medium text-orange-700 dark:text-orange-300">注意事项：</p>
            <ul className="mt-2 space-y-1 text-orange-600 dark:text-orange-400">
              <li>• 上传的脚本会保存到后台服务器的 <code>app/spiders/</code> 目录</li>
              <li>• 脚本必须符合 TVBox Spider 格式规范</li>
              <li>• 脚本文件名会自动设置为 <code>{'{爬虫ID}.py'}</code></li>
              <li>• 上传后会自动加载并测试脚本</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
