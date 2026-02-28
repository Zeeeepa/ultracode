namespace UltraCode.CSharp.Tools.Services;

public record ClassSimilarityResult(
    List<ClassSemanticFeatures> SimilarClasses,
    double AverageSimilarityScore
);
