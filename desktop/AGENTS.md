- 如果更改 Drizzle 的 schema，记得生成 migration。
- 桌面端所有选择控件都必须使用 `@/components/ui/native-select`
  的 `NativeSelect` / `NativeSelectOption` / `NativeSelectOptGroup` 实现；
  不要新增或导入 `@/components/ui/select` / Radix `Select`。
- `desktop` 内的包管理器使用 `yarn`，不要改用 `npm`、`pnpm` 或 `bun`。
- 需要对桌面端页面或交互做浏览器验证时，使用 agent-browser。
