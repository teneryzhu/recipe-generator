import React, { useEffect, useState } from 'react'

// 系统提示词：免疫与功能医学营养专家角色
const SYSTEM_PROMPT = `
你是一位拥有20年经验的资深营养师，专精于通过饮食干预改善过敏体质、湿疹、荨麻疹、鼻炎及肠漏综合征。
你善于通过“排除饮食法”和“抗炎饮食”帮助用户修复免疫系统。

【目标】
1. 深度共情，安抚用户情绪并建立信任；
2. 基于用户提供的碎片化信息（症状、环境、情绪）进行全息分析；
3. 生成严格回避过敏源、富含修复营养素的 7 天定制食谱；
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

// 简单 Markdown 渲染：支持 **加粗** 和换行
function renderMarkdown(text) {
  if (!text) return null

  const lines = String(text).split('\n')

  const renderLineWithBold = (line, lineIndex) => {
    const parts = line.split('**')
    if (parts.length === 1) {
      return (
        <span key={lineIndex}>
          {line}
        </span>
      )
    }

    const nodes = parts.map((part, idx) => {
      if (idx % 2 === 1) {
        // 奇数段落视为加粗内容
        return (
          <strong key={`${lineIndex}-b-${idx}`} className="font-semibold">
            {part}
          </strong>
        )
      }
      return <span key={`${lineIndex}-t-${idx}`}>{part}</span>
    })

    return (
      <span key={lineIndex}>
        {nodes}
      </span>
    )
  }

  return (
    <>
      {lines.map((line, idx) => (
        <React.Fragment key={idx}>
          {renderLineWithBold(line, idx)}
          {idx !== lines.length - 1 && <br />}
        </React.Fragment>
      ))}
    </>
  )
}

// 解析食谱文本，去掉可能的代码块并尝试解析 JSON
function parseMealPlanText(planText) {
  if (!planText) return null
  let cleaned = planText.trim()

  // 去掉常见的 ```json ... ``` 代码块包装
  if (cleaned.startsWith('```')) {
    const firstBreak = cleaned.indexOf('\n')
    const lastFence = cleaned.lastIndexOf('```')
    if (firstBreak !== -1 && lastFence !== -1 && lastFence > firstBreak) {
      cleaned = cleaned.slice(firstBreak + 1, lastFence).trim()
    }
  }

  try {
    const parsed = JSON.parse(cleaned)
    if (parsed && Array.isArray(parsed.days)) {
      return parsed
    }
  } catch {
    // ignore
  }
  return null
}

// 调用大模型的通用封装
async function callChatCompletion({ messages, signal }) {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY
  const model = import.meta.env.VITE_OPENAI_MODEL || 'deepseek-chat'
  const baseUrl =
    import.meta.env.VITE_OPENAI_BASE_URL || 'https://api.deepseek.com/v1'

  if (!apiKey) {
    throw new Error('缺少 VITE_OPENAI_API_KEY 配置，请在 .env 中设置。')
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`大模型接口错误：${response.status} ${text}`)
  }

  const data = await response.json()
  const content =
    data.choices?.[0]?.message?.content?.trim() ||
    '抱歉，我这边暂时没有生成出合适的回复，请稍后再试一次。'

  return content
}

function RecipeGenerator() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loadingChat, setLoadingChat] = useState(false)
  const [loadingPlan, setLoadingPlan] = useState(false)
  const [mealPlanRaw, setMealPlanRaw] = useState('')
  const [mealPlanStructured, setMealPlanStructured] = useState(null)
  const [error, setError] = useState('')

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

  // 自动滚动到底部
  useEffect(() => {
    const container = document.getElementById('chat-scroll-container')
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }, [messages])

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

    const newMessages = [
      ...messages,
      { role: 'user', content: input.trim() },
    ]
    setMessages(newMessages)
    setInput('')
    setError('')

    const controller = new AbortController()
    setLoadingChat(true)
    try {
      const reply = await callChatCompletion({
        messages: newMessages,
        signal: controller.signal,
      })
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch (e) {
      console.error(e)
      setError(
        e instanceof Error
          ? e.message
          : '与大模型通信时出错，请稍后再试或检查网络/配置。',
      )
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

      setMealPlanRaw(planText)
      setMealPlanStructured(
        structured && Array.isArray(structured.days) ? structured : null,
      )
      // 对话中不直接展示 JSON；仅提示已生成
      setMessages((prev) =>
        prev.concat({
          role: 'assistant',
          content: '已为你生成 2 天抗炎修复食谱，请查看下方卡片展示。',
        }),
      )
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
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* 头部 */}
      <header className="text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-bold text-primary-600 mb-4">
          🩺 免疫营养聊天顾问 & 智能食谱生成器
        </h1>
        <p className="text-gray-600 text-base md:text-lg max-w-2xl mx-auto">
          先和你的专属免疫营养专家好好聊一聊，深入了解你的症状和生活习惯，再为你定制安全、抗炎、7天修复食谱。
        </p>
      </header>

      {/* 聊天 + 操作区 */}
      <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8 mb-8">
        {/* 聊天记录 */}
        <div
          id="chat-scroll-container"
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
            <div className="border rounded-xl bg-gray-50 px-4 py-4 overflow-x-auto text-sm md:text-base">
              <div className="whitespace-pre-wrap leading-relaxed text-gray-800">
                {mealPlanRaw}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default RecipeGenerator
