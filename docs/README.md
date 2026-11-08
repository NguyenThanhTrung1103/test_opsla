# Documentation Map

Start with the smallest authoritative surface.

## Current Product

- `WORKFLOW.md`: request shape, planning, judgment, operation, validation, and
  completion.
- `ARCHITECTURE.md`: current product, code, state, update, and ownership
  boundaries.
- `HARNESS.md`: product principles and installed-core model.
- `product/`: current product behavior and installation contract.
- `decisions/`: lasting choices future work must inherit.
- `plans/`: one durable working-memory document for work that needs it.
- [`patterns/encoding-invariants.md`](patterns/encoding-invariants.md): turn
  accepted architecture, reliability, security, and quality rules into native
  mechanical validation.
- `templates/`: optional decision, plan, runbook, and Harness-improvement
  structures.
- [cookbook/huong-dan-thuc-chien-cookbook.md](cookbook/huong-dan-thuc-chien-cookbook.md): Hướng dẫn thực chiến từng bước cho dự án mới với The Cookbook, Spec Kit và AgentKit.
- [cookbook/07-ket-noi-mcp-antigravity.md](cookbook/07-ket-noi-mcp-antigravity.md): Hướng dẫn kết nối MCP The Cookbook trên Antigravity.
- [cookbook/COOKBOOK_UNIVERSAL_PLAYBOOK.md](cookbook/COOKBOOK_UNIVERSAL_PLAYBOOK.md): Tài liệu chuẩn hóa & bộ prompts thực chiến The Cookbook áp dụng cho mọi dự án.
- [cookbook/TRI_PILLAR_COOKBOOK_INTERACTION.md](cookbook/TRI_PILLAR_COOKBOOK_INTERACTION.md): Cơ chế phối hợp & danh mục kiểm tra của Spec Kit, Harness, g8s qua 5 bước Cookbook.

## Consumer-Owned Truth

The consumer's README, product documents, architecture, code, tests, CI,
runtime signals, and application behavior remain authoritative. Harness does
not overwrite those with upstream product assumptions.

## Source Repository

- Root `README.md`: product overview, installation, maintenance, EOL, and
  development.
- `crates/harness/`: safe core installer/updater.
- `scripts/`: platform bootstrap, release, and validation entrypoints.
- `tests/`: behavior ownership and repository contract.

## History

The former SQLite control plane, protocol v1, story packets, migration evidence,
and compatibility documentation are preserved by Git history and immutable
`harness-cli-v*` tags. They are intentionally absent from the current tree so
search and agent retrieval return current product authority.
