// 全局配置，可通过环境变量覆盖默认值
// 仅暴露业务相关的配置，保持项目轻量
export const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
// 单次返回的历史记录条数上限
export const RECENT_LIMIT = process.env.RECENT_LIMIT ? Number(process.env.RECENT_LIMIT) : 50;
// 容器短码长度（nanoid 的长度）
export const CONTAINER_CODE_LENGTH = process.env.CONTAINER_CODE_LENGTH ? Number(process.env.CONTAINER_CODE_LENGTH) : 8;
// 容器短码前缀（例如 QR-），便于人工识别；不要放 URL 里需要转义的字符
export const CONTAINER_CODE_PREFIX = process.env.CONTAINER_CODE_PREFIX || '';
// GET /api/containers 的默认 limit
export const CONTAINERS_LIST_DEFAULT_LIMIT = process.env.CONTAINERS_LIST_DEFAULT_LIMIT ? Number(process.env.CONTAINERS_LIST_DEFAULT_LIMIT) : 20;
// GET /api/containers 的 limit 上下限
export const CONTAINERS_LIST_MIN = process.env.CONTAINERS_LIST_MIN ? Number(process.env.CONTAINERS_LIST_MIN) : 1;
export const CONTAINERS_LIST_MAX = process.env.CONTAINERS_LIST_MAX ? Number(process.env.CONTAINERS_LIST_MAX) : 100;
