---
name: 200lab-diagram-director
description: Generate architectural C4 diagrams, sequence flows, data-flow models, and interactive Mermaid diagrams based on 200Lab System Design visualization standards. Activate when the user mentions architecture diagram, sequence diagram, system visualization, data flow chart, or runs /200lab-diagram-director or $200lab-diagram-director.
---

# 200Lab Diagram Director

Synthesize clear, verifiable system architecture diagrams, sequence workflows, and component boundaries derived from real codebase evidence using 200Lab visualization conventions.

## Scope & Security Boundaries

- **HANDLES**: Generating Mermaid.js v11 diagrams, C4 container models, and sequence charts based on existing code structure.
- **DOES NOT HANDLE**: Fabricating imagined services, speculative microservices, or modifying repository code.
- **SECURITY**: Exclude internal IP addresses, secret environment keys, and credentials from diagram labels.

---

## Execution Workflow

### Step 1: Query 200Lab MCP Visualization Standards
- Query `skill_find(query="diagram-director")` or `ai_tutor(question="What are the best practices for C4 component diagrams and sequence diagrams in system architecture reviews?")`.

### Step 2: Extract Actual System Architecture
Read existing code to discover:
- Client layer (Web UI, API clients)
- Service layer (controllers, business logic)
- Storage / Database layer (in-memory, relational DBs, caches)
- External integrations (payment gateways, third-party APIs)

### Step 3: Author Mermaid Diagrams
Generate syntactically valid Mermaid.js diagrams using:
1. **C4 Container / Component Diagram**:
   ```mermaid
   graph TD
       Client["Client (Browser)"] --> Server["API Gateway / Node Server"]
       Server --> Service["Order Service"]
       Service --> DB[("Storage Layer")]
   ```
2. **Transactional Sequence Flow**:
   ```mermaid
   sequenceDiagram
       autonumber
       actor User
       participant UI as Web Client
       participant API as API Server
       participant DB as Database
       User->>UI: Submit Order
       UI->>API: POST /api/orders (Idempotency-Key)
       API->>DB: Check & Deduct Stock
       DB-->>API: Stock Confirmed
       API-->>UI: 201 Created (Order ID)
   ```

### Step 4: Verification
Ensure every entity in the diagram maps to a verified file or module in the codebase.
