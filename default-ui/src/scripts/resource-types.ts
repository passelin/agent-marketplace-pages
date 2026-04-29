export const RESOURCE_TYPES = {
  plugin:      { icon: "🔌", label: "Plugin",      labelPlural: "Plugins",      color: "#7c3aed", href: "plugins/"      },
  agent:       { icon: "🤖", label: "Agent",       labelPlural: "Agents",       color: "#2563eb", href: "agents/"       },
  instruction: { icon: "📋", label: "Instruction", labelPlural: "Instructions", color: "#0891b2", href: "instructions/" },
  skill:       { icon: "⚡", label: "Skill",       labelPlural: "Skills",       color: "#ca8a04", href: "skills/"       },
  hook:        { icon: "🪝", label: "Hook",        labelPlural: "Hooks",        color: "#c2410c", href: "hooks/"        },
  workflow:    { icon: "⚙️",  label: "Workflow",    labelPlural: "Workflows",    color: "#15803d", href: "workflows/"    },
} as const;

export type ResourceType = keyof typeof RESOURCE_TYPES;

export function getTypeMeta(type: string) {
  return (RESOURCE_TYPES as Record<string, (typeof RESOURCE_TYPES)[ResourceType]>)[type]
    ?? { icon: "📦", label: type, labelPlural: type, color: "#888", href: "#" };
}
