# QContainer

## 简介
QContainer 是一套基于 Node.js + Express + SQLite 的轻量级容器二维码管理系统。二维码只包含一个短码，所有产品信息都存储在后端，扫描后即可随时写入/读取最新数据，并保留历史。

## 目录结构
```
├── server.js            # 业务服务入口
├── config/
│   ├── fields.js        # 默认字段定义与校验
│   └── index.js         # 全局可配置项
├── public/
│   ├── view.html        # 扫码后展示页面
│   └── fields.html      # 字段配置页面（管理端）
├── package.json
├── db.sqlite            # SQLite 数据库（首次运行自动创建）
└── README.md
```

## 安装与运行
```bash
# 1. 安装 Node.js（建议使用 nvm）
# 2. 安装依赖
npm install
# 3. 运行服务
npm start
```
默认监听 3000 端口，支持环境变量覆盖：
- `PORT`：监听端口
- `RECENT_LIMIT`：单次返回的历史记录条数
- `CONTAINER_CODE_LENGTH`：短码长度
- `CONTAINER_CODE_PREFIX`：短码前缀
- `CONTAINERS_LIST_DEFAULT_LIMIT` / `CONTAINERS_LIST_MIN` / `CONTAINERS_LIST_MAX`：容器列表分页参数

## 主要 API
| 路径 | 方法 | 描述 |
|------|------|------|
| /api/fields | GET | 获取当前字段定义 |
| /api/fields | PUT | 替换字段定义 |
| /api/fields/defaults | GET | 获取默认字段定义 |
| /api/server | GET | 获取可访问的基础 URL |
| /api/containers | POST | 创建容器（生成短码） |
| /api/containers | GET | 列表（最近创建） |
| /api/containers/:code | GET | 读取容器状态（最新 + 历史） |
| /api/containers/:code/records | POST | 写入记录 |
| /q/:code | GET | 扫码后打开的页面 |

## 前端页面
- `fields.html`：字段配置、默认恢复、字段校验错误提示
- `view.html`：扫码后展示最新记录，可直接编辑并保存回后端

## 开发与维护
- 所有业务配置均可在 `config/index.js` 或通过环境变量覆盖。
- 若需新增字段类型或更改字段校验逻辑，直接修改 `config/fields.js`。
- 在生产环境建议使用 HTTPS 与 auth 进行访问控制。

## 许可
MIT License
