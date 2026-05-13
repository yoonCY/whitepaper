use tracing::{info, warn};
use regex::Regex;

/// Zero-Trust 기반 민감 정보 필터링 및 토큰 최적화 (Context Collapse)
pub struct Guardrail {
    redact_regex: Regex,
}

impl Guardrail {
    pub fn new() -> Self {
        // 실제 운영 시 .env에서 패턴을 로드하여 정규식 컴파일
        Self {
            redact_regex: Regex::new(r"(?i)(password|secret|token|api_key)\s*[:=]\s*['\"][^'\"]+['\"]").unwrap(),
        }
    }

    /// LLM으로 응답을 보내기 전, 민감 데이터를 [REDACTED]로 마스킹
    pub fn apply_redaction(&self, context: &str) -> String {
        let redacted = self.redact_regex.replace_all(context, "$1: [REDACTED]");
        if redacted != context {
            warn!("[Guardrail] Sensitive data detected and redacted before MCP transmission.");
        }
        redacted.to_string()
    }

    /// LLM 컨텍스트 예산 초과 방지용 텍스트 압축 (예: 8,000자 제한)
    pub fn collapse_context(&self, context: &str, max_len: usize) -> String {
        if context.len() > max_len {
            info!("[Guardrail] Context size ({}) exceeds limit ({}). Collapsing...", context.len(), max_len);
            let mut truncated = String::from(&context[0..max_len]);
            truncated.push_str("\n... [Context Collapsed by Guardrail]");
            truncated
        } else {
            context.to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_apply_redaction() {
        let guardrail = Guardrail::new();
        let input = "System config: password='my_super_secret_pw', token=12345";
        
        let redacted = guardrail.apply_redaction(input);
        
        assert!(redacted.contains("password: [REDACTED]"));
        assert!(!redacted.contains("my_super_secret_pw"));
    }

    #[test]
    fn test_context_collapse() {
        let guardrail = Guardrail::new();
        let input = "A".repeat(100);
        
        let collapsed = guardrail.collapse_context(&input, 50);
        
        assert_eq!(collapsed.len(), 50 + "\n... [Context Collapsed by Guardrail]".len());
        assert!(collapsed.ends_with("[Context Collapsed by Guardrail]"));
    }
}
