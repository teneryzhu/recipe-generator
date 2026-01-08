import React, { useEffect, useState, useRef, useCallback } from 'react'

// 系统提示词：免疫与功能医学营养专家角色
const SYSTEM_PROMPT = `
你是一位拥有20年经验的资深营养师，专精于通过饮食干预改善过敏体质、湿疹、荨麻疹、鼻炎及肠漏综合征。
你善于通过“排除饮食法”和“抗炎饮食”帮助用户修复免疫系统。

【目标】
1. 深度共情，安抚用户情绪并建立信任；
2. 基于用户提供的碎片化信息（症状、环境、情绪）进行全息分析；
3. 生成严格回避过敏源、富含修复营养素的 2 天定制食谱；
4. 提供详细的食材用量和简便的烹饪步骤。

【绝对准则】
- 安全第一：必须严格检查用户提供的过敏源，在任何饮食建议和食谱中绝对禁止出现，并考虑潜在交叉过敏；
- 每次输出结果时，在文末附带标准医疗免责声明；
- 饮食原则：优先推荐低组胺、抗炎、低糖、无深加工食品的天然食材；
- 语气：专业、温暖、治愈、鼓励性。
`.trim()

const INITIAL_GREETING = `
你好！我是你的专属免疫营养专家。我知道被过敏和炎症困扰非常难受，但请相信，通过正确的饮食和生活调整，我们能慢慢修复身体的防线。

为了为你制定最精准、有效的方案，我需要你做我的“战友”。请尽可能多地告诉我你的情况，哪怕是细微的感受。

你可以跟我聊聊：
1. 你最想解决的痛苦症状是什么？
2. 你知道自己对哪些东西过敏？
3. 最近的睡眠、压力、消化情况怎么样？（因为肠道和情绪是免疫系统的基石）
4. 或者任何你觉得奇怪的身体反应...

请放心大胆地告诉我，我会认真分析每一个字。`.trim()

const STORAGE_KEY_MESSAGES = 'immune_chat_messages_v1'
const STORAGE_KEY_MEAL_PLAN_RAW = 'immune_meal_plan_raw_v1'
const STORAGE_KEY_MEAL_PLAN_STRUCTURED = 'immune_meal_plan_structured_v1'

// Markdown 渲染：支持标题、列表、分隔线、加粗、斜体等
function renderMarkdown(text) {
  if (!text) return null

  const lines = String(text).split('\n')
  const elements = []

  // 处理每一行
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmedLine = line.trim()

    // 分隔线：--- 或 ***
    if (trimmedLine === '---' || trimmedLine === '***' || /^[-*_]{3,}$/.test(trimmedLine)) {
      elements.push(
        <hr key={`hr-${i}`} className="my-3 border-gray-300" />
      )
      continue
    }

    // 标题：### / ## / #
    if (trimmedLine.startsWith('### ')) {
      const titleText = trimmedLine.replace(/^###\s+/, '')
      elements.push(
        <h3 key={`h3-${i}`} className="text-base md:text-lg font-semibold text-gray-900 mt-3 mb-2">
          {renderInlineMarkdown(titleText)}
        </h3>
      )
      continue
    }
    if (trimmedLine.startsWith('## ')) {
      const titleText = trimmedLine.replace(/^##\s+/, '')
      elements.push(
        <h2 key={`h2-${i}`} className="text-lg md:text-xl font-semibold text-gray-900 mt-4 mb-2">
          {renderInlineMarkdown(titleText)}
        </h2>
      )
      continue
    }
    if (trimmedLine.startsWith('# ')) {
      const titleText = trimmedLine.replace(/^#\s+/, '')
      elements.push(
        <h1 key={`h1-${i}`} className="text-xl md:text-2xl font-bold text-gray-900 mt-4 mb-3">
          {renderInlineMarkdown(titleText)}
        </h1>
      )
      continue
    }

    // 无序列表：- 或 * 开头
    if (/^[-*]\s+/.test(trimmedLine)) {
      const listItems = []
      let j = i
      while (j < lines.length && /^[-*]\s+/.test(lines[j].trim())) {
        const itemText = lines[j].trim().replace(/^[-*]\s+/, '')
        listItems.push(
          <li key={`li-${j}`} className="ml-4 mb-1">
            {renderInlineMarkdown(itemText)}
          </li>
        )
        j++
      }
      if (listItems.length > 0) {
        elements.push(
          <ul key={`ul-${i}`} className="list-disc list-inside my-2 space-y-1">
            {listItems}
          </ul>
        )
        i = j - 1 // 跳过已处理的列表项
        continue
      }
    }

    // 有序列表：1. 或 1) 开头
    if (/^\d+[.)]\s+/.test(trimmedLine)) {
      const listItems = []
      let j = i
      while (j < lines.length && /^\d+[.)]\s+/.test(lines[j].trim())) {
        const itemText = lines[j].trim().replace(/^\d+[.)]\s+/, '')
        listItems.push(
          <li key={`li-${j}`} className="ml-4 mb-1">
            {renderInlineMarkdown(itemText)}
          </li>
        )
        j++
      }
      if (listItems.length > 0) {
        elements.push(
          <ol key={`ol-${i}`} className="list-decimal list-inside my-2 space-y-1">
            {listItems}
          </ol>
        )
        i = j - 1 // 跳过已处理的列表项
        continue
      }
    }

    // 普通文本行
    if (trimmedLine) {
      elements.push(
        <p key={`p-${i}`} className="mb-2">
          {renderInlineMarkdown(line)}
        </p>
      )
    } else {
      // 空行
      elements.push(<br key={`br-${i}`} />)
    }
  }

  return <div className="markdown-content">{elements}</div>
}

