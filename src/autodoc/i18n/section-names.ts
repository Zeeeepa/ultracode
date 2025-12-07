/**
 * Localized Section Names for AutoDoc
 *
 * Provides section titles in multiple languages (en, ru, zh).
 * Used for documentation templates and UI.
 *
 * Architecture References:
 * - Types: src/autodoc/types.ts
 * - RFC: docs/design/documentation-layer-rfc.md
 */

import type { DocEntityType, DocLanguage } from "../types.js";

/**
 * Section name translations
 */
export const SECTION_NAMES: Record<DocLanguage, Record<string, string>> = {
  en: {
    // Common sections
    overview: "Overview",
    architecture: "Architecture",
    getting_started: "Getting Started",
    installation: "Installation",
    usage: "Usage",
    configuration: "Configuration",
    api_reference: "API Reference",
    examples: "Examples",
    troubleshooting: "Troubleshooting",
    faq: "FAQ",
    changelog: "Changelog",
    contributing: "Contributing",
    license: "License",

    // Entity-level sections
    role_in_system: "Role in System",
    public_api: "Public API",
    dependencies: "Dependencies",
    dependents: "Dependents",
    implementation_details: "Implementation Details",
    usage_examples: "Usage Examples",
    edge_cases: "Edge Cases",
    testing: "Testing",
    performance: "Performance",
    security: "Security",

    // Flow/Process sections
    participants: "Participants",
    preconditions: "Preconditions",
    postconditions: "Postconditions",
    happy_path: "Happy Path",
    error_handling: "Error Handling",
    sequence_diagram: "Sequence Diagram",

    // Module sections
    module_overview: "Module Overview",
    exports: "Exports",
    internal_structure: "Internal Structure",
    related_modules: "Related Modules",
  },
  ru: {
    // Common sections
    overview: "Обзор",
    architecture: "Архитектура",
    getting_started: "Быстрый старт",
    installation: "Установка",
    usage: "Использование",
    configuration: "Конфигурация",
    api_reference: "Справочник API",
    examples: "Примеры",
    troubleshooting: "Устранение проблем",
    faq: "Часто задаваемые вопросы",
    changelog: "История изменений",
    contributing: "Участие в разработке",
    license: "Лицензия",

    // Entity-level sections
    role_in_system: "Роль в системе",
    public_api: "Публичный API",
    dependencies: "Зависимости",
    dependents: "Зависимые компоненты",
    implementation_details: "Детали реализации",
    usage_examples: "Примеры использования",
    edge_cases: "Граничные случаи",
    testing: "Тестирование",
    performance: "Производительность",
    security: "Безопасность",

    // Flow/Process sections
    participants: "Участники",
    preconditions: "Предусловия",
    postconditions: "Постусловия",
    happy_path: "Основной сценарий",
    error_handling: "Обработка ошибок",
    sequence_diagram: "Диаграмма последовательности",

    // Module sections
    module_overview: "Обзор модуля",
    exports: "Экспорты",
    internal_structure: "Внутренняя структура",
    related_modules: "Связанные модули",
  },
  zh: {
    // Common sections
    overview: "概述",
    architecture: "架构",
    getting_started: "快速开始",
    installation: "安装",
    usage: "使用方法",
    configuration: "配置",
    api_reference: "API 参考",
    examples: "示例",
    troubleshooting: "故障排除",
    faq: "常见问题",
    changelog: "更新日志",
    contributing: "贡献指南",
    license: "许可证",

    // Entity-level sections
    role_in_system: "系统角色",
    public_api: "公共 API",
    dependencies: "依赖项",
    dependents: "被依赖项",
    implementation_details: "实现细节",
    usage_examples: "使用示例",
    edge_cases: "边界情况",
    testing: "测试",
    performance: "性能",
    security: "安全性",

    // Flow/Process sections
    participants: "参与者",
    preconditions: "前置条件",
    postconditions: "后置条件",
    happy_path: "正常流程",
    error_handling: "错误处理",
    sequence_diagram: "序列图",

    // Module sections
    module_overview: "模块概述",
    exports: "导出",
    internal_structure: "内部结构",
    related_modules: "相关模块",
  },
};

/**
 * Document type names by language
 */
export const DOC_TYPE_NAMES: Record<DocLanguage, Record<DocEntityType, string>> = {
  en: {
    architecture: "Architecture",
    flow: "Flow",
    process: "Process",
    dependency: "Dependency",
    deployment: "Deployment",
    glossary: "Glossary",
    module_index: "Module Index",
    entity_doc: "Entity Documentation",
    section: "Section",
  },
  ru: {
    architecture: "Архитектура",
    flow: "Сценарий",
    process: "Процесс",
    dependency: "Зависимость",
    deployment: "Развёртывание",
    glossary: "Глоссарий",
    module_index: "Индекс модуля",
    entity_doc: "Документация сущности",
    section: "Раздел",
  },
  zh: {
    architecture: "架构",
    flow: "流程",
    process: "处理过程",
    dependency: "依赖",
    deployment: "部署",
    glossary: "术语表",
    module_index: "模块索引",
    entity_doc: "实体文档",
    section: "章节",
  },
};

/**
 * Get localized section name
 */
export function getSectionName(key: string, language: DocLanguage = "en"): string {
  return SECTION_NAMES[language][key] ?? SECTION_NAMES.en[key] ?? key;
}

/**
 * Get localized document type name
 */
export function getDocTypeName(type: DocEntityType, language: DocLanguage = "en"): string {
  return DOC_TYPE_NAMES[language][type] ?? DOC_TYPE_NAMES.en[type] ?? type;
}

/**
 * Get all section names for a language
 */
export function getAllSectionNames(language: DocLanguage = "en"): Record<string, string> {
  return { ...SECTION_NAMES.en, ...SECTION_NAMES[language] };
}

/**
 * Find section key by localized name (reverse lookup)
 */
export function findSectionKey(localizedName: string): string | null {
  const normalizedName = localizedName.toLowerCase().trim();

  for (const [_lang, sections] of Object.entries(SECTION_NAMES)) {
    for (const [key, name] of Object.entries(sections)) {
      if (name.toLowerCase() === normalizedName) {
        return key;
      }
    }
  }

  return null;
}

/**
 * Template placeholders by language
 */
export const TEMPLATE_PLACEHOLDERS: Record<DocLanguage, Record<string, string>> = {
  en: {
    todo: "TODO: Fill in this section",
    brief_description: "Brief description here...",
    detailed_description: "Detailed description here...",
    example_code: "// Example code here",
    no_dependencies: "No dependencies",
    no_dependents: "No dependents",
  },
  ru: {
    todo: "TODO: Заполните этот раздел",
    brief_description: "Краткое описание...",
    detailed_description: "Подробное описание...",
    example_code: "// Пример кода",
    no_dependencies: "Нет зависимостей",
    no_dependents: "Нет зависимых компонентов",
  },
  zh: {
    todo: "TODO: 填写此部分",
    brief_description: "简要描述...",
    detailed_description: "详细描述...",
    example_code: "// 示例代码",
    no_dependencies: "无依赖",
    no_dependents: "无被依赖项",
  },
};

/**
 * Get template placeholder
 */
export function getPlaceholder(key: string, language: DocLanguage = "en"): string {
  return TEMPLATE_PLACEHOLDERS[language][key] ?? TEMPLATE_PLACEHOLDERS.en[key] ?? key;
}
