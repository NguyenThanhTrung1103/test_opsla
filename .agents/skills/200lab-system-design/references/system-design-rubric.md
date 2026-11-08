# 200Lab System Design Rubric & Evaluation Dimensions

## Dimension 1: Modularity & Component Boundaries
- **High Cohesion, Low Coupling**: Domain logic must reside in dedicated service layers, decoupled from transport (HTTP/gRPC/CLI).
- **Interface Segregation**: Public APIs must expose contract interfaces, preventing callers from accessing private state.
- **Dependency Inversion**: High-level modules should depend on abstractions, not concrete database drivers.

## Dimension 2: Persistence & Storage Evolution
- **Data Integrity**: Storage operations that modify multiple entities must use atomic transactions or two-phase commits.
- **Concurrency Control**: State machines must implement optimistic locking (version column) or pessimistic row locks to prevent lost updates.
- **Storage Tiering**: Transition path from in-memory / local storage (e.g. IndexedDB, SQLite) to production relational / document databases.

## Dimension 3: Caching & Read Optimization
- **Cache Aside / Read-Through**: Cache hot entities with deterministic TTLs.
- **Cache Invalidation**: Event-driven cache purging on mutations to eliminate stale reads.
- **Stampede Prevention**: Mutex locks or probabilistic early expiration for expensive queries.

## Dimension 4: Scalability & Async Decoupling
- **Non-blocking I/O**: Heavy operations (PDF generation, notifications, exports) must be offloaded to background task queues.
- **Stateless Application Servers**: Session state maintained in distributed caches or client tokens to allow horizontal scaling.

## Dimension 5: Single Points of Failure (SPOF)
- **Circuit Breaking**: Graceful degradation when external dependencies fail.
- **Health Checks & Telemetry**: Observable liveness and readiness endpoints.
