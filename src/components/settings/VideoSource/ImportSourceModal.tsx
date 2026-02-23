import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useApiStore } from '@/store/apiStore'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { parseVideoSourceConfig, isTVBoxFormat, getTVBoxSpiderConfig } from '@/utils/tvboxParser'

const getBackendUrl = () => localStorage.getItem('backend_url') || 'http://localhost:8000'

export function URLSourceModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const urlSchema = z.object({
    url: z.string().regex(/^(http|https):\/\/.*\.json$/, '请输入有效的URL,且以.json结尾'),
  })

  type URLSchema = z.infer<typeof urlSchema>
  const { importVideoAPIs } = useApiStore()
  const [isLoading, setIsLoading] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<URLSchema>({
    resolver: zodResolver(urlSchema),
  })

  const onSubmit = async (data: URLSchema) => {
    setIsLoading(true)
    try {
      const response = await fetch(data.url)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const rawData = await response.json()

      const sources = parseVideoSourceConfig(rawData)

      if (isTVBoxFormat(rawData)) {
        const spiderConfigs = getTVBoxSpiderConfig(rawData)
        
        if (spiderConfigs.length > 0) {
          toast.info(`检测到 ${spiderConfigs.length} 个爬虫站点，正在导入...`)
          
          try {
            const importResponse = await fetch(`${getBackendUrl()}/api/tvbox/import`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ config_url: data.url }),
            })
            
            if (importResponse.ok) {
              const importResult = await importResponse.json()
              console.log('爬虫导入结果:', importResult)
              
              if (importResult.import_result?.success?.length > 0) {
                toast.success(`成功导入 ${importResult.import_result.success.length} 个爬虫站点`)
              }
              
              if (importResult.import_result?.failed?.length > 0) {
                toast.warning(`${importResult.import_result.failed.length} 个爬虫站点导入失败`)
              }
              
              if (importResult.import_result?.skipped?.length > 0) {
                toast.info(`${importResult.import_result.skipped.length} 个爬虫站点被跳过（JAR爬虫暂不支持）`)
              }
            } else {
              console.error('后端导入爬虫失败')
              toast.warning('爬虫站点导入失败，请确保后端服务正在运行')
            }
          } catch (backendError) {
            console.error('连接后端失败:', backendError)
            toast.warning('无法连接后端服务，爬虫站点将不会被导入')
          }
        }
      }

      if (sources.length > 0) {
        await importVideoAPIs(sources)
        toast.success(`成功导入 ${sources.length} 个视频源`)
        onOpenChange(false)
        reset()
      } else {
        toast.error('导入失败：未找到有效的视频源')
      }
    } catch (error) {
      console.error('Import error:', error)
      toast.error(`导入失败：${error instanceof Error ? error.message : '请求错误或解析失败'}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-fit bg-white/20 backdrop-blur-md"
        overlayClassName="bg-white/40 backdrop-blur-xs"
      >
        <DialogHeader>
          <DialogTitle>从 URL 导入视频源</DialogTitle>
          <DialogDescription>支持标准格式和 TVBox 格式（js.json）的 JSON 文件</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 pb-6">
            <div className="grid gap-3">
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
                {...register('url')}
                placeholder="https://example.com/source.json"
                className={errors.url ? 'border-red-500' : ''}
              />
              {errors.url && <p className="text-sm text-red-500">{errors.url.message}</p>}
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" onClick={() => reset()}>
                取消
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              导入
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

import { Textarea } from '@/components/ui/textarea'

export function TextSourceModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { importVideoAPIs } = useApiStore()
  const textSchema = z.object({
    content: z.string().refine(
      val => {
        try {
          const parsed = JSON.parse(val)
          // 支持 TVBox 格式或数组格式
          return isTVBoxFormat(parsed) || Array.isArray(parsed)
        } catch {
          return false
        }
      },
      {
        message: '请输入有效的 JSON 格式（支持 TVBox 格式或标准数组格式）',
      },
    ),
  })

  type TextSchema = z.infer<typeof textSchema>

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TextSchema>({
    resolver: zodResolver(textSchema),
  })

  const onSubmit = async (data: TextSchema) => {
    try {
      const rawData = JSON.parse(data.content)

      // 使用通用解析器处理多种格式
      const sources = parseVideoSourceConfig(rawData)

      if (sources.length > 0) {
        await importVideoAPIs(sources)
        toast.success(`成功导入 ${sources.length} 个视频源`)
        onOpenChange(false)
        reset()
      } else {
        toast.error('导入失败：未找到有效的视频源')
      }
    } catch (error) {
      console.error('Import error:', error)
      toast.error(`导入失败：${error instanceof Error ? error.message : '解析错误'}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-fit bg-white/20 backdrop-blur-md"
        overlayClassName="bg-white/40 backdrop-blur-xs"
      >
        <DialogHeader>
          <DialogTitle>从文本导入视频源</DialogTitle>
          <DialogDescription>支持标准格式和 TVBox 格式（js.json）的 JSON 配置</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 pb-6">
            <div className="grid gap-3">
              <Label htmlFor="content">JSON 内容</Label>
              <Textarea
                id="content"
                {...register('content')}
                placeholder='[{"name": "example", "url": "..."}]'
                className={`max-h-50 min-h-50 md:max-h-100 ${errors.content ? 'border-red-500' : ''}`}
              />
              {errors.content && <p className="text-sm text-red-500">{errors.content.message}</p>}
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" onClick={() => reset()}>
                取消
              </Button>
            </DialogClose>
            <Button type="submit">导入</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
