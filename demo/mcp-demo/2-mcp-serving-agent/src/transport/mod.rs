use tracing::info;

/// MCP 프로토콜 통신 레이어 (Standard I/O 및 SSE 지원)
/// IDE(Cursor, Cline)와 직접 통신하는 역할
pub struct McpTransport {
    pub mode: TransportMode,
}

pub enum TransportMode {
    Stdio,
    Sse(u16), // SSE Port
}

impl McpTransport {
    pub fn new(mode_str: &str) -> Self {
        match mode_str.to_lowercase().as_str() {
            "sse" => Self { mode: TransportMode::Sse(3020) },
            _ => Self { mode: TransportMode::Stdio },
        }
    }

    /// MCP 서버 루프 시작
    pub async fn start_loop(&self) {
        match self.mode {
            TransportMode::Stdio => {
                info!("[Transport] Starting MCP Server in STDIO mode...");
                // rmcp::server::StdioServer::start().await
            }
            TransportMode::Sse(port) => {
                info!("[Transport] Starting MCP Server in SSE mode on port {}...", port);
                // rmcp::server::SseServer::bind(port).await
            }
        }
    }
}
