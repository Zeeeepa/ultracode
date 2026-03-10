# cuVS — потенциальная замена FAISS GPU

## Статус: ожидание

NVIDIA cuVS (https://github.com/rapidsai/cuvs) — векторный поиск нового поколения,
официальная замена faiss-gpu в экосистеме RAPIDS.

## Что даёт cuVS

- **CAGRA** — граф-based алгоритм, быстрее HNSW на GPU
- IVF-Flat, IVF-PQ с оптимизациями под современные GPU
- Spectral Clustering/Embedding
- Активная разработка (релизы каждые 2 месяца)

## Что блокирует миграцию (проверено v26.02.00, февраль 2025)

- **Нет Windows** — явно указано "Linux-only pre-compiled packages"
- **Нет Node.js / N-API bindings** — есть только C, Python, Java, Rust
- **Нет npm-пакета**

## Имеющиеся биндинги

| Язык   | Статус       | Примечание                    |
|--------|--------------|-------------------------------|
| C API  | стабильный   | основа для всех биндингов     |
| Python | стабильный   | полное покрытие               |
| Java   | активный     | Panama API (JDK 22+)         |
| Rust   | начальный    | vamana index                  |
| Go     | упоминается  | в билд-инструкциях            |
| Node.js| нет          | —                             |

## Когда пересмотреть

Следующая проверка: сентябрь 2026
Проверять релизы раз в ~6 месяцев:
- https://github.com/rapidsai/cuvs/releases

Критерии для миграции:
1. Windows-поддержка (или WSL2 как официальный путь)
2. C API достаточно стабилен для написания N-API addon
3. Размер бинарников сопоставим или меньше текущего FAISS (77 MB faiss.dll)

## Текущее решение

Native FAISS addon (`ultracode_cuda.node`) — работает на Windows + Linux,
поддерживает IVF/HNSW/SQ/PQ, GPU через CUDA. См. `external-tools/native/cuda/`.
