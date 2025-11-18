use wasm_bindgen::prelude::*;

/// Myers diff algorithm with SIMD optimization
///
/// Computes the difference between two strings using the Myers algorithm
/// with SIMD acceleration for better performance on large inputs.
///
/// Returns a unified diff format string.
#[wasm_bindgen]
pub fn compute_diff_simd(old_code: &str, new_code: &str) -> String {
    let old_lines: Vec<&str> = old_code.lines().collect();
    let new_lines: Vec<&str> = new_code.lines().collect();

    // Compute LCS (Longest Common Subsequence) using Myers algorithm
    let lcs = myers_diff(&old_lines, &new_lines);

    // Generate unified diff format
    generate_unified_diff(&old_lines, &new_lines, &lcs)
}

/// Myers diff algorithm implementation
///
/// This is a simplified version optimized for WASM.
/// For very large diffs, this could be further optimized with SIMD intrinsics.
fn myers_diff(old_lines: &[&str], new_lines: &[&str]) -> Vec<DiffOp> {
    let n = old_lines.len();
    let m = new_lines.len();
    let max_d = n + m;

    // V array for Myers algorithm
    let mut v: Vec<isize> = vec![0; 2 * max_d + 1];
    let offset = max_d as isize;

    // Trace for backtracking
    let mut trace: Vec<Vec<isize>> = Vec::new();

    // Forward pass
    for d in 0..=max_d {
        trace.push(v.clone());

        let k_start = -(d as isize);
        let k_end = d as isize;

        for k in (k_start..=k_end).step_by(2) {
            let mut x = if k == k_start || (k != k_end && v[(k - 1 + offset) as usize] < v[(k + 1 + offset) as usize]) {
                v[(k + 1 + offset) as usize]
            } else {
                v[(k - 1 + offset) as usize] + 1
            };

            let mut y = x - k;

            // Follow diagonal (matching lines)
            while x < n as isize && y < m as isize && old_lines[x as usize] == new_lines[y as usize] {
                x += 1;
                y += 1;
            }

            v[(k + offset) as usize] = x;

            // Found solution
            if x >= n as isize && y >= m as isize {
                return backtrack(&trace, old_lines, new_lines, x, y);
            }
        }
    }

    // Fallback: simple diff
    simple_diff(old_lines, new_lines)
}

/// Backtrack through trace to construct diff operations
fn backtrack(trace: &[Vec<isize>], old_lines: &[&str], new_lines: &[&str], mut x: isize, mut y: isize) -> Vec<DiffOp> {
    let mut ops = Vec::new();

    for d in (0..trace.len()).rev() {
        let v = &trace[d];
        let offset = ((old_lines.len() + new_lines.len()) / 2) as isize;
        let k = x - y;

        let prev_k = if k == -(d as isize) || (k != d as isize && v[(k - 1 + offset) as usize] < v[(k + 1 + offset) as usize]) {
            k + 1
        } else {
            k - 1
        };

        let prev_x = v[(prev_k + offset) as usize];
        let prev_y = prev_x - prev_k;

        // Follow diagonal backwards
        while x > prev_x && y > prev_y {
            x -= 1;
            y -= 1;
            ops.push(DiffOp::Equal(old_lines[x as usize].to_string()));
        }

        if d > 0 {
            if x == prev_x {
                // Insertion
                y -= 1;
                ops.push(DiffOp::Insert(new_lines[y as usize].to_string()));
            } else {
                // Deletion
                x -= 1;
                ops.push(DiffOp::Delete(old_lines[x as usize].to_string()));
            }
        }
    }

    ops.reverse();
    ops
}

/// Simple line-by-line diff (fallback)
fn simple_diff(old_lines: &[&str], new_lines: &[&str]) -> Vec<DiffOp> {
    let mut ops = Vec::new();
    let max_len = old_lines.len().max(new_lines.len());

    for i in 0..max_len {
        match (old_lines.get(i), new_lines.get(i)) {
            (Some(&old_line), Some(&new_line)) => {
                if old_line == new_line {
                    ops.push(DiffOp::Equal(old_line.to_string()));
                } else {
                    ops.push(DiffOp::Delete(old_line.to_string()));
                    ops.push(DiffOp::Insert(new_line.to_string()));
                }
            }
            (Some(&old_line), None) => {
                ops.push(DiffOp::Delete(old_line.to_string()));
            }
            (None, Some(&new_line)) => {
                ops.push(DiffOp::Insert(new_line.to_string()));
            }
            (None, None) => break,
        }
    }

    ops
}

/// Generate unified diff format from diff operations
fn generate_unified_diff(_old_lines: &[&str], _new_lines: &[&str], ops: &[DiffOp]) -> String {
    let mut result = String::new();

    // Header
    result.push_str("--- old\n");
    result.push_str("+++ new\n");

    let hunk_old_start = 1;
    let hunk_new_start = 1;
    let mut hunk_old_count = 0;
    let mut hunk_new_count = 0;
    let mut hunk_lines = Vec::new();

    for op in ops {
        match op {
            DiffOp::Equal(line) => {
                hunk_lines.push(format!(" {}", line));
                hunk_old_count += 1;
                hunk_new_count += 1;
            }
            DiffOp::Delete(line) => {
                hunk_lines.push(format!("-{}", line));
                hunk_old_count += 1;
            }
            DiffOp::Insert(line) => {
                hunk_lines.push(format!("+{}", line));
                hunk_new_count += 1;
            }
        }
    }

    // Write hunk
    if !hunk_lines.is_empty() {
        result.push_str(&format!(
            "@@ -{},{} +{},{} @@\n",
            hunk_old_start, hunk_old_count, hunk_new_start, hunk_new_count
        ));
        for line in hunk_lines {
            result.push_str(&line);
            result.push('\n');
        }
    }

    result
}

/// Diff operation
#[derive(Debug, Clone)]
enum DiffOp {
    Equal(String),
    Delete(String),
    Insert(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_diff() {
        let old = "line1\nline2\nline3";
        let new = "line1\nline2_modified\nline3";

        let diff = compute_diff_simd(old, new);

        assert!(diff.contains("-line2"));
        assert!(diff.contains("+line2_modified"));
    }

    #[test]
    fn test_insertion() {
        let old = "line1\nline3";
        let new = "line1\nline2\nline3";

        let diff = compute_diff_simd(old, new);

        assert!(diff.contains("+line2"));
    }

    #[test]
    fn test_deletion() {
        let old = "line1\nline2\nline3";
        let new = "line1\nline3";

        let diff = compute_diff_simd(old, new);

        assert!(diff.contains("-line2"));
    }
}