// 渲染行内 Markdown：加粗、斜体、行内代码
function renderInlineMarkdown(text) {
  if (!text) return null

  // 先处理加粗 **text**，再处理斜体 *text* 或 _text_
  const parts = []
  let lastIndex = 0
  let inBold = false
  let inItalic = false

  // 处理加粗 **text**
  const boldRegex = /\*\*([^*]+)\*\*/g
  const boldMatches = []
  let match
  while ((match = boldRegex.exec(text)) !== null) {
    boldMatches.push({
      start: match.index,
      end: match.index + match[0].length,
      content: match[1],
      type: 'bold',
    })
  }

  // 处理斜体 *text* (不在 ** 内部)
  const italicRegex = /(?<!\*)\*([^*]+)\*(?!\*)/g
  const italicMatches = []
  while ((match = italicRegex.exec(text)) !== null) {
    // 检查是否在加粗内部
    const isInsideBold = boldMatches.some(
      (b) => match.index >= b.start && match.index < b.end,
    )
    if (!isInsideBold) {
      italicMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        content: match[1],
        type: 'italic',
      })
    }
  }

  // 处理行内代码 `code`
  const codeRegex = /`([^`]+)`/g
  const codeMatches = []
  while ((match = codeRegex.exec(text)) !== null) {
    codeMatches.push({
      start: match.index,
      end: match.index + match[0].length,
      content: match[1],
      type: 'code',
    })
  }

  // 合并所有匹配并按位置排序
  const allMatches = [...boldMatches, ...italicMatches, ...codeMatches].sort(
    (a, b) => a.start - b.start,
  )

  // 构建渲染结果
  const result = []
  let currentIndex = 0

  for (const match of allMatches) {
    // 添加匹配前的文本
    if (match.start > currentIndex) {
      result.push(text.slice(currentIndex, match.start))
    }

    // 添加匹配的内容
    if (match.type === 'bold') {
      result.push(
        <strong key={`bold-${match.start}`} className="font-semibold">
          {match.content}
        </strong>,
      )
    } else if (match.type === 'italic') {
      result.push(
        <em key={`italic-${match.start}`} className="italic">
          {match.content}
        </em>,
      )
    } else if (match.type === 'code') {
      result.push(
        <code
          key={`code-${match.start}`}
          className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono"
        >
          {match.content}
        </code>,
      )
    }

    currentIndex = match.end
  }

  // 添加剩余文本
  if (currentIndex < text.length) {
    result.push(text.slice(currentIndex))
  }

  return result.length > 0 ? <>{result}</> : text
}

// 解析食谱文本，去掉可能的代码块并尝试解析 JSON
function parseMealPlanText(planText) {
  if (!planText) return null
  let cleaned = planText.trim()

  // 方法1：去掉常见的 ```json ... ``` 代码块包装
  if (cleaned.includes('```')) {
    const jsonMatch = cleaned.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
    if (jsonMatch && jsonMatch[1]) {
      cleaned = jsonMatch[1].trim()
    } else {
      // 如果没有匹配到，尝试找到第一个 { 和最后一个 }
      const firstBrace = cleaned.indexOf('{')
      const lastBrace = cleaned.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1).trim()
      }
    }
  }

  // 方法2：如果还没有找到 JSON，尝试用正则表达式提取 JSON 对象
  if (!cleaned.startsWith('{')) {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      cleaned = jsonMatch[0].trim()
    }
  }

  // 方法3：尝试直接解析（可能已经是纯 JSON）
  try {
    const parsed = JSON.parse(cleaned)
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.days)) {
      return parsed
    }
  } catch (e) {
    // 如果直接解析失败，尝试更激进的清理
    // 移除可能的 Markdown 格式标记
    cleaned = cleaned
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/, '')
      .replace(/\s*```$/, '')
      .trim()

    // 再次尝试解析
    try {
      const parsed = JSON.parse(cleaned)
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.days)) {
        return parsed
      }
    } catch {
      // 最后尝试：查找最长的有效 JSON 子串
      let jsonStart = -1
      let braceCount = 0
      let bestStart = -1
      let bestEnd = -1

      for (let i = 0; i < planText.length; i++) {
        if (planText[i] === '{') {
          if (jsonStart === -1) {
            jsonStart = i
            braceCount = 1
          } else {
            braceCount++
          }
        } else if (planText[i] === '}') {
          braceCount--
          if (braceCount === 0 && jsonStart !== -1) {
            if (bestEnd - bestStart < i - jsonStart) {
              bestStart = jsonStart
              bestEnd = i
            }
            jsonStart = -1
          }
        }
      }

      if (bestStart !== -1 && bestEnd !== -1) {
        try {
          const extracted = planText.slice(bestStart, bestEnd + 1)
          const parsed = JSON.parse(extracted)
          if (parsed && typeof parsed === 'object' && Array.isArray(parsed.days)) {
            return parsed
          }
        } catch {
          // 所有方法都失败了
        }
      }
    }
  }

  return null
}

// 调用 DeepSeek Chat 的封装（OpenAI 风格兼容接口）
async function callChatCompletion({ messages, signal }) {
  const apiKey =
    import.meta.env.VITE_OPENAI_API_KEY ||
    import.meta.env.VITE_DEEPSEEK_API_KEY

  if (!apiKey || apiKey.trim() === '') {
    console.error('API Key 未配置')
    throw new Error(
      '缺少 DeepSeek API Key。\n\n' +
      '请在项目根目录的 .env.local 文件中配置：\n' +
      'VITE_OPENAI_API_KEY=你的_API_Key\n\n' +
      '或\n\n' +
      'VITE_DEEPSEEK_API_KEY=你的_API_Key\n\n' +
      '配置后请重启开发服务器。'
    )
  }

  const model =
    import.meta.env.VITE_OPENAI_MODEL ||
    import.meta.env.VITE_DEEPSEEK_MODEL ||
    'deepseek-chat'

  const baseUrl =
    import.meta.env.VITE_OPENAI_BASE_URL ||
    import.meta.env.VITE_DEEPSEEK_BASE_URL ||
    'https://api.deepseek.com/v1'

  // 为了加快响应速度，限制每次发送给大模型的对话长度（只保留最近若干条）
  const MAX_HISTORY_MESSAGES = 16
  const recentMessages =
    messages.length > MAX_HISTORY_MESSAGES
      ? messages.slice(messages.length - MAX_HISTORY_MESSAGES)
      : messages

  const payload = {
    model,
    temperature: 0.7,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...recentMessages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    ],
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      let msg = `DeepSeek API 错误：${response.status}`
      if (text) {
        try {
          const errorJson = JSON.parse(text)
          msg += ` - ${errorJson.error?.message || text}`
        } catch {
          msg += ` - ${text}`
        }
      }
      console.error('API 调用失败:', response.status, msg)
      throw new Error(msg)
    }

    const data = await response.json()
    
    if (!data || !data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      console.error('API 响应格式异常:', data)
      throw new Error('API 返回的数据格式不正确，请稍后重试。')
    }

    const content =
      data.choices[0]?.message?.content?.trim() ||
      '抱歉，我这边暂时没有生成出合适的回复，请稍后再试一次。'

    if (!content || content.length === 0) {
      console.error('API 返回内容为空:', data)
      throw new Error('API 返回的内容为空，请稍后重试。')
    }

    return content
  } catch (error) {
    // 处理网络错误、超时等
    if (error.name === 'AbortError') {
      throw new Error('请求已取消')
    }
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      console.error('网络连接失败:', error)
      throw new Error(
        '网络连接失败。请检查：\n' +
        '1. 网络连接是否正常\n' +
        '2. API Key 是否正确配置\n' +
        '3. 是否使用了代理或 VPN\n\n' +
        '详细错误：' + error.message
      )
    }
    // 重新抛出其他错误
    throw error
  }
}

// 流式调用 DeepSeek Chat（用于聊天，实时显示回复）
async function callChatCompletionStream({ messages, signal, onChunk }) {
  const apiKey =
    import.meta.env.VITE_OPENAI_API_KEY ||
    import.meta.env.VITE_DEEPSEEK_API_KEY

  if (!apiKey || apiKey.trim() === '') {
    throw new Error('缺少 DeepSeek API Key，请检查 .env.local 配置。')
  }

  const model =
    import.meta.env.VITE_OPENAI_MODEL ||
    import.meta.env.VITE_DEEPSEEK_MODEL ||
    'deepseek-chat'

  const baseUrl =
    import.meta.env.VITE_OPENAI_BASE_URL ||
    import.meta.env.VITE_DEEPSEEK_BASE_URL ||
    'https://api.deepseek.com/v1'

  const MAX_HISTORY_MESSAGES = 16
  const recentMessages =
    messages.length > MAX_HISTORY_MESSAGES
      ? messages.slice(messages.length - MAX_HISTORY_MESSAGES)
      : messages

  const payload = {
    model,
    temperature: 0.7,
    stream: true, // 启用流式输出
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...recentMessages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    ],
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    let msg = `DeepSeek API 错误：${response.status}`
    if (text) {
      try {
        const errorJson = JSON.parse(text)
        msg += ` - ${errorJson.error?.message || text}`
      } catch {
        msg += ` - ${text}`
      }
    }
    throw new Error(msg)
  }

  // 读取 SSE 流
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let fullContent = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // 按行分割，处理 SSE 格式
    const lines = buffer.split('\n')
    buffer = lines.pop() || '' // 保留最后一个可能不完整的行

    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine || !trimmedLine.startsWith('data:')) continue

      const dataStr = trimmedLine.slice(5).trim()
      if (dataStr === '[DONE]') {
        // 流结束
        break
      }

      try {
        const data = JSON.parse(dataStr)
        const delta = data.choices?.[0]?.delta?.content
        if (delta) {
          fullContent += delta
          // 调用回调，实时更新内容
          if (onChunk) {
            onChunk(fullContent)
          }
        }
      } catch {
        // 忽略解析错误
      }
    }
  }

  return fullContent || '抱歉，我这边暂时没有生成出合适的回复，请稍后再试一次。'
}

function RecipeGenerator() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loadingChat, setLoadingChat] = useState(false)
  const [loadingPlan, setLoadingPlan] = useState(false)
  const [mealPlanRaw, setMealPlanRaw] = useState('')
  const [mealPlanStructured, setMealPlanStructured] = useState(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('') // Toast 提示

  // 聊天容器和滚动状态
  const chatContainerRef = useRef(null)
  const isUserScrollingRef = useRef(false) // 用户是否正在向上滚动查看历史
  const lastScrollTopRef = useRef(0)
  const scrollTimeoutRef = useRef(null) // 滚动防抖定时器

  // 检测用户是否在底部附近（允许 100px 的误差，更宽松）
  const isNearBottom = useCallback(() => {
    const container = chatContainerRef.current
    if (!container) return true
    const threshold = 100 // 增大阈值，更宽松
    return container.scrollHeight - container.scrollTop - container.clientHeight <= threshold
  }, [])

  // 强制滚动到底部（用户发送消息时使用）
  const forceScrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const container = chatContainerRef.current
      if (!container) return
      container.scrollTop = container.scrollHeight
      // 重置滚动状态，因为用户刚发送了消息，应该跟随新内容
      isUserScrollingRef.current = false
      lastScrollTopRef.current = container.scrollTop
    })
  }, [])

  // 智能滚动：只有当用户在底部附近时才自动滚动（流式输出时使用）
  const smartScrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const container = chatContainerRef.current
      if (!container) return
      
      // 如果用户正在向上滚动查看历史，不打扰
      if (isUserScrollingRef.current) return
      
      // 如果用户已经在底部附近，自动滚动到底部
      if (isNearBottom()) {
        container.scrollTop = container.scrollHeight
      }
    })
  }, [isNearBottom])

  // 监听用户滚动行为（参考 DeepSeek/ChatGPT 的逻辑）
  const handleScroll = useCallback(() => {
    const container = chatContainerRef.current
    if (!container) return
    
    const currentScrollTop = container.scrollTop
    const scrollDelta = currentScrollTop - lastScrollTopRef.current
    
    // 清除之前的定时器
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }
    
    // 如果用户明显向上滚动（超过 10px），标记为正在查看历史
    if (scrollDelta < -10) {
      isUserScrollingRef.current = true
    }
    
    // 如果用户滚动到底部附近，立即取消"正在查看历史"标记
    if (isNearBottom()) {
      isUserScrollingRef.current = false
    }
    
    // 使用防抖：如果用户停止滚动 150ms 后仍在底部附近，恢复自动跟随
    scrollTimeoutRef.current = setTimeout(() => {
      if (isNearBottom()) {
        isUserScrollingRef.current = false
      }
    }, 150)
    
    lastScrollTopRef.current = currentScrollTop
  }, [isNearBottom])

  // 消息变化时智能滚动
  useEffect(() => {
    smartScrollToBottom()
  }, [messages, smartScrollToBottom])

  // Toast 自动消失
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(''), 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  // 首次加载时，从本地存储恢复聊天记录和食谱
  useEffect(() => {
    try {
      const savedMessages = localStorage.getItem(STORAGE_KEY_MESSAGES)

      if (savedMessages) {
        const parsed = JSON.parse(savedMessages)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed)
        } else {
          setMessages([{ role: 'assistant', content: INITIAL_GREETING }])
        }
      } else {
        setMessages([{ role: 'assistant', content: INITIAL_GREETING }])
      }
    } catch {
      setMessages([{ role: 'assistant', content: INITIAL_GREETING }])
    }
  }, [])

  // 不自动滚动：用户阅读时不干扰体验
  // 如果需要手动滚动到底部，可以点击一个按钮（可选后续添加）

  // 每次聊天或食谱变化时写入本地存储
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages))
      localStorage.setItem(STORAGE_KEY_MEAL_PLAN_RAW, mealPlanRaw || '')
      if (mealPlanStructured) {
        localStorage.setItem(
          STORAGE_KEY_MEAL_PLAN_STRUCTURED,
          JSON.stringify(mealPlanStructured),
        )
      } else {
        localStorage.removeItem(STORAGE_KEY_MEAL_PLAN_STRUCTURED)
      }
    } catch {
      // ignore
    }
  }, [messages, mealPlanRaw, mealPlanStructured])

  const handleSend = async () => {
    if (!input.trim() || loadingChat || loadingPlan) return

    const userMessage = input.trim()
    // 先添加用户消息，再添加一个空的助手消息用于流式填充
    const newMessages = [
      ...messages,
      { role: 'user', content: userMessage },
    ]
    // 创建一个占位的助手消息，内容会在流式输出时逐步填充
    const messagesWithPlaceholder = [
      ...newMessages,
      { role: 'assistant', content: '' },
    ]
    
    setMessages(messagesWithPlaceholder)
    setInput('')
    setError('')

    // 用户发送消息后，立即滚动到底部
    forceScrollToBottom()

    const controller = new AbortController()
    setLoadingChat(true)
    
    try {
      console.log('开始流式调用大模型，消息数量:', newMessages.length)
      
      // 使用流式输出，实时更新最后一条助手消息
      const reply = await callChatCompletionStream({
        messages: newMessages,
        signal: controller.signal,
        onChunk: (partialContent) => {
          // 实时更新最后一条消息的内容
          setMessages((prev) => {
            const updated = [...prev]
            if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                content: partialContent,
              }
            }
            return updated
          })
          // 流式输出时也触发智能滚动
          smartScrollToBottom()
        },
      })
      
      // 流式输出结束，确保最终内容已设置
      if (!reply || reply.trim().length === 0) {
        throw new Error('大模型返回了空内容，请稍后重试。')
      }
      
      console.log('大模型流式回复完成，长度:', reply.length)
    } catch (e) {
      console.error('发送消息时出错:', e)
      
      const errorMessage = e instanceof Error 
        ? e.message 
        : '与大模型通信时出错，请稍后再试或检查网络/配置。'
      
      setError(errorMessage)
      
      // 更新占位的助手消息为错误提示
      setMessages((prev) => {
        const updated = [...prev]
        if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
          updated[updated.length - 1] = {
            role: 'assistant',
            content: `❌ 抱歉，我暂时无法回复。错误信息：${errorMessage}\n\n请检查网络连接或稍后重试。`,
          }
        }
        return updated
      })
    } finally {
      setLoadingChat(false)
    }
  }

  const handleGenerateMealPlan = async () => {
    if (loadingChat || loadingPlan) return

    setError('')
    setLoadingPlan(true)

    const planRequestMessages = [
      ...messages,
      {
        role: 'user',
        content: `
基于以上对话内容，请你以“免疫与功能医学营养专家”的身份，生成【2天抗炎修复食谱】的结构化 JSON 数据。

请严格按照下面的 JSON 结构输出，**只输出 JSON，不要添加任何多余解释或文字**：

{
  "days": [
    {
      "day": 1,
      "title": "第1天：简短主题，例如 低组胺修复起步",
      "meals": [
        {
          "type": "早餐",
          "name": "餐名，例如：蓝莓奇亚籽燕麦粥",
          "servings": "1人份",
          "ingredients": [
            { "name": "无麸质燕麦片", "amount": "40g" },
            { "name": "蓝莓（新鲜）", "amount": "50g" }
          ],
          "steps": [
            "步骤 1 ……",
            "步骤 2 ……"
          ],
          "effects": [
            "燕麦提供可溶性膳食纤维，有助于稳定血糖和肠道菌群。",
            "蓝莓富含花青素，具抗氧化、抗炎作用。"
          ]
        }
      ]
    }
  ],
  "disclaimer": "在此填写标准医疗免责说明，例如：本食谱仅作一般性营养建议，不能替代正规医疗诊断和个体化治疗方案，如有严重或持续症状，请及时就医。"
}

要求：
1. 严格避开用户在对话中提到的全部过敏源，并考虑可能的交叉过敏；
2. 整体饮食原则：低组胺、抗炎、低糖、无深加工食品；
3. 每天至少包含早餐、午餐、晚餐，必要时可额外给出 1–2 个加餐建议；
4. "disclaimer" 字段务必填写标准医疗免责声明。`,
      },
    ]

    const controller = new AbortController()
    try {
      const planText = await callChatCompletion({
        messages: planRequestMessages,
        signal: controller.signal,
      })
      // 优先尝试解析为结构化 JSON
      const structured = parseMealPlanText(planText)
      
      // 调试信息：输出到控制台
      if (!structured) {
        console.warn('食谱 JSON 解析失败，原始文本：', planText)
        console.warn('尝试手动解析...')
      } else {
        console.log('食谱 JSON 解析成功：', structured)
      }

      setMealPlanRaw(planText)
      setMealPlanStructured(
        structured && Array.isArray(structured.days) ? structured : null,
      )
      
      // 对话中不直接展示 JSON；仅提示已生成（不触发滚动，不加消息到对话）
      if (structured && Array.isArray(structured.days)) {
        // 成功生成，显示 toast 提示
        setError('')
        setToast('食谱生成完成！请向下滚动查看您的 2 天抗炎修复食谱。')
      } else {
        // 如果解析失败，提示用户
        setError('食谱生成成功，但格式解析失败。请查看下方原始内容，或尝试重新生成。')
      }
    } catch (e) {
      console.error(e)
      setError(
        e instanceof Error
          ? e.message
          : '生成食谱时出错，请稍后再试或检查网络/配置。',
      )
    } finally {
      setLoadingPlan(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl relative">
      {/* Toast 提示 */}
      {toast && (
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 transition-opacity duration-300 opacity-100">
          <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-6 py-3 rounded-lg shadow-xl max-w-md border border-emerald-400">
            <span className="text-sm md:text-base font-medium">{toast}</span>
          </div>
        </div>
      )}

      {/* 头部 */}
      <header className="text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-bold text-primary-600 mb-4">
          🩺 免疫营养聊天顾问 & 过敏食谱生成器
        </h1>
        <p className="text-gray-600 text-base md:text-lg max-w-2xl mx-auto">
          先和你的专属免疫营养专家好好聊一聊，深入了解你的症状和生活习惯，再为你定制安全、抗炎、2天修复食谱。
        </p>
      </header>

      {/* 聊天 + 操作区 */}
      <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8 mb-8">
        {/* 聊天记录 */}
        <div
          ref={chatContainerRef}
          onScroll={handleScroll}
          className="h-[360px] md:h-[420px] overflow-y-auto pr-2 mb-4 space-y-4"
        >
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex ${
                m.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm md:text-base leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-primary-500 text-white rounded-br-sm shadow-md'
                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                }`}
              >
                {m.role === 'assistant' ? renderMarkdown(m.content) : m.content}
              </div>
            </div>
          ))}
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
            {error}
          </div>
        )}

        {/* 输入与按钮 */}
        <div className="space-y-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="把你现在最困扰的症状、过敏史、饮食习惯、睡眠和压力情况，尽量详细地告诉我……"
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:outline-none resize-none text-sm md:text-base"
            rows="3"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
          />

          <div className="flex flex-col md:flex-row gap-3">
            <button
              onClick={handleSend}
              disabled={loadingChat || loadingPlan || !input.trim()}
              className="flex-1 bg-gradient-to-r from-primary-500 to-primary-600 text-white py-3 rounded-xl font-semibold text-base shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loadingChat ? '正在与营养专家沟通中…' : '发送给营养专家'}
            </button>
            <button
              onClick={handleGenerateMealPlan}
              disabled={loadingChat || loadingPlan || messages.length <= 1}
              className="flex-1 bg-emerald-500 text-white py-3 rounded-xl font-semibold text-base shadow-lg hover:bg-emerald-600 hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingPlan ? '正在为你定制 2 天食谱…' : '✨ 根据当前对话生成 2 天修复食谱'}
            </button>
          </div>

          {loadingPlan && (
            <div className="mt-2 text-xs md:text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 flex items-start gap-2">
              <span className="mt-[2px]">⏳</span>
              <span>
                正在根据你刚才的详细描述生成 <span className="font-semibold">2 天抗炎修复食谱</span>，
                这可能需要 <span className="font-semibold">1 分钟左右</span>。在此期间你可以先浏览上方聊天内容，
                食谱生成完成后会自动出现在下方卡片区域。
              </span>
            </div>
          )}

          <p className="text-xs text-gray-400">
            小提示：你提供的细节越多（例如发作时间、加重诱因、具体食物、排便/睡眠/情绪变化等），大模型能做出的分析和食谱就越精准。
          </p>
        </div>
      </div>

      {/* 生成的 7 天食谱展示 */}
      {(mealPlanStructured || mealPlanRaw) && (
        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8 animate-fadeIn">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-4">
            📅 你的 2 天抗炎修复食谱
          </h2>
          <p className="text-gray-500 text-sm mb-4">
            以下内容由免疫与功能医学营养专家大模型根据你刚才的描述生成，请务必结合自身情况和专业医生建议进行选择和调整。
          </p>
          {mealPlanStructured && Array.isArray(mealPlanStructured.days) ? (
            <div className="space-y-6">
              {mealPlanStructured.days.map((day) => (
                <div
                  key={day.day}
                  className="border rounded-xl bg-gradient-to-br from-orange-50 via-white to-emerald-50 px-4 py-4 md:px-6 md:py-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="text-sm font-semibold text-primary-500">
                        第 {day.day} 天
                      </div>
                      <div className="text-lg md:text-xl font-bold text-gray-800">
                        {day.title || `第 ${day.day} 天修复食谱`}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 mt-2">
                    {Array.isArray(day.meals) &&
                      day.meals.map((meal, idx) => (
                        <div
                          key={`${day.day}-${idx}-${meal.type || '餐'}`}
                          className="bg-white/70 rounded-lg border border-orange-100 px-3 py-3 md:px-4 md:py-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-100 text-primary-700">
                                {meal.type || '餐食'}
                              </span>
                              <span className="font-semibold text-gray-800 text-sm md:text-base">
                                {meal.name}
                              </span>
                            </div>
                            {meal.servings && (
                              <span className="text-xs text-gray-500">
                                适用：{meal.servings}
                              </span>
                            )}
                          </div>

                          {Array.isArray(meal.ingredients) &&
                            meal.ingredients.length > 0 && (
                              <div className="mb-2">
                                <div className="text-xs font-semibold text-gray-600 mb-1">
                                  食材与用量
                                </div>
                                <ul className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs md:text-sm text-gray-700">
                                  {meal.ingredients.map((ing, i) => (
                                    <li
                                      key={i}
                                      className="flex items-start gap-1.5"
                                    >
                                      <span className="mt-0.5 text-orange-400">
                                        •
                                      </span>
                                      <span>
                                        {ing.name}
                                        {ing.amount ? `：${ing.amount}` : ''}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                          {Array.isArray(meal.steps) &&
                            meal.steps.length > 0 && (
                              <div className="mb-2">
                                <div className="text-xs font-semibold text-gray-600 mb-1">
                                  制作步骤
                                </div>
                                <ol className="space-y-1.5 text-xs md:text-sm text-gray-700">
                                  {meal.steps.map((step, i) => (
                                    <li key={i} className="flex gap-1.5">
                                      <span className="text-primary-500 font-semibold">
                                        {i + 1}.
                                      </span>
                                      <span className="flex-1">{step}</span>
                                    </li>
                                  ))}
                                </ol>
                              </div>
                            )}

                          {Array.isArray(meal.effects) &&
                            meal.effects.length > 0 && (
                              <div className="mt-1 border-t border-dashed border-emerald-100 pt-2">
                                <div className="text-xs font-semibold text-emerald-700 mb-1 flex items-center gap-1.5">
                                  <span>✨ 功效小贴士</span>
                                </div>
                                <ul className="space-y-1 text-xs md:text-sm text-emerald-800">
                                  {meal.effects.map((eff, i) => (
                                    <li key={i} className="flex gap-1.5">
                                      <span className="mt-0.5 text-emerald-500">
                                        ▪
                                      </span>
                                      <span className="flex-1">{eff}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                        </div>
                      ))}
                  </div>
                </div>
              ))}

              {mealPlanStructured.disclaimer && (
                <div className="mt-2 border border-yellow-200 bg-yellow-50/80 text-xs md:text-sm text-yellow-800 px-4 py-3 rounded-xl">
                  <div className="font-semibold mb-1">医疗免责声明</div>
                  <div className="leading-relaxed">
                    {mealPlanStructured.disclaimer}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="border border-yellow-200 bg-yellow-50/80 rounded-xl px-4 py-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div className="flex-1">
                    <div className="font-semibold text-yellow-800 mb-2">
                      食谱格式解析失败
                    </div>
                    <div className="text-sm text-yellow-700 mb-3">
                      大模型返回的内容无法自动解析为结构化格式。这可能是因为返回格式不符合预期。
                      你可以尝试重新生成，或者查看下方的原始内容。
                    </div>
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm font-medium text-yellow-800 hover:text-yellow-900">
                        查看原始 JSON 内容
                      </summary>
                      <div className="mt-2 border border-yellow-200 rounded-lg bg-white p-3 overflow-x-auto">
                        <pre className="text-xs text-gray-700 whitespace-pre-wrap break-words">
                          {mealPlanRaw}
                        </pre>
                      </div>
                    </details>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default RecipeGenerator
