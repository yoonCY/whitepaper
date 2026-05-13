use serde_json::{json, Value};
use tracing::info;

/// Cursor 등 외부 에이전트에게 노출할 Tool 인터페이스 정의
pub struct ToolRegistry {
    tools: Vec<String>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self {
            tools: vec![
                "search_corporate_knowledge".to_string(),
                "get_jira_ticket".to_string(),
            ],
        }
    }

    /// MCP `ListTools` 요청 처리
    pub fn list_tools(&self) -> Value {
        info!("[Tools] Listing registered MCP tools to IDE.");
        json!({
            "tools": [
                {
                    "name": "search_corporate_knowledge",
                    "description": "사내 지식베이스(Jira, Wiki, 레거시 코드) 하이브리드 검색",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "query": { "type": "string", "description": "검색어" }
                        },
                        "required": ["query"]
                    }
                }
            ]
        })
    }
}
