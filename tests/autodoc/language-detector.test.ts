import { describe, expect, it } from "bun:test";
import {
  aggregateLanguageDetection,
  detectLanguageFromCode,
  detectLanguageFromComments,
  detectLanguageFromText,
} from "../../src/autodoc/i18n/language-detector.js";

describe("language-detector", () => {
  describe("detectLanguageFromText", () => {
    it("detects Russian from Cyrillic text", () => {
      const result = detectLanguageFromText("Это русский текст для тестирования");
      expect(result.language).toBe("ru");
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("detects Chinese from CJK characters", () => {
      const result = detectLanguageFromText("这是一个中文测试文本");
      expect(result.language).toBe("zh");
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("defaults to English for Latin text", () => {
      const result = detectLanguageFromText("This is English text for testing");
      expect(result.language).toBe("en");
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("returns zero confidence for empty text", () => {
      const result = detectLanguageFromText("");
      expect(result.confidence).toBe(0);
    });

    it("handles mixed content with dominant language", () => {
      const result = detectLanguageFromText("Здесь русский текст with some English");
      expect(result.language).toBe("ru");
    });
  });

  describe("detectLanguageFromComments", () => {
    it("analyzes multiple comments", () => {
      const comments = ["Проверка пользователя", "Валидация данных", "Сохранение в базу"];
      const result = detectLanguageFromComments(comments);
      expect(result.language).toBe("ru");
    });

    it("handles empty comments array", () => {
      const result = detectLanguageFromComments([]);
      expect(result.confidence).toBe(0);
    });
  });

  describe("detectLanguageFromCode", () => {
    it("extracts and analyzes TypeScript comments", () => {
      const code = `
        // Главная функция приложения
        function main() {
          /* Многострочный комментарий
             на русском языке */
          return true;
        }
      `;
      const result = detectLanguageFromCode(code, ".ts");
      expect(result.language).toBe("ru");
    });

    it("extracts Python comments and docstrings", () => {
      const code = `
        # Инициализация модуля
        def init():
            """
            Функция инициализации.
            Возвращает True при успехе.
            """
            pass
      `;
      const result = detectLanguageFromCode(code, ".py");
      expect(result.language).toBe("ru");
    });

    it("returns low confidence for code without comments", () => {
      const code = "function test() { return 42; }";
      const result = detectLanguageFromCode(code, ".ts");
      expect(result.confidence).toBe(0);
    });
  });

  describe("aggregateLanguageDetection", () => {
    it("aggregates multiple detection results", () => {
      const results = [
        detectLanguageFromText("Русский текст"),
        detectLanguageFromText("More Russian: ещё текст"),
        detectLanguageFromText("Some English"),
      ];
      const aggregated = aggregateLanguageDetection(results);

      // Should detect Russian as dominant
      expect(aggregated.language).toBe("ru");
    });

    it("handles empty results array", () => {
      const aggregated = aggregateLanguageDetection([]);
      expect(aggregated.confidence).toBe(0);
    });
  });
});
