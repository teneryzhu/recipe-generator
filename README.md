# 🍳 智能食谱生成器

一个现代化的食谱生成网站，可以根据您选择的菜系或输入的食材，为您推荐美味的食谱。

## ✨ 功能特点

- 🎯 **智能推荐**：根据菜系或食材智能匹配食谱
- 🍜 **多种菜系**：支持中餐、西餐、日式、素食等多种菜系
- 📝 **详细步骤**：提供完整的食材清单和制作步骤
- 🎨 **美观界面**：现代化的UI设计，响应式布局
- ⚡ **快速生成**：即时生成食谱推荐

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

在浏览器中打开 `http://localhost:5173` 查看网站。

### 构建生产版本

```bash
npm run build
```

### 预览生产版本

```bash
npm run preview
```

## 🛠️ 技术栈

- **React 18** - 前端框架
- **Vite** - 构建工具
- **Tailwind CSS** - 样式框架
- **JavaScript** - 编程语言

## 📁 项目结构

```
recipe-generator/
├── src/
│   ├── components/
│   │   └── RecipeGenerator.jsx  # 主组件
│   ├── App.jsx                  # 应用入口
│   ├── main.jsx                 # React入口
│   └── index.css                # 全局样式
├── index.html                   # HTML模板
├── package.json                 # 项目配置
├── vite.config.js               # Vite配置
├── tailwind.config.js           # Tailwind配置
└── README.md                    # 项目说明
```

## 🎯 使用方法

1. **选择菜系**：点击您喜欢的菜系按钮（中餐、西餐、日式、素食）
2. **或输入食材**：在文本框中输入您拥有的食材
3. **生成食谱**：点击"生成食谱"按钮
4. **查看详情**：查看生成的食谱，包括食材清单和详细制作步骤

## 🔮 未来计划

- [ ] 集成AI API实现更智能的食谱生成
- [ ] 添加食谱收藏功能
- [ ] 支持自定义食谱创建
- [ ] 添加营养信息显示
- [ ] 支持多语言

## 📄 许可证

MIT License
