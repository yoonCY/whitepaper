mod search_engine;
mod scheduler;
mod eval;
mod guardrail;
mod transport;
mod tools;

use eval::harness::run_test_harness;
use eval::model_tuner::ModelTuner;
use scheduler::background_worker::start_background_scheduler;
use search_engine::rrf_fusion::execute_hybrid_search;

use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. 고성능 로깅 초기화
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    info!("🚀 Starting Rust MCP Serving Agent...");

    // 2. 백그라운드 스케줄러 시작 (논블로킹)
    start_background_scheduler().await;

    // 3. 모델/프롬프트 튜너 초기화
    let mut tuner = ModelTuner::new();

    // 4. (Demo) 테스트 하네스 실행 및 JSONL 평가 데이터 적재
    run_test_harness().await;

    // 5. (Demo) 평가 피드백 기반 자동 개선 (Faithfulness나 Precision이 낮다고 가정)
    tuner.tune_based_on_feedback(0.65, 0.75);

    // 6. 실시간 쿼리 서빙 시뮬레이션 (동시성 최적화)
    let query = "Deadlock on payment module password='test'";
    let results = execute_hybrid_search(query).await;

    // 7. 가드레일 (민감 정보 마스킹 및 토큰 압축) 적용
    let guardrail = guardrail::Guardrail::new();
    let safe_content = guardrail.apply_redaction(&results[0].content);
    let collapsed_content = guardrail.collapse_context(&safe_content, 8000);
    
    info!("Hybrid Search returned {} results. First result masked: {}", results.len(), collapsed_content);

    // 8. MCP Server Transport 구동 (IDE와 연결)
    let transport_mode = std::env::var("MCP_TRANSPORT_MODE").unwrap_or_else(|_| "stdio".to_string());
    let mcp_transport = transport::McpTransport::new(&transport_mode);
    mcp_transport.start_loop().await;

    Ok(())
}
